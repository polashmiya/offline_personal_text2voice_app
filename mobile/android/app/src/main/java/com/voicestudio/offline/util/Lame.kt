package com.voicestudio.offline.util

import com.voicestudio.offline.audio.MonoWavReader
import com.voicestudio.offline.audio.Resampler
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * MP3 encoding through LAME (LGPL), built from source by the :lame module.
 * If the native library is missing, MP3 is simply not offered.
 */
object Lame {
  private val MP3_RATES = intArrayOf(8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000)

  val isAvailable: Boolean = try {
    System.loadLibrary("lamejni")
    true
  } catch (_: UnsatisfiedLinkError) {
    false
  }

  private external fun nativeInit(inRate: Int, outRate: Int, bitrateKbps: Int): Long
  private external fun nativeEncode(handle: Long, pcm: ShortArray, count: Int, out: ByteArray): Int
  private external fun nativeFlush(handle: Long, out: ByteArray): Int
  private external fun nativeClose(handle: Long)

  /** [id3] (optional) is written in front of the MP3 frames. */
  fun encodeWav(input: File, output: File, bitrateKbps: Int, requestedRate: Int, id3: ByteArray? = null) {
    if (!isAvailable) throw IOException("MP3 encoder not available")
    MonoWavReader(input).use { reader ->
      val source = reader.header.sampleRate
      // MPEG-2 rates (< 32 kHz) cap at 160 kbps; honour higher bitrates with 44.1 kHz output.
      val base = if (requestedRate > 0) requestedRate else source
      val wanted = if (bitrateKbps > 160 && base < 32000) 44100 else base
      val rate = MP3_RATES.firstOrNull { it >= wanted } ?: 48000
      val resampler = Resampler(source, rate)
      val handle = nativeInit(rate, rate, bitrateKbps)
      if (handle == 0L) throw IOException("LAME init failed")
      try {
        BufferedOutputStream(FileOutputStream(output), 1 shl 16).use { out ->
          if (id3 != null) out.write(id3)
          val block = FloatArray(4096)
          val mp3 = ByteArray(16384)
          while (true) {
            val n = reader.read(block)
            val samples = if (n < 0) resampler.process(block, 0, flush = true) else resampler.process(block, n)
            var offset = 0
            while (offset < samples.size) {
              val count = min(4096, samples.size - offset)
              val pcm = ShortArray(count) { i ->
                (max(-1f, min(1f, samples[offset + i])) * 32767f).roundToInt().toShort()
              }
              val written = nativeEncode(handle, pcm, count, mp3)
              if (written < 0) throw IOException("LAME encode error $written")
              out.write(mp3, 0, written)
              offset += count
            }
            if (n < 0) break
          }
          val tail = nativeFlush(handle, mp3)
          if (tail > 0) out.write(mp3, 0, tail)
        }
      } finally {
        nativeClose(handle)
      }
    }
  }
}
