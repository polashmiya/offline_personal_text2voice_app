import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, ChoiceChips, TextField } from '../../../components/ui/primitives';
import { showToast } from '../../../components/ui/overlays';
import { AudioTools, FileBridge } from '../../../services/native';
import { exportsRepo, generationsRepo, type Generation } from '../../../services/db/repositories';
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
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generationsRepo.get(route.params.generationId).then(setGeneration);
    AudioTools.getSupportedExportFormats().then(list => {
      const supported = list.filter((f): f is ExportFormat => f in FORMAT_INFO);
      setFormats(supported);
      setFormat(current => (supported.includes(current) ? current : supported[0] ?? 'wav'));
    });
  }, [route.params.generationId]);

  const info = FORMAT_INFO[format];
  const sourceRate = generation?.sampleRate ?? 22050;
  const estimated = useMemo(
    () => estimateSize((generation?.durationMs ?? 0) / 1000, format, bitrate, sampleRate || sourceRate),
    [generation, format, bitrate, sampleRate, sourceRate],
  );

  const runExport = async (): Promise<{ path: string; fileName: string } | null> => {
    if (!generation?.audioPath) {
      return null;
    }
    const fileName = withExtension(name, format);
    const outputPath = `${paths().exports}/${newId('exp_')}_${fileName}`;
    await FileBridge.mkdirs(paths().exports);
    const result = await AudioTools.exportAudio({
      inputPath: generation.audioPath,
      outputPath,
      format,
      bitrateKbps: info.lossy ? bitrate : 0,
      sampleRate,
    });
    await exportsRepo.add({
      id: newId('exp_'),
      generationId: generation.id,
      format,
      bitrate: info.lossy ? bitrate : null,
      fileName,
      filePath: result.outputPath,
      sizeBytes: result.sizeBytes,
    });
    logger.info('export.done', { format, bytes: result.sizeBytes });
    return { path: result.outputPath, fileName };
  };

  const act = async (kind: 'save' | 'share') => {
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

  return (
    <Screen topInset={false}>
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
        <View style={styles.row}>
          <AppText tone="faint" style={styles.flex}>
            {t('export.metadataNote')}
          </AppText>
          <AppText variant="caption" tone="faint">
            {t('common.comingSoon')}
          </AppText>
        </View>
      </Card>

      {error ? <Banner tone="error" text={error} /> : null}

      <Button
        icon="download"
        label={busy === 'save' ? t('export.exporting') : t('export.saveToDevice')}
        loading={busy === 'save'}
        disabled={!!busy || !generation.audioPath}
        onPress={() => act('save')}
      />
      <Button
        kind="secondary"
        icon="share"
        label={busy === 'share' ? t('export.exporting') : t('export.share')}
        loading={busy === 'share'}
        disabled={!!busy || !generation.audioPath}
        onPress={() => act('share')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
