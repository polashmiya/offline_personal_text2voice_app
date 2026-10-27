import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Banner, Button, Card, ChoiceChips, Divider, ToggleRow } from '../../../components/ui/primitives';
import { confirmDialog, showToast } from '../../../components/ui/overlays';
import { useErrorText } from '../../../components/common/useErrorText';
import { musicRepo, type MusicTrack } from '../../../services/db/repositories';
import {
  DUCK_AMOUNTS,
  FADE_TIMES,
  MUSIC_VOLUMES,
  PAD_TIMES,
  TRIM_TIMES,
  VOICE_VOLUMES,
  type MixSettings,
} from '../../../domain/audio/mix';
import { localizeDigits } from '../../../i18n';
import { formatClock } from '../../../utils/format';
import { spacing } from '../../../theme/tokens';
import { deleteMusic, importMusic } from '../music/musicLibrary';

type Props = {
  value: MixSettings;
  onChange: (next: MixSettings) => void;
  disabled?: boolean;
};

const NONE = '__none__';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

/** Background music + voice processing controls (spec §36–39). Pure settings; rendering happens on export/preview. */
export function MusicMixCard({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof MixSettings>(key: K, v: MixSettings[K]) => onChange({ ...value, [key]: v });

  const reload = useCallback(async () => {
    const list = await musicRepo.list();
    setTracks(list);
    return list;
  }, []);

  useEffect(() => {
    reload().then(list => {
      // A remembered track may have been deleted since.
      if (value.musicTrackId && !list.some(tr => tr.id === value.musicTrackId)) {
        onChange({ ...value, musicTrackId: null });
      }
    });
    // Only on mount: later changes come from this card itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onImport = async () => {
    setImporting(true);
    setError(null);
    const result = await importMusic();
    setImporting(false);
    if (result.status === 'imported') {
      await reload();
      onChange({ ...value, musicTrackId: result.track.id });
      showToast(t('mixer.imported'), 'success');
    } else if (result.status === 'failed') {
      setError(errorText(result.error));
    }
  };

  const selected = tracks?.find(tr => tr.id === value.musicTrackId) ?? null;

  const onDelete = async () => {
    if (!selected) {
      return;
    }
    const ok = await confirmDialog({
      title: t('mixer.deleteTrackTitle', { name: selected.name }),
      body: t('mixer.deleteTrackBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    await deleteMusic(selected);
    onChange({ ...value, musicTrackId: null });
    await reload();
  };

  const seconds = (ms: number) => (ms === 0 ? t('common.off') : t('mixer.seconds', { n: localizeDigits(String(ms / 1000)) }));
  const millis = (ms: number) => (ms === 0 ? t('common.off') : t('mixer.ms', { n: localizeDigits(String(ms)) }));
  const percent = (v: number) => t('mixer.percent', { n: localizeDigits(String(Math.round(v * 100))) });

  const hasMusic = !!selected;

  return (
    <Card>
      <AppText variant="title">{t('mixer.title')}</AppText>

      {tracks && tracks.length === 0 ? (
        <AppText variant="small" tone="muted">
          {t('mixer.libraryEmpty')}
        </AppText>
      ) : (
        <ChoiceChips
          label={t('mixer.title')}
          value={value.musicTrackId ?? NONE}
          onChange={id => set('musicTrackId', id === NONE ? null : id)}
          options={[
            { value: NONE, label: t('mixer.none'), disabled },
            ...(tracks ?? []).map(tr => ({
              value: tr.id,
              label: `${tr.name} · ${formatClock(tr.durationMs)}`,
              disabled,
            })),
          ]}
        />
      )}
      <View style={styles.actions}>
        <Button
          compact
          kind="secondary"
          icon="music"
          label={importing ? t('mixer.importing') : t('mixer.importMusic')}
          loading={importing}
          disabled={disabled || importing}
          onPress={onImport}
        />
        {selected?.source === 'user' ? (
          <Button compact kind="ghost" icon="trash" label={t('mixer.deleteTrack')} disabled={disabled} onPress={onDelete} />
        ) : null}
      </View>
      <AppText variant="caption" tone="faint">
        {t('mixer.rightsNote')}
      </AppText>
      {error ? <Banner tone="error" text={error} /> : null}

      <Field label={t('mixer.voiceVolume')}>
        <ChoiceChips
          label={t('mixer.voiceVolume')}
          value={value.voiceVolume}
          onChange={v => set('voiceVolume', v)}
          options={VOICE_VOLUMES.map(v => ({ value: v, label: percent(v), disabled }))}
        />
      </Field>

      {hasMusic ? (
        <>
          <Field label={t('mixer.musicVolume')}>
            <ChoiceChips
              label={t('mixer.musicVolume')}
              value={value.musicVolume}
              onChange={v => set('musicVolume', v)}
              options={MUSIC_VOLUMES.map(v => ({ value: v, label: percent(v), disabled }))}
            />
          </Field>
          <ToggleRow title={t('mixer.loop')} subtitle={t('mixer.loopHint')} value={value.loopMusic} onChange={v => set('loopMusic', v)} />
          <Divider />
          <ToggleRow
            title={t('mixer.autoDuck')}
            subtitle={t('mixer.autoDuckHint')}
            value={value.autoDuck}
            onChange={v => set('autoDuck', v)}
          />
          <Field label={t('mixer.fadeIn')}>
            <ChoiceChips
              label={t('mixer.fadeIn')}
              value={value.musicFadeInMs}
              onChange={v => set('musicFadeInMs', v)}
              options={FADE_TIMES.map(v => ({ value: v, label: seconds(v), disabled }))}
            />
          </Field>
          <Field label={t('mixer.fadeOut')}>
            <ChoiceChips
              label={t('mixer.fadeOut')}
              value={value.musicFadeOutMs}
              onChange={v => set('musicFadeOutMs', v)}
              options={FADE_TIMES.map(v => ({ value: v, label: seconds(v), disabled }))}
            />
          </Field>
        </>
      ) : null}

      <ToggleRow title={t('mixer.advanced')} value={advanced} onChange={setAdvanced} />
      {advanced ? (
        <>
          {hasMusic && value.autoDuck ? (
            <Field label={t('mixer.duckAmount')}>
              <ChoiceChips
                label={t('mixer.duckAmount')}
                value={value.duckDb}
                onChange={v => set('duckDb', v)}
                options={DUCK_AMOUNTS.map(v => ({ value: v, label: t('mixer.db', { n: localizeDigits(String(v)) }), disabled }))}
              />
            </Field>
          ) : null}
          <Field label={t('mixer.trimStart')}>
            <ChoiceChips
              label={t('mixer.trimStart')}
              value={value.trimStartMs}
              onChange={v => set('trimStartMs', v)}
              options={TRIM_TIMES.map(v => ({ value: v, label: millis(v), disabled }))}
            />
          </Field>
          <Field label={t('mixer.trimEnd')}>
            <ChoiceChips
              label={t('mixer.trimEnd')}
              value={value.trimEndMs}
              onChange={v => set('trimEndMs', v)}
              options={TRIM_TIMES.map(v => ({ value: v, label: millis(v), disabled }))}
            />
          </Field>
          <Field label={t('mixer.padStart')}>
            <ChoiceChips
              label={t('mixer.padStart')}
              value={value.padStartMs}
              onChange={v => set('padStartMs', v)}
              options={PAD_TIMES.map(v => ({ value: v, label: seconds(v), disabled }))}
            />
          </Field>
          <Field label={t('mixer.padEnd')}>
            <ChoiceChips
              label={t('mixer.padEnd')}
              value={value.padEndMs}
              onChange={v => set('padEndMs', v)}
              options={PAD_TIMES.map(v => ({ value: v, label: seconds(v), disabled }))}
            />
          </Field>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
