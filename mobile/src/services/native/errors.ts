import type { AppError, AppErrorCode } from '../../domain/types';

const KNOWN: AppErrorCode[] = [
  'model_missing',
  'model_corrupt',
  'unsupported_voice',
  'unsupported_language',
  'insufficient_storage',
  'insufficient_memory',
  'generation_cancelled',
  'generation_failed',
  'invalid_voice_package',
  'export_failed',
  'file_permission',
  'empty_text',
];

const NATIVE_ALIASES: Record<string, AppErrorCode> = {
  invalid_audio: 'generation_failed',
  audio_processing: 'generation_failed',
  io_error: 'unknown',
  busy: 'unknown',
};

export class AppException extends Error {
  readonly appError: AppError;
  constructor(code: AppErrorCode, detail?: string) {
    super(detail ?? code);
    this.appError = { code, detail };
  }
}

/** Converts anything thrown (native rejection, JS error) into an AppError. Never exposes stack traces. */
export function toAppError(error: unknown, fallback: AppErrorCode = 'unknown'): AppError {
  if (error instanceof AppException) {
    return error.appError;
  }
  const raw = error as { code?: unknown; message?: unknown } | null;
  const code = typeof raw?.code === 'string' ? raw.code : undefined;
  const detail = typeof raw?.message === 'string' ? raw.message : undefined;
  if (code && (KNOWN as string[]).includes(code)) {
    return { code: code as AppErrorCode, detail };
  }
  if (code && NATIVE_ALIASES[code]) {
    return { code: NATIVE_ALIASES[code] === 'unknown' ? fallback : NATIVE_ALIASES[code], detail };
  }
  return { code: fallback, detail };
}
