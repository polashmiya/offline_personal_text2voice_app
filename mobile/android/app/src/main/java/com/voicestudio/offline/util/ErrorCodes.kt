package com.voicestudio.offline.util

/** Error codes shared with JS (see src/services/native/errors.ts). */
object ErrorCodes {
  const val MODEL_MISSING = "model_missing"
  const val MODEL_CORRUPT = "model_corrupt"
  const val NOT_LOADED = "model_missing"
  const val INSUFFICIENT_MEMORY = "insufficient_memory"
  const val INSUFFICIENT_STORAGE = "insufficient_storage"
  const val GENERATION_FAILED = "generation_failed"
  const val INVALID_AUDIO = "invalid_audio"
  const val AUDIO_PROCESSING = "audio_processing"
  const val EXPORT_FAILED = "export_failed"
  const val FILE_PERMISSION = "file_permission"
  const val INVALID_PACKAGE = "invalid_voice_package"
  const val IO = "io_error"
  const val BUSY = "busy"
  const val MIC_PERMISSION = "mic_permission"
  const val RECORDING_FAILED = "recording_failed"
}
