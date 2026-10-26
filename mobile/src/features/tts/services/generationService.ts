import { AudioTools, FileBridge, VoiceEngine } from '../../../services/native';
import { paths } from '../../../services/storage/paths';
import { generationsRepo, pronunciationsRepo, voicesRepo, type GenerationMetrics } from '../../../services/db/repositories';
import { buildSynthesisPlan } from '../../../domain/text/pipeline';
import type { AppError, GenerationStatus, LanguageMode, VoiceProfile } from '../../../domain/types';
import { AppException, toAppError } from '../../../services/native/errors';
import { loadVoice, textCapabilities } from '../../model-manager/services/voiceRuntime';
import { newId } from '../../../utils/id';
import { logger } from '../../../services/logging/logger';
import { textStats } from '../../../domain/text/estimate';

export type GenerationRequest = {
  text: string;
  language: LanguageMode;
  voice: VoiceProfile;
  styleKey: string | null;
  speed: number;
  projectId: string | null;
  title: string;
  normalize: boolean;
  keepScreenAwake: boolean;
  notificationTitle: string;
  notificationText: (current: number, total: number) => string;
};

export type GenerationProgress = {
  status: GenerationStatus;
  /** 0..1, based on chunks actually synthesized. */
  progress: number;
  currentChunk: number;
  totalChunks: number;
};

export type GenerationOutcome =
  | { status: 'completed'; generationId: string; audioPath: string; durationMs: number }
  | { status: 'cancelled' }
  | { status: 'failed'; error: AppError; unsupportedLanguages?: string[] };

export class GenerationHandle {
  readonly jobId = newId('gen_');
  private cancelled = false;
  cancel() {
    this.cancelled = true;
    VoiceEngine.cancel(this.jobId);
  }
  get isCancelled() {
    return this.cancelled;
  }
}

const FOREGROUND_THRESHOLD_CHUNKS = 3;
const MIN_FREE_BYTES = 50 * 1024 * 1024;

/**
 * Runs one generation job end to end. Every step is real: progress counts
 * synthesized chunks, and the job is only "completed" after the final file
 * has been written and validated.
 */
