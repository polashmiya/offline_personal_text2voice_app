import { FileBridge, VoiceEngine } from '../../../services/native';
import { paths } from '../../../services/storage/paths';
import { voicesRepo } from '../../../services/db/repositories';
import {
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_ENTRIES,
  parseManifest,
  referencedFiles,
  type VoicePackManifest,
} from '../../../domain/voicepack/manifest';
import { AppException, toAppError } from '../../../services/native/errors';
import type { AppError } from '../../../domain/types';
import { newId } from '../../../utils/id';
import { logger } from '../../../services/logging/logger';
import { loadVoice } from './voiceRuntime';
import { validateTokens } from '../../../domain/voicepack/tokens';

export type ImportStage = 'copying' | 'extracting' | 'verifying' | 'testing' | 'installing';

export type ImportResult =
  | { status: 'installed'; manifest: VoicePackManifest; replaced: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; error: AppError; reason?: string };

async function listFilesRecursive(dir: string, prefix = ''): Promise<Array<{ rel: string; path: string; size: number }>> {
  const entries = await FileBridge.listDir(dir);
  const out: Array<{ rel: string; path: string; size: number }> = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      out.push(...(await listFilesRecursive(entry.path, rel)));
    } else {
      out.push({ rel, path: entry.path, size: entry.sizeBytes });
    }
  }
  return out;
}

class PackageError extends Error {}

/**
 * Verifies an extracted package: manifest schema, every file checksummed
 * and matching, referenced files present, no unexpected files.
 */
async function verifyPackage(dir: string, onStage: (s: ImportStage) => void) {
  const files = await listFilesRecursive(dir);
  const manifestFile = files.find(f => f.rel === 'manifest.json');
  if (!manifestFile) {
    throw new PackageError('manifest.json is missing');
  }
  const parsed = parseManifest(await FileBridge.readText(manifestFile.path));
  if (!parsed.ok) {
    throw new PackageError(parsed.reason);
  }
  const manifest = parsed.manifest;

  onStage('verifying');
  const payload = files.filter(f => f.rel !== 'manifest.json');
  const listed = new Set(Object.keys(manifest.checksums));
  for (const file of payload) {
    const expected = manifest.checksums[file.rel];
    if (!expected) {
      throw new PackageError(`Unlisted file in package: ${file.rel}`);
    }
    const actual = await FileBridge.sha256(file.path);
    if (actual !== expected) {
      throw new PackageError(`Checksum mismatch: ${file.rel}`);
    }
    listed.delete(file.rel);
  }
  if (listed.size > 0) {
    throw new PackageError(`Missing file: ${[...listed][0]}`);
  }
  const present = new Set(payload.map(f => f.rel));
  for (const ref of referencedFiles(manifest)) {
    if (!present.has(ref)) {
      throw new PackageError(`Missing file: ${ref}`);
    }
  }
  for (const folder of [manifest.files.dataDir, manifest.files.dictDir]) {
    if (folder && !payload.some(f => f.rel.startsWith(`${folder}/`))) {
      throw new PackageError(`Missing folder: ${folder}`);
    }
  }
  if (manifest.engine === 'vits') {
    // The engine exits the process on a malformed tokens file, so check it first.
    const problem = validateTokens(await FileBridge.readText(`${dir}/${manifest.files.tokens}`));
    if (problem) {
      throw new PackageError(problem);
    }
  }
  const totalBytes = payload.reduce((sum, f) => sum + f.size, 0);
  return { manifest, totalBytes };
}

/**
 * Picks a .voicepack, validates it fully, test-loads it in the engine and
 * only then installs it. A failed import never leaves a voice marked installed.
 */
export async function importVoicePack(onStage: (stage: ImportStage) => void): Promise<ImportResult> {
  const p = paths();
  const staging = `${p.staging}/${newId('pkg_')}`;
  let pickedPath: string | null = null;
  try {
    onStage('copying');
    const free = await FileBridge.freeSpaceBytes();
    const picked = await FileBridge.pickFile(
      ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'],
      MAX_PACKAGE_BYTES,
    );
    if (!picked) {
      return { status: 'cancelled' };
    }
    pickedPath = picked.cachedPath;
    // Need room for the extracted copy (the zip copy is already on disk).
    if (free - picked.sizeBytes < picked.sizeBytes * 1.3 + 50 * 1024 * 1024) {
      throw new AppException('insufficient_storage');
    }

    onStage('extracting');
    await FileBridge.mkdirs(staging);
    await FileBridge.extractZipSafely(pickedPath, staging, MAX_PACKAGE_BYTES, MAX_PACKAGE_ENTRIES);
    await FileBridge.deletePath(pickedPath);
    pickedPath = null;

    const { manifest, totalBytes } = await verifyPackage(staging, onStage);

    onStage('testing');
    const loaded = await loadVoice(manifest, staging);
    if (loaded.sampleRate !== manifest.sampleRate) {
      throw new PackageError(`Sample rate is ${loaded.sampleRate}, manifest says ${manifest.sampleRate}`);
    }
    const maxSpeaker = Math.max(...manifest.speakers.map(s => s.id));
    if (maxSpeaker >= Math.max(1, loaded.numSpeakers)) {
      throw new PackageError('Manifest lists more styles than the model has speakers');
    }
    // The staging copy is about to move; make sure nothing holds it open.
    await VoiceEngine.unloadVoice();

    onStage('installing');
    const target = p.voiceDir(manifest.id);
    const replaced = await FileBridge.exists(target);
    await FileBridge.mkdirs(p.voices);
    await FileBridge.movePath(staging, target);
    await voicesRepo.upsert(manifest, target, totalBytes);
    logger.info('voice.installed', { voiceId: manifest.id, bytes: totalBytes, replaced });
    return { status: 'installed', manifest, replaced };
  } catch (error) {
    if (error instanceof PackageError) {
      logger.warn('voice.import_rejected', { reason: error.message });
      return { status: 'failed', error: { code: 'invalid_voice_package' }, reason: error.message };
    }
    const appError = toAppError(error, 'invalid_voice_package');
    logger.warn('voice.import_failed', { code: appError.code });
    return { status: 'failed', error: appError, reason: appError.detail };
  } finally {
    await FileBridge.deletePath(staging).catch(() => undefined);
    if (pickedPath) {
      await FileBridge.deletePath(pickedPath).catch(() => undefined);
    }
  }
}

export async function deleteVoice(voiceId: string) {
  await VoiceEngine.unloadVoice();
  await voicesRepo.remove(voiceId);
  await FileBridge.deletePath(paths().voiceDir(voiceId));
}
