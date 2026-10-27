import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, ChoiceChips, TextField } from '../../../components/ui/primitives';
import { showToast } from '../../../components/ui/overlays';
import { AudioTools, FileBridge } from '../../../services/native';
import { exportsRepo, generationsRepo, musicRepo, type Generation } from '../../../services/db/repositories';
import {
  BITRATES,
  defaultFileName,
  estimateSize,
  FORMAT_INFO,
  withExtension,
} from '../../../domain/export/fileName';
import type { ExportFormat } from '../../../domain/types';
import { usePreferences } from '../../../store/preferencesStore';
import { paths } from '../../../services/storage/paths';
import { formatBytes } from '../../../utils/format';
import { localizeDigits } from '../../../i18n';
import { useErrorText } from '../../../components/common/useErrorText';
import { toAppError } from '../../../services/native/errors';
import { newId } from '../../../utils/id';
import { spacing } from '../../../theme/tokens';
import { logger } from '../../../services/logging/logger';
import {
  buildMixRequest,
  mixedDurationMs,
  MUSIC_MIX_RATE,
  needsMix,
  trimTooLong,
  type MixSettings,
} from '../../../domain/audio/mix';
import { AppException } from '../../../services/native/errors';
import { MusicMixCard } from '../mixer/MusicMixCard';
import { PlayerCard } from '../player/PlayerCard';
import { usePlayer } from '../player/playerStore';
import { formatClock } from '../../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Export'>;

const SAMPLE_RATES = [0, 22050, 44100, 48000];

