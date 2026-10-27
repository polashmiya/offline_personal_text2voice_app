import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type AudioInfo = {
  durationMs: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
};

export type ConcatInput = { path: string; pauseAfterMs: number };

export type ConcatRequest = {
  inputs: Array<ConcatInput>;
  outputPath: string;
  /** Leading/trailing silence added to the final file. */
  leadingSilenceMs: number;
  trailingSilenceMs: number;
  /** Loudness normalization on/off. */
  normalize: boolean;
};

export type ConcatResult = {
  outputPath: string;
  durationMs: number;
  sampleRate: number;
  peak: number;
};

export type ExportRequest = {
  inputPath: string;
  outputPath: string;
  format: string;
  bitrateKbps: number;
  /** 0 = keep source sample rate. */
  sampleRate: number;
  /** Tags (UTF-8). Empty = none. Written for WAV, MP3 and FLAC only. */
  title: string;
  artist: string;
  comment: string;
};

export type ExportResult = {
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
};

export type DecodeResult = {
  outputPath: string;
  durationMs: number;
  sampleRate: number;
};

export type MixRequest = {
  voicePath: string;
  /** Decoded mono WAV from the music library; null = voice only. */
  musicPath: string | null;
  outputPath: string;
  /** 0 = keep the voice sample rate. */
  sampleRate: number;
  voiceGain: number;
  musicGain: number;
  loopMusic: boolean;
  trimStartMs: number;
  trimEndMs: number;
  padStartMs: number;
  padEndMs: number;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  duck: boolean;
  /** How far music drops under speech, in dB (positive). */
  duckDb: number;
  duckAttackMs: number;
  duckReleaseMs: number;
  normalize: boolean;
};

export type MixResult = {
  outputPath: string;
  durationMs: number;
  sampleRate: number;
  peak: number;
};

export type PlayerStatus = {
  loaded: boolean;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  completed: boolean;
};

export interface Spec extends TurboModule {
  getAudioInfo(path: string): Promise<AudioInfo>;
  concatenateWav(request: ConcatRequest): Promise<ConcatResult>;
  computeWaveform(path: string, buckets: number): Promise<Array<number>>;
  getSupportedExportFormats(): Promise<Array<string>>;
  exportAudio(request: ExportRequest): Promise<ExportResult>;
  /** Decodes any supported audio file to a mono 16-bit WAV, capped at maxDurationMs. */
  decodeToWav(inputPath: string, outputPath: string, maxDurationMs: number): Promise<DecodeResult>;
  /** Voice + background music: trim, padding, fades, loop, auto-duck, limiter. */
  mixAudio(request: MixRequest): Promise<MixResult>;

  playerLoad(path: string): Promise<PlayerStatus>;
  playerPlay(): Promise<void>;
  playerPause(): Promise<void>;
  playerSeek(positionMs: number): Promise<void>;
  playerSetRate(rate: number): Promise<void>;
  playerGetStatus(): Promise<PlayerStatus>;
  playerRelease(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AudioTools');
