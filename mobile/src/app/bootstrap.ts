import { initDatabase } from '../services/db/database';
import { usePreferences } from '../store/preferencesStore';
import { useVoices } from '../store/voicesStore';
import { applyUiLanguage } from '../i18n';
import { recoverInterruptedJobs } from '../features/tts/services/generationService';
import { readDraft, useEditor } from '../features/tts/store/editorStore';
import { logger } from '../services/logging/logger';

export type BootResult = { showOnboarding: boolean; draftRestored: boolean };

/** App start: database, preferences, voices, crash recovery, draft restore. */
export async function bootstrap(): Promise<BootResult> {
  const started = Date.now();
  await initDatabase();
  await usePreferences.getState().load();
  const prefs = usePreferences.getState();
  applyUiLanguage(prefs.uiLanguage);

  await Promise.all([useVoices.getState().refresh(), recoverInterruptedJobs()]);

  const draft = prefs.autoSaveDraft ? await readDraft() : null;
  const draftRestored = !!draft?.text;
  useEditor.getState().loadDraft({
    text: draft?.text ?? '',
    language: draft?.language ?? prefs.defaultLanguage,
    voiceId: draft?.voiceId ?? prefs.defaultVoiceId,
    styleKey: draft?.styleKey ?? prefs.defaultStyleKey,
    speed: draft?.speed ?? prefs.defaultSpeed,
    projectId: draft?.projectId ?? null,
    title: draft?.title ?? '',
  });

  logger.info('app.boot', { ms: Date.now() - started, voices: useVoices.getState().voices.length });
  return { showOnboarding: !prefs.onboardingDone, draftRestored };
}
