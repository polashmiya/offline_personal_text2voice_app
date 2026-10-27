package com.voicestudio.offline.audio

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.IOException
import java.nio.ByteOrder

/**
 * Decodes any platform-supported audio file (MP3, AAC/M4A, OGG, FLAC, WAV…)
 * to a mono 16-bit WAV with MediaExtractor + MediaCodec, streaming.
 * Used to bring user music into the mixer's simple WAV-only world.
 */
object AudioDecoder {
  private const val TIMEOUT_US = 10_000L

  data class Result(val durationMs: Long, val sampleRate: Int)

  fun decodeToMonoWav(input: File, output: File, maxDurationMs: Long): Result {
    if (!input.isFile) throw InvalidAudioException("File not found")
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    var writer: MonoWavWriter? = null
    try {
      try {
        extractor.setDataSource(input.absolutePath)
      } catch (e: IOException) {
        throw InvalidAudioException("Unreadable audio: ${e.message}")
      }
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw InvalidAudioException("No audio track")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val mime = format.getString(MediaFormat.KEY_MIME)!!
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var floatPcm = false

      codec = try {
        MediaCodec.createDecoderByType(mime)
      } catch (e: Exception) {
        throw InvalidAudioException("No decoder for $mime")
      }
      codec.configure(format, null, null, 0)
      codec.start()

      val maxFrames = maxDurationMs * sampleRate / 1000
      // Generous: decoding runs far faster than real time; this only stops a stuck codec.
      val deadline = System.currentTimeMillis() + maxOf(60_000L, maxDurationMs / 2)
      val info = MediaCodec.BufferInfo()
      var mono = FloatArray(8192)
      var inputDone = false
      var framesOut = 0L

      while (true) {
        if (!inputDone) {
          val index = codec.dequeueInputBuffer(TIMEOUT_US)
          if (index >= 0) {
            val buffer = codec.getInputBuffer(index)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        if (System.currentTimeMillis() > deadline) throw InvalidAudioException("Decoding took too long")
        val outIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)
        if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val out = codec.outputFormat
          val newRate = out.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = out.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          if (newRate !in 4000..192000 || channels !in 1..8) throw InvalidAudioException("Invalid audio parameters")
          // The WAV header is fixed once writing starts; a mid-stream rate change would play at the wrong pitch.
          if (writer != null && newRate != sampleRate) throw InvalidAudioException("Sample rate changed mid-stream")
          sampleRate = newRate
          floatPcm = out.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
            out.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
          continue
        }
        if (outIndex < 0) continue

        val data = codec.getOutputBuffer(outIndex)!!
        if (info.size > 0) {
          if (writer == null) {
            if (sampleRate !in 4000..192000 || channels !in 1..8) throw InvalidAudioException("Invalid audio parameters")
            writer = MonoWavWriter(output, sampleRate)
          }
          data.position(info.offset)
          data.limit(info.offset + info.size)
          data.order(ByteOrder.LITTLE_ENDIAN)
          val bytesPerSample = if (floatPcm) 4 else 2
          val frames = info.size / (bytesPerSample * channels)
          if (mono.size < frames) mono = FloatArray(frames)
          for (f in 0 until frames) {
            var sum = 0f
            for (c in 0 until channels) {
              sum += if (floatPcm) data.float else data.short / 32768f
            }
            mono[f] = sum / channels
          }
          val keep = minOf(frames.toLong(), maxFrames - framesOut).toInt()
          if (keep > 0) writer.write(mono, keep)
          framesOut += keep
        }
        codec.releaseOutputBuffer(outIndex, false)
        if (framesOut >= maxFrames) break
        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
      }

      writer?.close()
      writer = null
      if (framesOut <= 0) throw InvalidAudioException("No audio decoded")
      return Result(framesOut * 1000 / sampleRate, sampleRate)
    } catch (e: Exception) {
      try {
        writer?.close()
      } catch (_: Exception) {
      }
      output.delete()
      throw e
    } finally {
      try {
        codec?.stop()
      } catch (_: IllegalStateException) {
      }
      codec?.release()
      extractor.release()
    }
  }
}
