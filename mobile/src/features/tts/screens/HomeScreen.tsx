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
import { ReadAlong } from '../../audio-studio/player/ReadAlong';
import { useErrorText } from '../../../components/common/useErrorText';
import { localizeDigits } from '../../../i18n';
import { projectsRepo } from '../../../services/db/repositories';
import { newId } from '../../../utils/id';
import { spacing } from '../../../theme/tokens';
import { textStats } from '../../../domain/text/estimate';
import { usePlayer } from '../../audio-studio/player/playerStore';
import { buildSynthesisPlan } from '../../../domain/text/pipeline';
import { dominantLanguage } from '../../../domain/text/segmenter';
import { textCapabilities } from '../../model-manager/services/voiceRuntime';
import type { LanguageMode, VoiceProfile } from '../../../domain/types';

const LONG_TEXT_SECONDS = 600;

function canRead(voice: VoiceProfile, text: string, mode: LanguageMode): boolean {
  const plan = buildSynthesisPlan({ text, mode, voice: textCapabilities(voice) });
  return plan.ok || plan.error.code !== 'unsupported_language';
}

/**
 * The voice to generate with: the chosen one when it can read the text,
 * otherwise an installed voice that can (one made for the text's main
 * language first), so Bangla text never ends on an English-only voice.
 */
function voiceForText(chosen: VoiceProfile, voices: VoiceProfile[], text: string, mode: LanguageMode): VoiceProfile {
  if (canRead(chosen, text, mode)) {
    return chosen;
  }
  const readers = voices.filter(v => v.id !== chosen.id && canRead(v, text, mode));
  const main = mode === 'bn' || mode === 'banglish' ? 'bn' : mode === 'en' ? 'en' : dominantLanguage(text);
  return readers.find(v => v.languages[0] === main) ?? readers[0] ?? chosen;
}

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const errorText = useErrorText();
  const editor = useEditor();
  const voices = useVoices(s => s.voices);
  const prefs = usePreferences();
  const { running, progress, lastOutcome, start, cancel, clearOutcome } = useGeneration();
  const [lastError, setLastError] = useState<string | null>(null);

  const voice = voices.find(v => v.id === editor.voiceId);

  // Pick a usable voice when none (or a deleted one) is selected: the default
  // voice, else one in the app's language (a Bangla voice for a Bangla UI).
  useEffect(() => {
    if (!voice && voices.length) {
      const appLanguage = i18n.language.startsWith('bn') ? 'bn' : 'en';
      const preferred =
        voices.find(v => v.id === prefs.defaultVoiceId) ??
        voices.find(v => v.languages[0] === appLanguage) ??
        voices[0];
      useEditor.getState().update({ voiceId: preferred.id, styleKey: preferred.styles[0]?.key ?? null });
    }
  }, [voice, voices, prefs.defaultVoiceId, i18n.language]);

  const longText = textStats(editor.text, editor.speed).estimatedSeconds > LONG_TEXT_SECONDS;

  const generate = async () => {
    if (!voice) {
      return;
    }
    const chosen = voice;
    const voiceToUse = voiceForText(chosen, voices, editor.text, editor.language);
    if (voiceToUse.id !== chosen.id) {
      useEditor.getState().update({ voiceId: voiceToUse.id, styleKey: voiceToUse.styles[0]?.key ?? null });
      showToast(t('home.switchedVoice', { name: voiceToUse.name }), 'info');
    }
    const styleKey = voiceToUse.id === chosen.id ? editor.styleKey : voiceToUse.styles[0]?.key ?? null;
    setLastError(null);
    clearOutcome();
    await usePlayer.getState().unload();
    const outcome = await start({
      text: editor.text,
      language: editor.language,
      voice: voiceToUse,
      styleKey,
      speed: voiceToUse.supportsSpeed ? editor.speed : 1,
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
          <ReadAlong path={lastOutcome.audioPath} text={lastOutcome.text} timeline={lastOutcome.timeline} />
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
