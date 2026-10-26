import { create } from 'zustand';
import {
  GenerationHandle,
  runGeneration,
  type GenerationOutcome,
  type GenerationProgress,
  type GenerationRequest,
} from '../services/generationService';

/** Generation state: one job at a time. */
type GenerationState = {
  running: boolean;
  progress: GenerationProgress | null;
  lastOutcome: GenerationOutcome | null;
  handle: GenerationHandle | null;
  start: (request: GenerationRequest) => Promise<GenerationOutcome>;
  cancel: () => void;
  clearOutcome: () => void;
};

export const useGeneration = create<GenerationState>((set, get) => ({
  running: false,
  progress: null,
  lastOutcome: null,
  handle: null,
  async start(request) {
    if (get().running) {
      return { status: 'failed', error: { code: 'unknown', detail: 'Already generating' } };
    }
    const handle = new GenerationHandle();
    set({ running: true, handle, progress: null, lastOutcome: null });
    const outcome = await runGeneration(request, handle, progress => set({ progress }));
    set({ running: false, handle: null, lastOutcome: outcome });
    return outcome;
  },
  cancel() {
    get().handle?.cancel();
  },
  clearOutcome() {
    set({ lastOutcome: null, progress: null });
  },
}));
