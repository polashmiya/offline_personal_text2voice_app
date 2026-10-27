/**
 * Core domain types shared across features. UI code depends on these,
 * never on a concrete inference engine.
 */

export type LanguageCode = 'bn' | 'en';

/** What the user picks in the language selector. */
export type LanguageMode = 'auto' | 'bn' | 'en' | 'mixed' | 'banglish';

export type LanguageSegment = {
  text: string;
  language: LanguageCode | 'unknown';
  start: number;
  end: number;
  /** True when Bengali was written with Latin letters ("ami bhalo achi"). */
  romanized?: boolean;
};

/**
 * How a voice handles text in a given language:
 * - native: the model reads it directly
 * - transliterate: convert to Bengali script pronunciation first (for Bengali voices reading English)
 */
export type LanguageHandling = 'native' | 'transliterate';

export type VoiceQuality = 'fast' | 'balanced' | 'studio';

export type VoiceEngine = 'vits' | 'kokoro' | 'matcha';

export type VoiceStyle = {
  /** Speaker id inside the model. */
  speakerId: number;
  key: string;
  label: string;
};

export type VoiceProfile = {
  id: string;
  name: string;
  description?: string;
  languages: LanguageCode[];
  languageHandling: Partial<Record<LanguageCode, LanguageHandling>>;
  gender?: 'male' | 'female' | 'other';
  locale?: string;
  accent?: string;
  engine: VoiceEngine;
  modelVersion: string;
  quality: VoiceQuality;
  sampleRate: number;
  styles: VoiceStyle[];
  supportsSpeed: boolean;
  supportsPitch: boolean;
  /** Max characters per inference request. */
  maxChunkChars: number;
  isPersonal: boolean;
  installed: boolean;
  installPath: string;
  sizeBytes: number;
  license: VoiceLicense;
  installedAt: string;
};

export type VoiceLicense = {
  name: string;
  url?: string;
  commercialUse: boolean;
  attribution?: string;
};

export type GenerationStatus =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'mixing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type GenerationJob = {
  id: string;
  projectId?: string;
  status: GenerationStatus;
  progress: number;
  currentChunk: number;
  totalChunks: number;
  error?: string;
};

export type ExportFormat = 'wav' | 'mp3' | 'm4a' | 'flac' | 'opus';

export type AppError = {
  code: AppErrorCode;
  /** Optional technical detail for logs, never shown raw to users. */
  detail?: string;
};

export type AppErrorCode =
  | 'model_missing'
  | 'model_corrupt'
  | 'unsupported_voice'
  | 'unsupported_language'
  | 'insufficient_storage'
  | 'insufficient_memory'
  | 'generation_cancelled'
  | 'generation_failed'
  | 'invalid_voice_package'
  | 'export_failed'
  | 'file_permission'
  | 'empty_text'
  | 'mic_permission'
  | 'recording_failed'
  | 'invalid_audio_file'
  | 'unknown';
