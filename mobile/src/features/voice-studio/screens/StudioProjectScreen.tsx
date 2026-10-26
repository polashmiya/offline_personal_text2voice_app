import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, Divider, ProgressBar, SectionHeader } from '../../../components/ui/primitives';
import { confirmDialog, showToast } from '../../../components/ui/overlays';
import { useErrorText } from '../../../components/common/useErrorText';
import { toAppError } from '../../../services/native/errors';
import { FileBridge, VoiceRecorder } from '../../../services/native';
import { paths } from '../../../services/storage/paths';
import { localizeDigits } from '../../../i18n';
import { formatBytes } from '../../../utils/format';
import { spacing } from '../../../theme/tokens';
import { datasetStats, STYLE_MIN_TAKES, TARGET_MINUTES, type DatasetStats } from '../../../domain/voice-dataset/dataset';
import { assessRoom, type RoomVerdict } from '../../../domain/voice-dataset/quality';
import { promptsFor, STYLE_ORDER, type StyleKey } from '../prompts';
import { studioRepo, type VoiceProject } from '../services/studioRepo';
import { exportDataset } from '../services/datasetExport';
import { ensureMicPermission } from '../services/micPermission';

type Props = NativeStackScreenProps<RootStackParamList, 'StudioProject'>;

const minutes = (ms: number) => localizeDigits((ms / 60000).toFixed(1));

