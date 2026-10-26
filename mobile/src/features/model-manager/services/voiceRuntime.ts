import { VoiceEngine, type EngineLoadResult, type EngineVoiceConfig } from '../../../services/native';
import { joinInside, paths } from '../../../services/storage/paths';
import type { VoicePackManifest } from '../../../domain/voicepack/manifest';
import type { VoiceProfile } from '../../../domain/types';
import { prepareSentence, type VoiceTextCapabilities } from '../../../domain/text/pipeline';

export function engineConfigFor(manifest: VoicePackManifest, installPath: string): EngineVoiceConfig {
  const resolve = (p?: string) => (p ? joinInside(installPath, p) : '');
  return {
    voiceId: manifest.id,
    engine: manifest.engine,
    modelPath: resolve(manifest.files.model),
    tokensPath: resolve(manifest.files.tokens),
    lexiconPath: resolve(manifest.files.lexicon),
    dataDir: resolve(manifest.files.dataDir),
    dictDir: resolve(manifest.files.dictDir),
    voicesPath: resolve(manifest.files.voices),
    vocoderPath: resolve(manifest.files.vocoder),
    lang: manifest.lang ?? '',
    noiseScale: manifest.defaults.noiseScale,
    noiseScaleW: manifest.defaults.noiseScaleW,
    lengthScale: manifest.defaults.lengthScale,
    numThreads: 2,
  };
}

/** Loads the voice into the native engine (no-op if it is already loaded). */
export function loadVoice(manifest: VoicePackManifest, installPath: string): Promise<EngineLoadResult> {
  return VoiceEngine.loadVoice(engineConfigFor(manifest, installPath));
}

/** Speaks a short sample with the voice: proves the model actually works on this device. */
export async function testVoice(
  voice: VoiceProfile,
  manifest: VoicePackManifest,
  sentence: string,
  speakerId: number,
): Promise<{ path: string; loadMs: number; realTimeFactor: number }> {
  const load = await loadVoice(manifest, voice.installPath);
  const prepared = prepareSentence(sentence, { mode: 'auto', voice: textCapabilities(voice) }, voice.languages[0]);
  const path = `${paths().cacheDir}/voice-test-${voice.id}-${Date.now()}.wav`;
  const result = await VoiceEngine.synthesizeChunk({
    jobId: `test_${Date.now()}`,
    text: prepared.spoken,
    speakerId,
    speed: 1,
    outputPath: path,
  });
  return {
    path,
    loadMs: load.loadMs,
    realTimeFactor: result.durationMs > 0 ? result.elapsedMs / result.durationMs : 0,
  };
}

export function textCapabilities(voice: VoiceProfile): VoiceTextCapabilities {
  return {
    primaryLanguage: voice.languages[0],
    languageHandling: voice.languageHandling,
    maxChunkChars: voice.maxChunkChars,
  };
}
