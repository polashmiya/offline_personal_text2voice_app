import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Paths are absolute file paths inside app storage. Empty string = not used. */
export type EngineVoiceConfig = {
  voiceId: string;
  engine: string;
  modelPath: string;
  tokensPath: string;
  lexiconPath: string;
  dataDir: string;
  dictDir: string;
  voicesPath: string;
  vocoderPath: string;
  lang: string;
  noiseScale: number;
  noiseScaleW: number;
  lengthScale: number;
  numThreads: number;
};

export type EngineLoadResult = {
  voiceId: string;
  sampleRate: number;
  numSpeakers: number;
  loadMs: number;
  alreadyLoaded: boolean;
};

export type SynthesizeChunkRequest = {
  jobId: string;
  text: string;
  speakerId: number;
  speed: number;
  outputPath: string;
};

export type SynthesizeChunkResult = {
  outputPath: string;
  sampleRate: number;
  numSamples: number;
  durationMs: number;
  elapsedMs: number;
  cancelled: boolean;
};

export type EngineRuntimeInfo = {
  loadedVoiceId: string;
  availableMemoryBytes: number;
  totalMemoryBytes: number;
  lowMemory: boolean;
  cpuCores: number;
  abi: string;
  sdkInt: number;
};

export interface Spec extends TurboModule {
  loadVoice(config: EngineVoiceConfig): Promise<EngineLoadResult>;
  unloadVoice(): Promise<void>;
  synthesizeChunk(request: SynthesizeChunkRequest): Promise<SynthesizeChunkResult>;
  cancel(jobId: string): void;
  getRuntimeInfo(): Promise<EngineRuntimeInfo>;
  startForegroundWork(title: string, text: string): Promise<void>;
  updateForegroundWork(text: string, progress: number): void;
  stopForegroundWork(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VoiceEngine');
