import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useEditor, saveDraft } from '../store/editorStore';
import { usePreferences } from '../../../store/preferencesStore';
import { projectsRepo } from '../../../services/db/repositories';
import { errorCode, logger } from '../../../services/logging/logger';

const DEBOUNCE_MS = 1500;

async function persist() {
  const state = useEditor.getState();
  await saveDraft();
  // An open project is auto-saved too, so long scripts are never lost (spec §89).
  if (state.projectId) {
    await projectsRepo.save({
      id: state.projectId,
      title: state.title,
      text: state.text,
      settings: { voiceId: state.voiceId, language: state.language, styleKey: state.styleKey, speed: state.speed },
    });
  }
}

/** Saves the editor draft after edits (debounced) and whenever the app goes to the background. */
export function useDraftAutosave() {
  const enabled = usePreferences(s => s.autoSaveDraft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (!state.dirty || (state.text === prev.text && state.voiceId === prev.voiceId && state.language === prev.language && state.speed === prev.speed && state.styleKey === prev.styleKey && state.title === prev.title)) {
        return;
      }
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        persist().catch(e => logger.warn('draft.save_failed', { code: errorCode(e) }));
      }, DEBOUNCE_MS);
    });
    const appState = AppState.addEventListener('change', next => {
      if (next !== 'active' && useEditor.getState().dirty) {
        persist().catch(e => logger.warn('draft.save_failed', { code: errorCode(e) }));
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [enabled]);
}
