import { settingsRepo, voicesRepo } from '../../../services/db/repositories';
import { logger } from '../../../services/logging/logger';
import { importVoicePack } from './voiceImport';

/**
 * Voices shipped inside the APK (assets/voices/*.voicepack). They go through
 * the normal import pipeline (checksums, token check, test load), once. A
 * pack is remembered as handled even if the user later deletes the voice, so
 * deleting a built-in voice sticks.
 *
 * Norman and John: Piper medium voices by Bryce Beattie trained on public-domain
 * LibriVox recordings (no restricted base model), INT8 from sherpa-onnx.
 */
export const BUNDLED_VOICES = [
  { id: 'en-piper-norman-medium', asset: 'voices/en-piper-norman-medium.voicepack' },
  { id: 'en-piper-john-medium', asset: 'voices/en-piper-john-medium.voicepack' },
] as const;

const SETTINGS_KEY = 'bundledVoicesHandled';

async function handled(): Promise<Set<string>> {
  const raw = (await settingsRepo.getAll())[SETTINGS_KEY];
  try {
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Installs bundled voices not handled yet. Returns how many were installed. Never throws. */
export async function ensureBundledVoices(): Promise<number> {
  let installed = 0;
  try {
    const done = await handled();
    for (const voice of BUNDLED_VOICES) {
      if (done.has(voice.id)) {
        continue;
      }
      if (!(await voicesRepo.manifest(voice.id))) {
        // Never overwrite: if the same id somehow exists, keep the user's copy.
        const result = await importVoicePack(() => undefined, async () => false, { kind: 'asset', assetPath: voice.asset });
        if (result.status === 'installed') {
          installed++;
        } else if (result.status === 'failed') {
          // Not marked as handled, so the next start tries again (e.g. after freeing storage).
          logger.warn('voice.bundled_failed', { id: voice.id, code: result.error.code });
          continue;
        }
      }
      done.add(voice.id);
      await settingsRepo.set(SETTINGS_KEY, JSON.stringify([...done]));
    }
  } catch {
    logger.warn('voice.bundled_error', {});
  }
  return installed;
}