export async function runGeneration(
  request: GenerationRequest,
  handle: GenerationHandle,
  onProgress: (p: GenerationProgress) => void,
): Promise<GenerationOutcome> {
  const jobId = handle.jobId;
  const p = paths();
  const jobDir = p.jobDir(jobId);
  const finalPath = p.generatedAudio(jobId);
  let rowCreated = false;
  let foreground = false;

  try {
    onProgress({ status: 'preparing', progress: 0, currentChunk: 0, totalChunks: 0 });

    const dictionary = await pronunciationsRepo.list();
    const planResult = buildSynthesisPlan({
      text: request.text,
      mode: request.language,
      voice: textCapabilities(request.voice),
      dictionary,
      projectId: request.projectId ?? undefined,
    });
    if (!planResult.ok) {
      return {
        status: 'failed',
        error: planResult.error,
        unsupportedLanguages: 'unsupportedLanguages' in planResult ? planResult.unsupportedLanguages : undefined,
      };
    }
    const { chunks } = planResult.plan;
    const total = chunks.length;

    const manifest = await voicesRepo.manifest(request.voice.id);
    if (!manifest || !(await FileBridge.exists(request.voice.installPath))) {
      throw new AppException('model_missing');
    }

    // Storage: chunk WAVs + final WAV, 16-bit mono.
    const estimatedBytes = textStats(request.text, request.speed).estimatedSeconds * request.voice.sampleRate * 2 * 2.2;
    if ((await FileBridge.freeSpaceBytes()) < estimatedBytes + MIN_FREE_BYTES) {
      throw new AppException('insufficient_storage');
    }

    await generationsRepo.create({
      id: jobId,
      projectId: request.projectId,
      title: request.title,
      text: request.text,
      voiceId: request.voice.id,
      voiceName: request.voice.name,
      language: request.language,
      styleKey: request.styleKey,
      speed: request.speed,
      totalChunks: total,
    });
    rowCreated = true;
    await FileBridge.mkdirs(jobDir);

    if (total > FOREGROUND_THRESHOLD_CHUNKS) {
      await VoiceEngine.startForegroundWork(request.notificationTitle, request.notificationText(0, total));
      foreground = true;
    }
    if (request.keepScreenAwake) {
      FileBridge.keepScreenOn(true);
    }

    const load = await loadVoice(manifest, request.voice.installPath);
    const style = request.voice.styles.find(s => s.key === request.styleKey) ?? request.voice.styles[0];
    const speakerId = style?.speakerId ?? 0;

    const started = Date.now();
    let firstAudioMs = 0;
    let synthesisMs = 0;
    const inputs: Array<{ path: string; pauseAfterMs: number }> = [];

    onProgress({ status: 'generating', progress: 0, currentChunk: 0, totalChunks: total });
    for (const chunk of chunks) {
      if (handle.isCancelled) {
        break;
      }
      const outputPath = `${jobDir}/chunk_${String(chunk.index).padStart(5, '0')}.wav`;
      const result = await VoiceEngine.synthesizeChunk({
        jobId,
        text: chunk.text,
        speakerId,
        speed: request.speed,
        outputPath,
      });
      if (result.cancelled) {
        break;
      }
      if (!firstAudioMs) {
        firstAudioMs = Date.now() - started;
      }
      synthesisMs += result.elapsedMs;
      inputs.push({ path: outputPath, pauseAfterMs: chunk.pauseAfterMs / request.speed });

      const done = chunk.index + 1;
      const progress = (done / total) * 0.95;
      onProgress({ status: 'generating', progress, currentChunk: done, totalChunks: total });
      if (done % 5 === 0 || done === total) {
        generationsRepo.updateProgress(jobId, 'generating', progress).catch(() => undefined);
      }
      if (foreground) {
        VoiceEngine.updateForegroundWork(request.notificationText(done, total), Math.round(progress * 100));
      }
    }

    if (handle.isCancelled) {
      await generationsRepo.fail(jobId, 'cancelled', null);
      logger.info('generation.cancelled', { jobId });
      return { status: 'cancelled' };
    }

    onProgress({ status: 'mixing', progress: 0.96, currentChunk: total, totalChunks: total });
    await generationsRepo.updateProgress(jobId, 'mixing', 0.96);
    const mergeStarted = Date.now();
    await FileBridge.mkdirs(p.generated);
    const merged = await AudioTools.concatenateWav({
      inputs,
      outputPath: finalPath,
      leadingSilenceMs: 150,
      trailingSilenceMs: 300,
      normalize: request.normalize,
    });
    const mergeMs = Date.now() - mergeStarted;

    // Validate before calling it done.
    const info = await AudioTools.getAudioInfo(finalPath);
    if (!(info.durationMs > 0) || info.sampleRate !== load.sampleRate) {
      throw new AppException('generation_failed', 'Final audio failed validation');
    }

    const metrics: GenerationMetrics = {
      loadMs: load.loadMs,
      firstAudioMs,
      synthesisMs,
      mergeMs,
      audioMs: merged.durationMs,
      realTimeFactor: merged.durationMs > 0 ? synthesisMs / merged.durationMs : 0,
    };
    await generationsRepo.complete(jobId, finalPath, merged.durationMs, merged.sampleRate, metrics);
    logger.info('generation.completed', { jobId, chunks: total, ...metrics });
    onProgress({ status: 'completed', progress: 1, currentChunk: total, totalChunks: total });
    return { status: 'completed', generationId: jobId, audioPath: finalPath, durationMs: merged.durationMs };
  } catch (error) {
    const appError = toAppError(error, 'generation_failed');
    logger.error('generation.failed', { jobId, code: appError.code });
    await FileBridge.deletePath(finalPath).catch(() => undefined);
    if (rowCreated) {
      await generationsRepo.fail(jobId, 'failed', appError.code).catch(() => undefined);
    }
    return { status: 'failed', error: appError };
  } finally {
    await FileBridge.deletePath(jobDir).catch(() => undefined);
    if (foreground) {
      await VoiceEngine.stopForegroundWork().catch(() => undefined);
    }
    FileBridge.keepScreenOn(false);
  }
}

/**
 * Crash recovery (spec §90): jobs that were running when the app died are
 * marked "interrupted", their partial audio removed, the text kept.
 */
export async function recoverInterruptedJobs(): Promise<number> {
  const unfinished = await generationsRepo.unfinished();
  for (const job of unfinished) {
    await generationsRepo.fail(job.id, 'interrupted', null);
    await FileBridge.deletePath(paths().generatedAudio(job.id)).catch(() => undefined);
  }
  await FileBridge.deletePath(paths().jobs).catch(() => undefined);
  if (unfinished.length) {
    logger.info('generation.recovered', { count: unfinished.length });
  }
  return unfinished.length;
}
