package com.voicestudio.offline.audio

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Encodes a mono WAV file with the platform MediaCodec encoders:
 * AAC → .m4a (MP4 container), FLAC → .flac (raw stream), Opus → .ogg (API 29+).
 * Only formats whose encoder exists on this device are offered.
 */
object AudioEncoder {
  const val MIME_AAC = MediaFormat.MIMETYPE_AUDIO_AAC
  const val MIME_FLAC = MediaFormat.MIMETYPE_AUDIO_FLAC
  const val MIME_OPUS = MediaFormat.MIMETYPE_AUDIO_OPUS

  private val OPUS_RATES = intArrayOf(8000, 12000, 16000, 24000, 48000)
  private const val TIMEOUT_US = 10_000L

  fun hasEncoder(mime: String): Boolean =
    MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
      info.isEncoder && info.supportedTypes.any { it.equals(mime, ignoreCase = true) }
    }

  fun supportedFormats(): List<String> {
    val formats = mutableListOf("wav")
    if (hasEncoder(MIME_AAC)) formats += "m4a"
    if (hasEncoder(MIME_FLAC)) formats += "flac"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && hasEncoder(MIME_OPUS)) formats += "opus"
    return formats
  }

  /** Sample rate the encoder will receive for a requested/source rate. */
  fun targetRate(format: String, requested: Int, source: Int): Int {
    val wanted = if (requested > 0) requested else source
    return when (format) {
      "opus" -> OPUS_RATES.firstOrNull { it >= wanted } ?: 48000
      "m4a" -> wanted.coerceIn(8000, 48000)
      else -> wanted
    }
  }

  fun encode(input: File, output: File, format: String, bitrateKbps: Int, requestedRate: Int) {
    val mime = when (format) {
      "m4a" -> MIME_AAC
      "flac" -> MIME_FLAC
      "opus" -> MIME_OPUS
      else -> throw IllegalArgumentException("Unsupported format $format")
    }
    MonoWavReader(input).use { reader ->
      val rate = targetRate(format, requestedRate, reader.header.sampleRate)
      val resampler = Resampler(reader.header.sampleRate, rate)
      val mediaFormat = MediaFormat.createAudioFormat(mime, rate, 1).apply {
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
        when (format) {
          "m4a" -> {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrateKbps * 1000)
          }
          "opus" -> setInteger(MediaFormat.KEY_BIT_RATE, min(bitrateKbps, 256) * 1000)
          "flac" -> setInteger(MediaFormat.KEY_FLAC_COMPRESSION_LEVEL, 5)
        }
      }
      output.parentFile?.mkdirs()
      val sink: EncodedSink = when (format) {
        "m4a" -> MuxerSink(output, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        "opus" -> MuxerSink(output, MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG)
        else -> FlacSink(output)
      }
      var codec: MediaCodec? = null
      try {
        codec = MediaCodec.createEncoderByType(mime)
        codec.configure(mediaFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        pump(codec, reader, resampler, rate, sink)
        sink.finish()
      } catch (e: Exception) {
        sink.abort()
        output.delete()
        throw IOException("Encoding to $format failed: ${e.message}", e)
      } finally {
        try {
          codec?.stop()
        } catch (_: IllegalStateException) {
        }
        codec?.release()
      }
    }
  }

  private fun pump(codec: MediaCodec, reader: MonoWavReader, resampler: Resampler, rate: Int, sink: EncodedSink) {
    val info = MediaCodec.BufferInfo()
    val readBuffer = FloatArray(4096)
    var pending = ShortArray(0)
    var pendingOffset = 0
    var inputDone = false
    var framesQueued = 0L

    fun refill(): Boolean {
      val n = reader.read(readBuffer)
      val samples = if (n < 0) resampler.process(readBuffer, 0, flush = true) else resampler.process(readBuffer, n)
      pending = ShortArray(samples.size) { i -> (max(-1f, min(1f, samples[i])) * 32767f).roundToInt().toShort() }
      pendingOffset = 0
      return n >= 0
    }
    var moreInput = refill()

    while (true) {
      if (!inputDone) {
        val index = codec.dequeueInputBuffer(TIMEOUT_US)
        if (index >= 0) {
          val buffer = codec.getInputBuffer(index)!!
          buffer.clear()
          buffer.order(ByteOrder.LITTLE_ENDIAN)
          var bytes = 0
          while (buffer.remaining() >= 2) {
            if (pendingOffset >= pending.size) {
              if (!moreInput) break
              moreInput = refill()
              continue
            }
            val count = min(pending.size - pendingOffset, buffer.remaining() / 2)
            buffer.asShortBuffer().put(pending, pendingOffset, count)
            buffer.position(buffer.position() + count * 2)
            pendingOffset += count
            bytes += count * 2
          }
          val ptsUs = framesQueued * 1_000_000L / rate
          framesQueued += bytes / 2
          val finished = !moreInput && pendingOffset >= pending.size
          codec.queueInputBuffer(index, 0, bytes, ptsUs, if (finished) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
          if (finished) inputDone = true
        }
      }

      val outIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)
      when {
        outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> sink.start(codec.outputFormat)
        outIndex >= 0 -> {
          val data = codec.getOutputBuffer(outIndex)!!
          if (info.size > 0) {
            data.position(info.offset)
            data.limit(info.offset + info.size)
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
              sink.codecConfig(data)
            } else {
              sink.sample(data, info)
            }
          }
          codec.releaseOutputBuffer(outIndex, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }
    }
  }

  private interface EncodedSink {
    fun start(format: MediaFormat)
    fun codecConfig(data: ByteBuffer)
    fun sample(data: ByteBuffer, info: MediaCodec.BufferInfo)
    fun finish()
    fun abort()
  }

  private class MuxerSink(file: File, outputFormat: Int) : EncodedSink {
    private val muxer = MediaMuxer(file.absolutePath, outputFormat)
    private var track = -1
    private var started = false

    override fun start(format: MediaFormat) {
      track = muxer.addTrack(format)
      muxer.start()
      started = true
    }

    override fun codecConfig(data: ByteBuffer) = Unit // carried in the output format

    override fun sample(data: ByteBuffer, info: MediaCodec.BufferInfo) {
      check(started) { "Muxer not started" }
      muxer.writeSampleData(track, data, info)
    }

    override fun finish() {
      if (started) muxer.stop()
      muxer.release()
    }

    override fun abort() {
      try {
        if (started) muxer.stop()
      } catch (_: Exception) {
      }
      muxer.release()
    }
  }

  /** FLAC from MediaCodec is a raw stream: "fLaC" + STREAMINFO header, then frames. */
  private class FlacSink(file: File) : EncodedSink {
    private val out = BufferedOutputStream(FileOutputStream(file), 1 shl 16)
    private var headerWritten = false

    override fun start(format: MediaFormat) {
      val csd = format.getByteBuffer("csd-0") ?: return
      codecConfig(csd)
    }

    override fun codecConfig(data: ByteBuffer) {
      if (headerWritten) return
      val bytes = ByteArray(data.remaining())
      data.duplicate().get(bytes)
      if (bytes.size >= 4 && String(bytes, 0, 4, Charsets.US_ASCII) == "fLaC") {
        out.write(bytes)
      } else {
        // Some encoders emit only the STREAMINFO block: add the stream marker.
        out.write("fLaC".toByteArray(Charsets.US_ASCII))
        out.write(bytes)
      }
      headerWritten = true
    }

    override fun sample(data: ByteBuffer, info: MediaCodec.BufferInfo) {
      check(headerWritten) { "FLAC header missing" }
      val bytes = ByteArray(data.remaining())
      data.get(bytes)
      out.write(bytes)
    }

    override fun finish() {
      out.flush()
      out.close()
      if (!headerWritten) throw IOException("FLAC encoder produced no header")
    }

    override fun abort() {
      try {
        out.close()
      } catch (_: Exception) {
      }
    }
  }
}
