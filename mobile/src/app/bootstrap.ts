import { initDatabase } from '../services/db/database';
import { usePreferences } from '../store/preferencesStore';
import { useVoices } from '../store/voicesStore';
import { applyUiLanguage } from '../i18n';
import { recoverInterruptedJobs } from '../features/tts/services/generationService';
import { readDraft, useEditor } from '../features/tts/store/editorStore';
import { logger } from '../services/logging/logger';
import { ensureBundledMusic } from '../features/audio-studio/music/bundledMusic';
import { ensureBundledVoices } from '../features/model-manager/services/bundledVoices';
import { FileBridge } from '../services/native';
import { paths } from '../services/storage/paths';

export type BootResult = { showOnboarding: boolean; draftRestored: boolean };

/** App start: database, preferences, voices, crash recovery, draft restore. */
export async function bootstrap(): Promise<BootResult> {
  const started = Date.now();
  await initDatabase();
  await usePreferences.getState().load();
  const prefs = usePreferences.getState();
  applyUiLanguage(prefs.uiLanguage);

  // Temp folders a crash can leave behind: picked files, half-validated packages, shared datasets, mixes.
  const p = paths();
  await Promise.all([p.imports, p.staging, p.share, p.mix].map(dir => FileBridge.deletePath(dir).catch(() => undefined)));
  // Older builds kept voice dataset zips (recordings + consent) in exports/.
  if (await FileBridge.exists(p.exports)) {
    const stale = (await FileBridge.listDir(p.exports)).filter(f => f.name.startsWith('ds_'));
    await Promise.all(stale.map(f => FileBridge.deletePath(f.path).catch(() => undefined)));
  }
  // First launch only (a few seconds): install the built-in voices before the voice list loads.
  await ensureBundledVoices();
  await Promise.all([useVoices.getState().refresh(), recoverInterruptedJobs(), ensureBundledMusic()]);

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
