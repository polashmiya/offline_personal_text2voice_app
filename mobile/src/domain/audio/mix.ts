import type { MixRequest } from '../../services/native/specs/NativeAudioTools';

/** User-facing mixer settings (spec §36–39). Volumes are 0..1, times in ms. */
export type MixSettings = {
  musicTrackId: string | null;
  voiceVolume: number;
  musicVolume: number;
  loopMusic: boolean;
  autoDuck: boolean;
  /** Advanced: how far music drops under speech (dB), attack/release (ms). */
  duckDb: number;
  duckAttackMs: number;
  duckReleaseMs: number;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  trimStartMs: number;
  trimEndMs: number;
  padStartMs: number;
  padEndMs: number;
};

export const DEFAULT_MIX: MixSettings = {
  musicTrackId: null,
  voiceVolume: 1,
  musicVolume: 0.12,
  loopMusic: true,
  autoDuck: true,
  duckDb: 10,
  duckAttackMs: 120,
  duckReleaseMs: 600,
  musicFadeInMs: 2000,
  musicFadeOutMs: 3000,
  trimStartMs: 0,
  trimEndMs: 0,
  padStartMs: 0,
  padEndMs: 0,
};

export const VOICE_VOLUMES = [0.7, 0.85, 1, 1.2] as const;
export const MUSIC_VOLUMES = [0.05, 0.08, 0.12, 0.2, 0.3] as const;
export const DUCK_AMOUNTS = [6, 10, 15, 20] as const;
export const FADE_TIMES = [0, 1000, 2000, 4000] as const;
export const PAD_TIMES = [0, 1000, 2000, 4000] as const;
export const TRIM_TIMES = [0, 100, 250, 500] as const;

/** Longest music file we import (decoded to WAV, ~2.6 MB/min at 22 kHz mono). */
export const MAX_MUSIC_MS = 20 * 60 * 1000;
/** Mixes with music are rendered at this rate so the music keeps its highs. */
export const MUSIC_MIX_RATE = 44100;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** True when the settings change the audio at all; otherwise export uses the voice file as-is. */
export function needsMix(s: MixSettings): boolean {
  return (
    s.musicTrackId !== null ||
    s.voiceVolume !== 1 ||
    s.trimStartMs > 0 ||
    s.trimEndMs > 0 ||
    s.padStartMs > 0 ||
    s.padEndMs > 0
  );
}

/** Final length of the mix: padding added, trimmed voice in the middle. Never below zero. */
export function mixedDurationMs(voiceMs: number, s: MixSettings): number {
  const voice = Math.max(0, voiceMs - s.trimStartMs - s.trimEndMs);
  return voice + s.padStartMs + s.padEndMs;
}

/** True if trimming would leave less than half a second of voice. */
export function trimTooLong(voiceMs: number, s: MixSettings): boolean {
  return voiceMs - s.trimStartMs - s.trimEndMs < 500;
}

export function buildMixRequest(args: {
  settings: MixSettings;
  voicePath: string;
  musicPath: string | null;
  outputPath: string;
  normalize: boolean;
}): MixRequest {
  const s = args.settings;
  const hasMusic = args.musicPath !== null;
  return {
    voicePath: args.voicePath,
    musicPath: args.musicPath,
    outputPath: args.outputPath,
    sampleRate: hasMusic ? MUSIC_MIX_RATE : 0,
    voiceGain: clamp(s.voiceVolume, 0, 2),
    musicGain: hasMusic ? clamp(s.musicVolume, 0, 1) : 0,
    loopMusic: s.loopMusic,
    trimStartMs: clamp(s.trimStartMs, 0, 60_000),
    trimEndMs: clamp(s.trimEndMs, 0, 60_000),
    padStartMs: clamp(s.padStartMs, 0, 60_000),
    padEndMs: clamp(s.padEndMs, 0, 60_000),
    musicFadeInMs: clamp(s.musicFadeInMs, 0, 30_000),
    musicFadeOutMs: clamp(s.musicFadeOutMs, 0, 30_000),
    duck: hasMusic && s.autoDuck,
    duckDb: clamp(s.duckDb, 0, 40),
    duckAttackMs: clamp(s.duckAttackMs, 5, 2000),
    duckReleaseMs: clamp(s.duckReleaseMs, 20, 5000),
    normalize: args.normalize,
  };
}

/** Reads stored settings defensively: unknown/invalid fields fall back to defaults. */
export function parseMixSettings(raw: unknown): MixSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_MIX };
  }
  const r = raw as Record<string, unknown>;
  const out: MixSettings = { ...DEFAULT_MIX };
  for (const key of Object.keys(DEFAULT_MIX) as Array<keyof MixSettings>) {
    const value = r[key];
    const def = DEFAULT_MIX[key];
    if (key === 'musicTrackId') {
      out.musicTrackId = typeof value === 'string' && value ? value : null;
    } else if (typeof def === 'boolean' && typeof value === 'boolean') {
      (out as Record<string, unknown>)[key] = value;
    } else if (typeof def === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
