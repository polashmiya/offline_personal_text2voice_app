import { create } from 'zustand';
import type { LanguageMode } from '../../../domain/types';
import { FileBridge } from '../../../services/native';
import { paths } from '../../../services/storage/paths';
import { errorCode, logger } from '../../../services/logging/logger';

const UNDO_LIMIT = 50;

export type EditorDraft = {
  text: string;
  language: LanguageMode;
  voiceId: string | null;
  styleKey: string | null;
  speed: number;
  projectId: string | null;
  title: string;
};

type EditorState = EditorDraft & {
  undoStack: string[];
  redoStack: string[];
  dirty: boolean;
  setText: (text: string, options?: { checkpoint?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  update: (patch: Partial<Omit<EditorDraft, 'text'>>) => void;
  loadDraft: (draft: Partial<EditorDraft>) => void;
};

/** Session state of the Home editor. Persisted to a draft file (see useDraftAutosave). */
export const useEditor = create<EditorState>((set, get) => ({
  text: '',
  language: 'auto',
  voiceId: null,
  styleKey: null,
  speed: 1,
  projectId: null,
  title: '',
  undoStack: [],
  redoStack: [],
  dirty: false,

  setText(text, options = {}) {
    const { text: previous, undoStack } = get();
    if (text === previous) {
      return;
    }
    // Checkpoint on word boundaries / big edits so undo steps are meaningful.
    const bigEdit = Math.abs(text.length - previous.length) > 20;
    const boundary = /\s$/.test(text) && !/\s$/.test(previous);
    const checkpoint = options.checkpoint || bigEdit || boundary;
    set({
      text,
      dirty: true,
      redoStack: [],
      undoStack: checkpoint ? [...undoStack, previous].slice(-UNDO_LIMIT) : undoStack,
    });
  },
  undo() {
    const { undoStack, text, redoStack } = get();
    if (!undoStack.length) {
      return;
    }
    set({
      text: undoStack[undoStack.length - 1],
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, text],
      dirty: true,
    });
  },
  redo() {
    const { redoStack, text, undoStack } = get();
    if (!redoStack.length) {
      return;
    }
    set({
      text: redoStack[redoStack.length - 1],
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, text],
      dirty: true,
    });
  },
  update(patch) {
    set({ ...patch, dirty: true });
  },
  loadDraft(draft) {
    set({ ...draft, undoStack: [], redoStack: [], dirty: false });
  },
}));

const draftPath = () => `${paths().drafts}/current.json`;

export async function saveDraft(): Promise<void> {
  const { text, language, voiceId, styleKey, speed, projectId, title } = useEditor.getState();
  const draft: EditorDraft = { text, language, voiceId, styleKey, speed, projectId, title };
  await FileBridge.writeTextAtomic(draftPath(), JSON.stringify(draft));
  useEditor.setState({ dirty: false });
}

export async function readDraft(): Promise<Partial<EditorDraft> | null> {
  try {
    if (!(await FileBridge.exists(draftPath()))) {
      return null;
    }
    const raw = JSON.parse(await FileBridge.readText(draftPath())) as Partial<EditorDraft>;
    return typeof raw.text === 'string' ? raw : null;
  } catch (e) {
    logger.warn('draft.read_failed', { code: errorCode(e) });
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  await FileBridge.deletePath(draftPath()).catch(() => undefined);
}
