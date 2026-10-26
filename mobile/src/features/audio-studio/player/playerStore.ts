import { create } from 'zustand';
import { AudioTools } from '../../../services/native';
import { logger } from '../../../services/logging/logger';

/** Player state. There is one native player; any screen can drive it. */
type PlayerState = {
  path: string | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  rate: number;
  load: (path: string) => Promise<boolean>;
  toggle: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  skip: (deltaMs: number) => Promise<void>;
  restart: () => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  unload: () => Promise<void>;
};

let poller: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  stopPolling();
  poller = setInterval(async () => {
    try {
      const status = await AudioTools.playerGetStatus();
      usePlayer.setState({
        playing: status.playing,
        positionMs: status.completed ? status.durationMs : status.positionMs,
        durationMs: status.durationMs,
      });
      if (!status.playing) {
        stopPolling();
      }
    } catch {
      stopPolling();
    }
  }, 200);
}

function stopPolling() {
  if (poller) {
    clearInterval(poller);
    poller = null;
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  path: null,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  rate: 1,
  async load(path) {
    if (get().path === path) {
      return true;
    }
    stopPolling();
    try {
      const status = await AudioTools.playerLoad(path);
      await AudioTools.playerSetRate(get().rate);
      set({ path, playing: false, positionMs: 0, durationMs: status.durationMs });
      return true;
    } catch (e) {
      logger.warn('player.load_failed', { msg: String(e) });
      set({ path: null, playing: false, positionMs: 0, durationMs: 0 });
      return false;
    }
  },
  async toggle() {
    if (!get().path) {
      return;
    }
    if (get().playing) {
      await get().pause();
      return;
    }
    await AudioTools.playerPlay();
    set({ playing: true });
    startPolling();
  },
  async pause() {
    await AudioTools.playerPause();
    stopPolling();
    const status = await AudioTools.playerGetStatus();
    set({ playing: false, positionMs: status.positionMs });
  },
  async seek(ms) {
    const clamped = Math.max(0, Math.min(ms, get().durationMs));
    await AudioTools.playerSeek(clamped);
    set({ positionMs: clamped });
  },
  async skip(delta) {
    await get().seek(get().positionMs + delta);
  },
  async restart() {
    await get().seek(0);
    if (!get().playing) {
      await get().toggle();
    }
  },
  async setRate(rate) {
    set({ rate });
    await AudioTools.playerSetRate(rate);
  },
  async unload() {
    stopPolling();
    await AudioTools.playerRelease();
    set({ path: null, playing: false, positionMs: 0, durationMs: 0 });
  },
}));
