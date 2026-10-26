import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Objective measurements of one take; the accept/retry verdict is made in JS. */
export type TakeAnalysis = {
  durationMs: number;
  sampleRate: number;
  speechMs: number;
  leadingSilenceMs: number;
  trailingSilenceMs: number;
  peakDb: number;
  speechRmsDb: number;
  noiseFloorDb: number;
  clippedSamples: number;
  /** True when the take hit the maximum length and stopped by itself. */
  autoStopped: boolean;
};

export type RecorderLevel = {
  recording: boolean;
  autoStopped: boolean;
  levelDb: number;
  peakDb: number;
  elapsedMs: number;
};

export type NoiseMeasurement = {
  noiseDb: number;
  peakDb: number;
};

export interface Spec extends TurboModule {
  /** Starts a 16-bit mono PCM WAV recording (48 or 44.1 kHz). Needs RECORD_AUDIO. */
  start(outputPath: string, maxDurationMs: number): Promise<{ sampleRate: number }>;
  stop(): Promise<TakeAnalysis>;
  /** Stops and deletes the current take. */
  cancel(): Promise<void>;
  /** Cheap synchronous poll for the input meter. */
  getLevel(): RecorderLevel;
  analyze(path: string): Promise<TakeAnalysis>;
  /** Listens to the room for a moment (nothing is saved). */
  measureNoise(durationMs: number): Promise<NoiseMeasurement>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VoiceRecorder');
