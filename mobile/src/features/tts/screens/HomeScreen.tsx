import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../components/layout/Screen';
import { AppText, Banner, Button, Card, ProgressBar } from '../../../components/ui/primitives';
import { promptDialog, showToast } from '../../../components/ui/overlays';
import { TextEditorCard } from '../components/TextEditorCard';
import { VoiceOptions } from '../components/VoiceOptions';
import { useEditor } from '../store/editorStore';
import { useGeneration } from '../store/generationStore';
import { useVoices } from '../../../store/voicesStore';
import { usePreferences } from '../../../store/preferencesStore';
import { PlayerCard } from '../../audio-studio/player/PlayerCard';
import { useErrorText } from '../../../components/common/useErrorText';
import { localizeDigits } from '../../../i18n';
import { projectsRepo } from '../../../services/db/repositories';
import { newId } from '../../../utils/id';
import { spacing } from '../../../theme/tokens';
import { textStats } from '../../../domain/text/estimate';
import { usePlayer } from '../../audio-studio/player/playerStore';

const LONG_TEXT_SECONDS = 600;

export function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const errorText = useErrorText();
  const editor = useEditor();
  const voices = useVoices(s => s.voices);
  const prefs = usePreferences();
  const { running, progress, lastOutcome, start, cancel, clearOutcome } = useGeneration();
  const [lastError, setLastError] = useState<string | null>(null);

  const voice = voices.find(v => v.id === editor.voiceId);

  // Pick a usable voice when none (or a deleted one) is selected.
  useEffect(() => {
    if (!voice && voices.length) {
      const preferred = voices.find(v => v.id === prefs.defaultVoiceId) ?? voices[0];
      useEditor.getState().update({ voiceId: preferred.id, styleKey: preferred.styles[0]?.key ?? null });
    }
  }, [voice, voices, prefs.defaultVoiceId]);

  const longText = textStats(editor.text, editor.speed).estimatedSeconds > LONG_TEXT_SECONDS;

  const generate = async () => {
    if (!voice) {
      return;
    }
    setLastError(null);
    clearOutcome();
    await usePlayer.getState().unload();
    const outcome = await start({
      text: editor.text,
      language: editor.language,
      voice,
      styleKey: editor.styleKey,
      speed: voice.supportsSpeed ? editor.speed : 1,
      projectId: editor.projectId,
      title: editor.title || editor.text.trim().slice(0, 40).replace(/\s+/g, ' ') || t('common.untitled'),
      normalize: prefs.normalizeAudio,
      keepScreenAwake: prefs.keepScreenAwake,
      notificationTitle: t('home.notificationTitle'),
      notificationText: (current, total) =>
        t('home.notificationText', { current: localizeDigits(String(current)), total: localizeDigits(String(total)) }),
    });
    if (outcome.status === 'failed') {
      setLastError(errorText(outcome.error, outcome.unsupportedLanguages));
    } else if (outcome.status === 'cancelled') {
      showToast(t('home.cancelled'));
    }
  };

  const saveProject = async () => {
    const title = await promptDialog({
      title: t('home.saveProject'),
      initial: editor.title || editor.text.trim().slice(0, 40),
      confirmLabel: t('common.save'),
    });
    if (!title) {
      return;
    }
    const id = editor.projectId ?? newId('prj_');
    await projectsRepo.save({
      id,
      title,
      text: editor.text,
      settings: { voiceId: editor.voiceId, language: editor.language, styleKey: editor.styleKey, speed: editor.speed },
    });
    useEditor.getState().update({ projectId: id, title });
    showToast(t('home.projectSaved'), 'success');
  };

  const status = progress?.status;
  const statusLabel =
    status === 'preparing' ? t('home.preparing') : status === 'mixing' ? t('home.mixing') : t('home.generating');

  return (
    <Screen title={t('home.title')}>
      <TextEditorCard editable={!running} />
      <VoiceOptions disabled={running} />

      {longText && !running ? <Banner tone="info" text={t('home.textTooLong')} /> : null}
      {lastError ? <Banner tone="error" text={lastError} /> : null}

      {running ? (
        <Card>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {statusLabel}
          </AppText>
          {progress && progress.totalChunks > 0 ? (
            <AppText tone="muted">
              {t('home.progressParts', {
                current: localizeDigits(String(progress.currentChunk)),
                total: localizeDigits(String(progress.totalChunks)),
              })}{' '}
              · {localizeDigits(`${Math.round(progress.progress * 100)}%`)}
            </AppText>
          ) : null}
          <ProgressBar value={progress?.progress ?? 0} label={statusLabel} />
          <Button kind="secondary" icon="close" label={t('home.cancelGeneration')} onPress={cancel} />
        </Card>
      ) : (
        <View style={styles.actions}>
          <Button
            icon="wave"
            label={t('home.generate')}
            onPress={generate}
            disabled={!voice || !editor.text.trim()}
            style={styles.flex}
          />
          <Button
            kind="secondary"
            icon="folder"
            label={t('home.saveProject')}
            onPress={saveProject}
            disabled={!editor.text.trim()}
            compact
          />
        </View>
      )}

      {lastOutcome?.status === 'completed' && !running ? (
        <View style={styles.result}>
          <AppText variant="heading">{t('home.ready')}</AppText>
          <PlayerCard path={lastOutcome.audioPath} />
          <Button
            icon="download"
            label={t('common.export')}
            onPress={() => navigation.navigate('Export', { generationId: lastOutcome.generationId })}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  result: { gap: spacing.md },
});