export function StudioProjectScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { projectId } = route.params;
  const [project, setProject] = useState<VoiceProject | null>(null);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [room, setRoom] = useState<{ verdict: RoomVerdict; db: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const p = await studioRepo.getProject(projectId);
        const recs = await studioRepo.recordings(projectId);
        if (alive) {
          setProject(p);
          setStats(datasetStats(recs));
        }
      })();
      return () => {
        alive = false;
      };
    }, [projectId]),
  );

  useEffect(() => {
    navigation.setOptions({ title: project?.name ?? '' });
  }, [navigation, project?.name]);

  if (!project || !stats) {
    return <Screen topInset={false}>{null}</Screen>;
  }

  const micCheck = async () => {
    setError(null);
    const permission = await ensureMicPermission();
    if (permission !== 'granted') {
      setMicBlocked(permission === 'blocked');
      setError(t('studio.micDenied'));
      return;
    }
    setChecking(true);
    try {
      const result = await VoiceRecorder.measureNoise(3000);
      setRoom({ verdict: assessRoom(result.noiseDb), db: Math.round(result.noiseDb) });
    } catch (e) {
      setError(errorText(toAppError(e, 'recording_failed')));
    } finally {
      setChecking(false);
    }
  };

  const doExport = async (kind: 'save' | 'share') => {
    setBusy(kind);
    setError(null);
    let out: string | null = null;
    try {
      const result = await exportDataset(project);
      out = result.path;
      if (kind === 'save') {
        const uri = await FileBridge.saveToUserLocation(result.path, result.fileName, 'application/zip');
        if (uri) {
          showToast(`${t('studio.exportDone')} · ${formatBytes(result.sizeBytes)}`, 'success');
        }
      } else {
        await FileBridge.shareFile(result.path, 'application/zip', result.fileName);
      }
    } catch (e) {
      setError(errorText(toAppError(e, 'export_failed')));
    } finally {
      if (out && kind === 'save') {
        FileBridge.deletePath(out).catch(() => undefined);
      }
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: t('studio.deleteTitle', { name: project.name }),
      body: t('studio.deleteBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    await studioRepo.deleteProject(project.id);
    await FileBridge.deletePath(paths().studioDir(project.id)).catch(() => undefined);
    navigation.goBack();
  };

  const left = Math.max(0, TARGET_MINUTES.minimum - stats.speechMs / 60000);
  const progress = stats.speechMs / (TARGET_MINUTES.recommended * 60000);
  const natural = stats.byStyle.natural?.count ?? 0;
  const naturalTotal = promptsFor('natural').length;

  const styleRow = (style: StyleKey) => {
    const count = stats.byStyle[style]?.count ?? 0;
    const total = promptsFor(style).length;
    const status =
      count >= STYLE_MIN_TAKES
        ? t('studio.styleWillTrain')
        : t('studio.styleNeedsMore', { n: localizeDigits(String(STYLE_MIN_TAKES - count)) });
    return (
      <View key={style} style={styles.styleRow}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t(`studio.styles.${style}`)}</AppText>
          <AppText variant="small" tone="muted">
            {t(`studio.styleHints.${style}`)}
          </AppText>
          <AppText variant="caption" tone={count >= STYLE_MIN_TAKES ? 'success' : 'faint'}>
            {localizeDigits(`${count} / ${total}`)} · {status}
          </AppText>
        </View>
        <Button
          compact
          kind="secondary"
          icon="mic"
          label={count > 0 ? t('studio.continue') : t('studio.record')}
          onPress={() => navigation.navigate('RecordSession', { projectId, style })}
        />
      </View>
    );
  };

  return (
    <Screen topInset={false}>
      <Card>
        <AppText variant="heading">{t('studio.progressTitle')}</AppText>
        <AppText variant="title">{t('studio.minutesRecorded', { minutes: minutes(stats.speechMs) })}</AppText>
        <ProgressBar value={progress} label={t('studio.progressTitle')} />
        <AppText tone={stats.readiness === 'not_ready' ? 'muted' : 'success'}>
          {t(`studio.readiness.${stats.readiness}`, { left: localizeDigits(left.toFixed(1)) })}
        </AppText>
        <AppText variant="small" tone="muted">
          {t('studio.takes', { n: localizeDigits(String(stats.takeCount)) })}
        </AppText>
      </Card>

      <Card>
        <Button
          kind="secondary"
          icon="wave"
          label={checking ? t('studio.micChecking') : t('studio.micCheck')}
          loading={checking}
          disabled={checking}
          onPress={micCheck}
        />
        {room ? (
          <AppText tone={room.verdict === 'noisy' ? 'danger' : room.verdict === 'ok' ? 'warning' : 'success'}>
            {t(`studio.room.${room.verdict}`, { db: localizeDigits(String(room.db)) })}
          </AppText>
        ) : null}
      </Card>

      {error ? (
        <Banner
          tone="error"
          text={error}
          action={
            micBlocked ? <Button compact kind="ghost" label={t('studio.openSettings')} onPress={() => Linking.openSettings()} /> : undefined
          }
        />
      ) : null}

      <SectionHeader title={t('studio.natural')} />
      <Card>
        <AppText variant="small" tone="muted">
          {t('studio.naturalBody')}
        </AppText>
        <ProgressBar value={natural / naturalTotal} label={t('studio.natural')} />
        <AppText variant="caption" tone="faint">
          {localizeDigits(`${natural} / ${naturalTotal}`)}
        </AppText>
        <Button
          icon="mic"
          label={natural > 0 ? t('studio.continue') : t('studio.record')}
          onPress={() => navigation.navigate('RecordSession', { projectId, style: 'natural' })}
        />
      </Card>

      <SectionHeader title={t('studio.stylePacks')} />
      <Card>
        <AppText variant="small" tone="muted">
          {t('studio.stylePacksBody', { min: localizeDigits(String(STYLE_MIN_TAKES)) })}
        </AppText>
        {STYLE_ORDER.filter(s => s !== 'natural').map((style, i) => (
          <React.Fragment key={style}>
            {i > 0 ? <Divider /> : null}
            {styleRow(style)}
          </React.Fragment>
        ))}
      </Card>

      <SectionHeader title={t('studio.exportTitle')} />
      <Card>
        <AppText variant="small" tone="muted">
          {t('studio.exportBody')}
        </AppText>
        {stats.takeCount === 0 ? (
          <AppText tone="muted">{t('studio.exportEmpty')}</AppText>
        ) : stats.readiness === 'not_ready' ? (
          <AppText tone="warning">
            {t('studio.exportNotReady', {
              minutes: minutes(stats.speechMs),
              min: localizeDigits(String(TARGET_MINUTES.minimum)),
            })}
          </AppText>
        ) : null}
        <Button
          icon="download"
          label={busy === 'save' ? t('studio.exporting') : t('studio.exportSave')}
          loading={busy === 'save'}
          disabled={!!busy || stats.takeCount === 0}
          onPress={() => doExport('save')}
        />
        <Button
          kind="secondary"
          icon="share"
          label={busy === 'share' ? t('studio.exporting') : t('studio.exportShare')}
          loading={busy === 'share'}
          disabled={!!busy || stats.takeCount === 0}
          onPress={() => doExport('share')}
        />
      </Card>

      <Button kind="secondary" icon="book" label={t('studio.trainingGuide')} onPress={() => navigation.navigate('TrainingGuide')} />
      <Button kind="danger" icon="trash" label={t('studio.deleteProject')} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  styleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
