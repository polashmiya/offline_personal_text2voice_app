/**
 * Typed access to the app's native modules. Feature code imports from here,
 * never from the raw specs, so the native surface can change in one place.
 */
import VoiceEngine from './specs/NativeVoiceEngine';
import AudioTools from './specs/NativeAudioTools';
import FileBridge from './specs/NativeFileBridge';

export { VoiceEngine, AudioTools, FileBridge };
export type {
  EngineVoiceConfig,
  EngineLoadResult,
  SynthesizeChunkResult,
  EngineRuntimeInfo,
} from './specs/NativeVoiceEngine';
export type { AudioInfo, ConcatResult, ExportResult, PlayerStatus } from './specs/NativeAudioTools';
export type { PickedFile, FileEntry } from './specs/NativeFileBridge';
