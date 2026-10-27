import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card } from '../../../components/ui/primitives';
import { Icon } from '../../../components/ui/Icon';
import { useTheme } from '../../../theme/ThemeProvider';
import { spacing } from '../../../theme/tokens';
import { localizeDigits } from '../../../i18n';
import { formatClock } from '../../../utils/format';
import { useErrorText } from '../../../components/common/useErrorText';
import { toAppError } from '../../../services/native/errors';
import { FileBridge, VoiceRecorder, type TakeAnalysis } from '../../../services/native';
import { paths } from '../../../services/storage/paths';
import { logger } from '../../../services/logging/logger';
import { newId } from '../../../utils/id';
import { assessTake, type TakeReport } from '../../../domain/voice-dataset/quality';
import { usePlayer } from '../../audio-studio/player/playerStore';
import { promptsFor } from '../prompts';
import { studioRepo, type Recording } from '../services/studioRepo';
import { ensureMicPermission } from '../services/micPermission';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordSession'>;

const MAX_TAKE_MS = 30000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'analysing' }
  | { kind: 'review'; path: string; analysis: TakeAnalysis; report: TakeReport; saved: boolean };

function LevelMeter({ levelDb, peakDb }: { levelDb: number; peakDb: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, (levelDb + 60) / 60));
  const color = peakDb > -1 ? colors.danger : peakDb > -6 ? colors.warning : colors.success;
  return (
    <View style={[styles.meter, { backgroundColor: colors.surfaceAlt }]} accessibilityElementsHidden>
      <View style={[styles.meterFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function RecordSessionScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const errorText = useErrorText();
  const { projectId, style } = route.params;
  const prompts = useMemo(() => promptsFor(style), [style]);
  const [recorded, setRecorded] = useState<Map<string, Recording>>(new Map());
  const [index, setIndex] = useState<number | null>(null);
  const [phase, setPhaseState] = useState<Phase>({ kind: 'idle' });
  // The ref must change together with the state: handlers that run right after
  // a setPhase (e.g. keep → goTo → discardUnsaved) read the ref, not the render.
  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const [level, setLevel] = useState({ levelDb: -96, peakDb: -96, elapsedMs: 0 });
  const [error, setError] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const poller = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPath = useRef<string | null>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const player = usePlayer();

  const reload = useCallback(async () => {
    const recs = await studioRepo.recordings(projectId);
    const map = new Map(recs.filter(r => r.style === style).map(r => [r.promptId, r]));
    setRecorded(map);
    return map;
  }, [projectId, style]);

  // Start at the first sentence not recorded yet.
  useEffect(() => {
    reload().then(map => {
      const first = prompts.findIndex(p => !map.has(p.id));
      setIndex(first < 0 ? 0 : first);
    });
  }, [reload, prompts]);

  useEffect(() => {
    navigation.setOptions({ title: t('studio.sessionTitle', { style: t(`studio.styles.${style}`) }) });
  }, [navigation, style, t]);

  const stopPolling = () => {
    if (poller.current) {
      clearInterval(poller.current);
      poller.current = null;
    }
  };

  // Leaving the screen never leaves the microphone open.
  useEffect(() => {
    FileBridge.keepScreenOn(true);
    return () => {
      stopPolling();
      FileBridge.keepScreenOn(false);
      if (phaseRef.current.kind === 'recording') {
        VoiceRecorder.cancel().catch(() => undefined);
      }
      const p = phaseRef.current;
      if (p.kind === 'review' && !p.saved) {
        FileBridge.deletePath(p.path).catch(() => undefined);
      }
      usePlayer.getState().pause().catch(() => undefined);
    };
  }, []);

  if (index === null) {
    return <Screen topInset={false}>{null}</Screen>;
  }
  const prompt = prompts[index];
  const existing = recorded.get(prompt.id);

  const discardUnsaved = async () => {
    const p = phaseRef.current;
    if (p.kind === 'review' && !p.saved) {
      if (usePlayer.getState().path === p.path) {
        await usePlayer.getState().unload();
      }
      await FileBridge.deletePath(p.path).catch(() => undefined);
    }
  };

  const save = async (path: string, analysis: TakeAnalysis, report: TakeReport) => {
    const replaced = await studioRepo.saveRecording({
      id: newId('rec_'),
      projectId,
      promptId: prompt.id,
      style,
      category: prompt.category,
      text: prompt.text,
      filePath: path,
      durationMs: analysis.durationMs,
      speechMs: analysis.speechMs,
      sampleRate: analysis.sampleRate,
      verdict: report.verdict,
      issues: report.issues,
    });
    if (replaced) {
      if (usePlayer.getState().path === replaced) {
        await usePlayer.getState().unload();
      }
      FileBridge.deletePath(replaced).catch(() => undefined);
    }
    await reload();
  };

  const stop = async () => {
    stopPolling();
    setPhase({ kind: 'analysing' });
    try {
      const analysis = await VoiceRecorder.stop();
      const path = currentPath.current!;
      const report = assessTake(analysis, prompt.text);
      logger.info('studio.take', { verdict: report.verdict, issues: report.issues.join(','), ms: analysis.speechMs });
      if (report.verdict === 'good') {
        await save(path, analysis, report);
      }
      setPhase({ kind: 'review', path, analysis, report, saved: report.verdict === 'good' });
    } catch (e) {
      setError(errorText(toAppError(e, 'recording_failed')));
      setPhase({ kind: 'idle' });
    }
  };

  const start = async () => {
    setError(null);
    const permission = await ensureMicPermission();
    if (permission !== 'granted') {
      setMicBlocked(permission === 'blocked');
      setError(t('studio.micDenied'));
      return;
    }
    await discardUnsaved();
    await usePlayer.getState().pause().catch(() => undefined);
    const dir = `${paths().studioDir(projectId)}/takes`;
    const path = `${dir}/${prompt.id}_${Date.now()}.wav`;
    try {
      await FileBridge.mkdirs(dir);
      await VoiceRecorder.start(path, MAX_TAKE_MS);
      currentPath.current = path;
      setPhase({ kind: 'recording' });
      setLevel({ levelDb: -96, peakDb: -96, elapsedMs: 0 });
      poller.current = setInterval(() => {
        const l = VoiceRecorder.getLevel();
        setLevel({ levelDb: l.levelDb, peakDb: l.peakDb, elapsedMs: l.elapsedMs });
        if (l.autoStopped) {
          stop();
        }
      }, 80);
    } catch (e) {
      setError(errorText(toAppError(e, 'recording_failed')));
    }
  };

  const keep = async () => {
    if (phase.kind !== 'review') {
      return;
    }
    await save(phase.path, phase.analysis, phase.report);
    setPhase({ ...phase, saved: true });
    goTo(index + 1);
  };

  const goTo = async (next: number) => {
    if (next < 0 || next >= prompts.length) {
      return;
    }
    await discardUnsaved();
    setPhase({ kind: 'idle' });
    setIndex(next);
  };

  const playPath = phase.kind === 'review' ? phase.path : existing?.filePath;
  const playing = player.playing && player.path === playPath;
  const togglePlay = async () => {
    if (!playPath) {
      return;
    }
    if (await usePlayer.getState().load(playPath)) {
      if (!usePlayer.getState().playing) {
        await usePlayer.getState().restart();
      } else {
        await usePlayer.getState().pause();
      }
    }
  };

  const recording = phase.kind === 'recording';
  const allDone = recorded.size >= prompts.length;
  const verdictTone = (v: TakeReport['verdict']) => (v === 'good' ? 'success' : v === 'warn' ? 'warning' : 'error');

  return (
    <Screen topInset={false}>
      <AppText variant="small" tone="muted">
        {t('studio.promptOf', {
          index: localizeDigits(String(index + 1)),
          total: localizeDigits(String(prompts.length)),
        })}
        {existing ? ` · ${t('studio.recorded')}` : ''}
      </AppText>

      <Card>
        <AppText variant="caption" tone="faint">
          {t('studio.readThis')}
        </AppText>
        <AppText variant="editor" style={styles.prompt} selectable>
          {prompt.text}
        </AppText>
        <AppText variant="small" tone="muted">
          {t(`studio.styleHints.${style}`)}
        </AppText>
      </Card>

      <View style={styles.recordArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? t('studio.tapToStop') : t('studio.tapToRecord')}
          disabled={phase.kind === 'analysing'}
          onPress={recording ? stop : start}
          style={[styles.recordButton, { backgroundColor: recording ? colors.danger : colors.accent }]}>
          <Icon name={recording ? 'close' : 'mic'} color={colors.accentText} size={36} />
        </Pressable>
        <AppText tone="muted">
          {phase.kind === 'analysing'
            ? t('studio.analysing')
            : recording
            ? `${t('studio.tapToStop')} · ${localizeDigits(formatClock(level.elapsedMs))}`
            : t('studio.tapToRecord')}
        </AppText>
        {recording ? <LevelMeter levelDb={level.levelDb} peakDb={level.peakDb} /> : null}
        {phase.kind === 'idle' ? (
          <AppText variant="small" tone="faint" style={styles.center}>
            {t('studio.tip')}
          </AppText>
        ) : null}
      </View>

      {phase.kind === 'review' ? (
        <Banner
          tone={verdictTone(phase.report.verdict)}
          text={[t(`studio.verdict.${phase.report.verdict}`), ...phase.report.issues.map(i => `• ${t(`studio.issues.${i}`)}`)].join('\n')}
        />
      ) : null}

      {error ? (
        <Banner
          tone="error"
          text={error}
          action={
            micBlocked ? <Button compact kind="ghost" label={t('studio.openSettings')} onPress={() => Linking.openSettings()} /> : undefined
          }
        />
      ) : null}

      {allDone && phase.kind === 'idle' ? <Banner tone="success" text={t('studio.allDone')} /> : null}

      {playPath && !recording && phase.kind !== 'analysing' ? (
        <Button kind="secondary" icon={playing ? 'pause' : 'play'} label={playing ? t('studio.stopPlay') : t('studio.playTake')} onPress={togglePlay} />
      ) : null}
      {phase.kind === 'review' && phase.report.verdict === 'warn' && !phase.saved ? (
        <Button icon="check" label={t('studio.keep')} onPress={keep} />
      ) : null}

      <View style={styles.navRow}>
        <Button
          compact
          kind="ghost"
          icon="back"
          label={t('studio.previous')}
          disabled={recording || index === 0}
          onPress={() => goTo(index - 1)}
          style={styles.flex}
        />
        <Button
          compact
          kind={phase.kind === 'review' && phase.saved ? 'primary' : 'ghost'}
          icon="forward"
          label={t('studio.next')}
          disabled={recording || index >= prompts.length - 1}
          onPress={() => goTo(index + 1)}
          style={styles.flex}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { fontSize: 22, lineHeight: 36 },
  recordArea: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  recordButton: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  meter: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden' },
  meterFill: { height: 10, borderRadius: 5 },
  navRow: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
