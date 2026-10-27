import { AudioTools, FileBridge } from '../../../services/native';
import { paths } from '../../../services/storage/paths';
import { musicRepo, type MusicTrack } from '../../../services/db/repositories';
import { MAX_MUSIC_MS } from '../../../domain/audio/mix';
import { AppException, toAppError } from '../../../services/native/errors';
import type { AppError } from '../../../domain/types';
import { newId } from '../../../utils/id';
import { logger } from '../../../services/logging/logger';

const MAX_MUSIC_FILE_BYTES = 200 * 1024 * 1024;

export type MusicImportResult =
  | { status: 'imported'; track: MusicTrack }
  | { status: 'cancelled' }
  | { status: 'failed'; error: AppError };

function trackName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  return base.slice(0, 80) || 'Music';
}

/**
 * Picks an audio file and decodes it once to a mono WAV in the library.
 * Decoding proves the file is real audio; the original copy is discarded.
 */
export async function importMusic(): Promise<MusicImportResult> {
  let pickedPath: string | null = null;
  const id = newId('mus_');
  const target = paths().musicTrack(id);
  try {
    const picked = await FileBridge.pickFile(['audio/*'], MAX_MUSIC_FILE_BYTES);
    if (!picked) {
      return { status: 'cancelled' };
    }
    pickedPath = picked.cachedPath;
    // Decoded WAV at up to 48 kHz mono is ~5.8 MB/min.
    if ((await FileBridge.freeSpaceBytes()) < (MAX_MUSIC_MS / 60000) * 6 * 1024 * 1024) {
      throw new AppException('insufficient_storage');
    }
    await FileBridge.mkdirs(paths().music);
    const decoded = await AudioTools.decodeToWav(pickedPath, target, MAX_MUSIC_MS);
    if (!(decoded.durationMs > 0)) {
      throw new AppException('export_failed', 'Decoded music is empty');
    }
    const track: MusicTrack = {
      id,
      name: trackName(picked.name),
      filePath: target,
      durationMs: decoded.durationMs,
      sampleRate: decoded.sampleRate,
      source: 'user',
      license: null,
      attribution: null,
    };
    await musicRepo.add(track);
    logger.info('music.imported', { durationMs: decoded.durationMs });
    return { status: 'imported', track };
  } catch (error) {
    await FileBridge.deletePath(target).catch(() => undefined);
    const appError = toAppError(error, 'invalid_audio_file');
    logger.warn('music.import_failed', { code: appError.code });
    return { status: 'failed', error: appError };
  } finally {
    if (pickedPath) {
      await FileBridge.deletePath(pickedPath).catch(() => undefined);
    }
  }
}

export async function deleteMusic(track: MusicTrack) {
  await musicRepo.remove(track.id);
  await FileBridge.deletePath(track.filePath).catch(() => undefined);
}