export function ExportScreen({ route }: Props) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const prefs = usePreferences();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [format, setFormat] = useState<ExportFormat>(prefs.defaultExportFormat);
  const [bitrate, setBitrate] = useState(prefs.defaultBitrate);
  const [sampleRate, setSampleRate] = useState(0);
  const [name, setName] = useState(defaultFileName());
  const [tagTitle, setTagTitle] = useState('');
  const [tagArtist, setTagArtist] = useState(prefs.exportArtist);
  // Trim is specific to one recording, so it is never carried over.
  const [mix, setMix] = useState<MixSettings>(() => ({ ...prefs.mixSettings, trimStartMs: 0, trimEndMs: 0 }));
  const [busy, setBusy] = useState<'save' | 'share' | 'preview' | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generationsRepo.get(route.params.generationId).then(g => {
      setGeneration(g);
      setTagTitle(g?.title ?? '');
    });
    AudioTools.getSupportedExportFormats().then(list => {
      const supported = list.filter((f): f is ExportFormat => f in FORMAT_INFO);
      setFormats(supported);
      setFormat(current => (supported.includes(current) ? current : supported[0] ?? 'wav'));
    });
  }, [route.params.generationId]);

  const discardPreview = async () => {
    const old = previewRef.current;
    previewRef.current = null;
    setPreviewPath(null);
    if (old) {
      if (usePlayer.getState().path === old) {
        await usePlayer.getState().unload().catch(() => undefined);
      }
      await FileBridge.deletePath(old).catch(() => undefined);
    }
  };

  // Previews are temporary: drop them when leaving the screen.
  useEffect(
    () => () => {
      discardPreview();
    },
    [],
  );

  const changeMix = (next: MixSettings) => {
    setMix(next);
    discardPreview();
    usePreferences.getState().set('mixSettings', { ...next, trimStartMs: 0, trimEndMs: 0 });
  };

  const info = FORMAT_INFO[format];
  const mixing = needsMix(mix);
  const voiceMs = generation?.durationMs ?? 0;
  const tooMuchTrim = mixing && trimTooLong(voiceMs, mix);
  const sourceRate = mix.musicTrackId ? MUSIC_MIX_RATE : generation?.sampleRate ?? 22050;
  const finalMs = mixedDurationMs(voiceMs, mix);
  const estimated = useMemo(
    () => estimateSize(finalMs / 1000, format, bitrate, sampleRate || sourceRate),
    [finalMs, format, bitrate, sampleRate, sourceRate],
  );

  /** Renders voice + music to a temporary WAV. Returns null when no mix is needed. */
  const renderMix = async (outputPath: string): Promise<string | null> => {
    if (!generation?.audioPath || !needsMix(mix)) {
      return null;
    }
    let musicPath: string | null = null;
    if (mix.musicTrackId) {
      const track = await musicRepo.get(mix.musicTrackId);
      if (!track || !(await FileBridge.exists(track.filePath))) {
        throw new AppException('invalid_audio_file', 'Music file missing');
      }
      musicPath = track.filePath;
    }
    await FileBridge.mkdirs(paths().mix);
    const result = await AudioTools.mixAudio(
      buildMixRequest({
        settings: mix,
        voicePath: generation.audioPath,
        musicPath,
        outputPath,
        normalize: prefs.normalizeAudio,
      }),
    );
    logger.info('mix.done', { music: !!musicPath, durationMs: result.durationMs, peak: result.peak });
    return result.outputPath;
  };

  const preview = async () => {
    setBusy('preview');
    setError(null);
    try {
      await discardPreview();
      const path = await renderMix(`${paths().mix}/${newId('preview_')}.wav`);
      previewRef.current = path;
      setPreviewPath(path);
    } catch (e) {
      setError(errorText(toAppError(e, 'export_failed')));
    } finally {
      setBusy(null);
    }
  };

  const runExport = async (): Promise<{ path: string; fileName: string } | null> => {
    if (!generation?.audioPath) {
      return null;
    }
    const fileName = withExtension(name, format);
    const outputPath = `${paths().exports}/${newId('exp_')}_${fileName}`;
    await FileBridge.mkdirs(paths().exports);
    const mixPath = await renderMix(`${paths().mix}/${newId('mix_')}.wav`);
    let result;
    try {
      result = await AudioTools.exportAudio({
        inputPath: mixPath ?? generation.audioPath,
        outputPath,
        format,
        bitrateKbps: info.lossy ? bitrate : 0,
        sampleRate,
        title: info.tags ? tagTitle.trim() : '',
        artist: info.tags ? tagArtist.trim() : '',
        comment: '',
      });
    } finally {
      if (mixPath) {
        FileBridge.deletePath(mixPath).catch(() => undefined);
      }
    }
    await exportsRepo.add({
      id: newId('exp_'),
      generationId: generation.id,
      format,
      bitrate: info.lossy ? bitrate : null,
      fileName,
      filePath: result.outputPath,
      sizeBytes: result.sizeBytes,
    });
    logger.info('export.done', { format, bytes: result.sizeBytes, mixed: !!mixPath });
    return { path: result.outputPath, fileName };
  };

  const act = async (kind: 'save' | 'share') => {
    if (tooMuchTrim) {
      return;
    }
    setBusy(kind);
    setError(null);
    let exported: { path: string; fileName: string } | null = null;
    try {
      exported = await runExport();
      if (!exported) {
        return;
      }
      if (kind === 'save') {
        const uri = await FileBridge.saveToUserLocation(exported.path, exported.fileName, info.mime);
        if (uri) {
          showToast(t('export.saved'), 'success');
        }
      } else {
        await FileBridge.shareFile(exported.path, info.mime, exported.fileName);
      }
      usePreferences.getState().set('defaultExportFormat', format);
      if (info.lossy) {
        usePreferences.getState().set('defaultBitrate', bitrate);
      }
      if (info.tags) {
        usePreferences.getState().set('exportArtist', tagArtist.trim());
      }
    } catch (e) {
      setError(errorText(toAppError(e, 'export_failed')));
    } finally {
      // The saved copy now lives where the user chose; keep shared files until the next cleanup.
      if (exported && kind === 'save') {
        FileBridge.deletePath(exported.path).catch(() => undefined);
      }
      setBusy(null);
    }
  };

  if (!generation) {
    return <Screen topInset={false}>{null}</Screen>;
  }

  const exportDisabled = !!busy || !generation.audioPath || tooMuchTrim;
  const exportLabel = (kind: 'save' | 'share') =>
    busy === kind
      ? mixing
        ? t('export.mixing')
        : t('export.exporting')
      : kind === 'save'
      ? t('export.saveToDevice')
      : t('export.share');

  return (
    <Screen topInset={false}>
      <MusicMixCard value={mix} onChange={changeMix} disabled={!!busy} />
      {tooMuchTrim ? <Banner tone="warning" text={t('mixer.trimTooLong')} /> : null}
      {mixing ? (
        <>
          <AppText tone="muted">{t('mixer.length', { time: formatClock(finalMs) })}</AppText>
          <Button
            kind="secondary"
            icon="play"
            label={busy === 'preview' ? t('mixer.rendering') : t('mixer.preview')}
            loading={busy === 'preview'}
            disabled={exportDisabled}
            onPress={preview}
          />
          {previewPath ? <PlayerCard path={previewPath} /> : null}
        </>
      ) : null}

      <Card>
        <TextField label={t('export.fileName')} value={name} onChangeText={setName} maxLength={100} autoCorrect={false} />
        <View style={styles.group}>
          <AppText variant="small" tone="muted">
            {t('export.format')}
          </AppText>
          <ChoiceChips
            label={t('export.format')}
            value={format}
            onChange={setFormat}
            options={formats.map(f => ({ value: f, label: FORMAT_INFO[f].label }))}
          />
          <AppText variant="caption" tone="faint">
            {t('export.unavailableFormats')}
          </AppText>
        </View>
        {info.lossy ? (
          <View style={styles.group}>
            <AppText variant="small" tone="muted">
              {t('export.quality')}
            </AppText>
            <ChoiceChips
              label={t('export.quality')}
              value={bitrate}
              onChange={setBitrate}
              options={BITRATES.map(b => ({ value: b, label: localizeDigits(`${b} kbps`) }))}
            />
          </View>
        ) : (
          <AppText variant="small" tone="muted">
            {t('export.lossless')}
          </AppText>
        )}
        <View style={styles.group}>
          <AppText variant="small" tone="muted">
            {t('export.sampleRate')}
          </AppText>
          <ChoiceChips
            label={t('export.sampleRate')}
            value={sampleRate}
            onChange={setSampleRate}
            options={SAMPLE_RATES.filter(r => r !== sourceRate).map(r => ({
              value: r,
              label: r === 0 ? t('export.original', { rate: localizeDigits(String(sourceRate)) }) : localizeDigits(`${r} Hz`),
            }))}
          />
        </View>
        <AppText>{t('export.estimatedSize', { size: formatBytes(estimated) })}</AppText>
        {info.tags ? (
          <>
            <TextField label={t('export.tagTitle')} value={tagTitle} onChangeText={setTagTitle} maxLength={200} />
            <TextField
              label={t('export.tagArtist')}
              value={tagArtist}
              onChangeText={setTagArtist}
              maxLength={200}
              hint={t('export.tagsHint')}
            />
          </>
        ) : (
          <AppText variant="small" tone="faint">
            {t('export.noTags', { format: info.label })}
          </AppText>
        )}
      </Card>

      {error ? <Banner tone="error" text={error} /> : null}

      <Button
        icon="download"
        label={exportLabel('save')}
        loading={busy === 'save'}
        disabled={exportDisabled}
        onPress={() => act('save')}
      />
      <Button
        kind="secondary"
        icon="share"
        label={exportLabel('share')}
        loading={busy === 'share'}
        disabled={exportDisabled}
        onPress={() => act('share')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
