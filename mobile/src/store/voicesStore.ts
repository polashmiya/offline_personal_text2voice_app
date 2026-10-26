import { create } from 'zustand';
import type { VoiceProfile } from '../domain/types';
import { voicesRepo } from '../services/db/repositories';

/** Installed voices (model state). */
type VoicesState = {
  voices: VoiceProfile[];
  loaded: boolean;
  refresh: () => Promise<void>;
  byId: (id: string | null | undefined) => VoiceProfile | undefined;
};

export const useVoices = create<VoicesState>((set, get) => ({
  voices: [],
  loaded: false,
  async refresh() {
    const voices = await voicesRepo.list();
    set({ voices, loaded: true });
  },
  byId: id => (id ? get().voices.find(v => v.id === id) : undefined),
}));
