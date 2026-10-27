package com.voicestudio.offline.audio

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.Closeable
import java.io.EOFException
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class InvalidAudioException(message: String) : IOException(message)

data class WavHeader(
  val audioFormat: Int,
  val channels: Int,
  val sampleRate: Int,
  val bitsPerSample: Int,
  val dataOffset: Long,
  val dataSize: Long,
) {
  val bytesPerFrame: Int get() = channels * (bitsPerSample / 8)
  val frameCount: Long get() = if (bytesPerFrame == 0) 0 else dataSize / bytesPerFrame
  val durationMs: Long get() = if (sampleRate == 0) 0 else frameCount * 1000 / sampleRate
}

object WavIO {
  private const val FORMAT_PCM = 1
  private const val FORMAT_FLOAT = 3
  private const val FORMAT_EXTENSIBLE = 0xFFFE

  /** Parses RIFF/WAVE chunks; supports 16-bit PCM and 32-bit float. */
  fun readHeader(file: File): WavHeader {
    if (!file.isFile) throw InvalidAudioException("File not found")
    RandomAccessFile(file, "r").use { raf ->
      val fileLength = raf.length()
      if (fileLength < 44) throw InvalidAudioException("File too small to be WAV")
      val riff = ByteArray(12)
      raf.readFully(riff)
      if (String(riff, 0, 4, Charsets.US_ASCII) != "RIFF" ||
        String(riff, 8, 4, Charsets.US_ASCII) != "WAVE"
      ) {
        throw InvalidAudioException("Not a WAV file")
      }
      var format = -1
      var channels = 0
      var sampleRate = 0
      var bits = 0
      val chunkHeader = ByteArray(8)
      while (raf.filePointer + 8 <= fileLength) {
        raf.readFully(chunkHeader)
        val id = String(chunkHeader, 0, 4, Charsets.US_ASCII)
        val size = ByteBuffer.wrap(chunkHeader, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int.toLong() and 0xFFFFFFFFL
        when (id) {
          "fmt " -> {
            val fmt = ByteArray(size.toInt().coerceAtMost(64))
            raf.readFully(fmt)
            val bb = ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN)
            format = bb.short.toInt() and 0xFFFF
            channels = bb.short.toInt()
            sampleRate = bb.int
            bb.int // byte rate
            bb.short // block align
            bits = bb.short.toInt()
            if (format == FORMAT_EXTENSIBLE && fmt.size >= 26) {
              format = ByteBuffer.wrap(fmt, 24, 2).order(ByteOrder.LITTLE_ENDIAN).short.toInt()
            }
            raf.seek(raf.filePointer - fmt.size + size + (size and 1))
          }
          "data" -> {
            if (format < 0) throw InvalidAudioException("data before fmt")
            val available = fileLength - raf.filePointer
            val dataSize = if (size == 0L || size > available) available else size
            val supported = (format == FORMAT_PCM && bits == 16) || (format == FORMAT_FLOAT && bits == 32)
            if (!supported) throw InvalidAudioException("Unsupported WAV encoding $format/$bits")
            if (channels !in 1..8 || sampleRate !in 4000..192000) {
              throw InvalidAudioException("Invalid WAV parameters")
            }
            return WavHeader(format, channels, sampleRate, bits, raf.filePointer, dataSize)
          }
          else -> raf.seek(raf.filePointer + size + (size and 1))
        }
      }
    }
    throw InvalidAudioException("No audio data")
  }

  fun headerBytes(sampleRate: Int, channels: Int, dataSize: Long): ByteArray {
    val bb = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    val byteRate = sampleRate * channels * 2
    bb.put("RIFF".toByteArray(Charsets.US_ASCII))
    bb.putInt((36 + dataSize).coerceAtMost(0xFFFFFFFFL).toInt())
    bb.put("WAVE".toByteArray(Charsets.US_ASCII))
    bb.put("fmt ".toByteArray(Charsets.US_ASCII))
    bb.putInt(16)
    bb.putShort(1)
    bb.putShort(channels.toShort())
    bb.putInt(sampleRate)
    bb.putInt(byteRate)
    bb.putShort((channels * 2).toShort())
    bb.putShort(16)
    bb.put("data".toByteArray(Charsets.US_ASCII))
    bb.putInt(dataSize.coerceAtMost(0xFFFFFFFFL).toInt())
    return bb.array()
  }

  fun writeMono(file: File, samples: FloatArray, sampleRate: Int) {
    MonoWavWriter(file, sampleRate).use { it.write(samples, samples.size) }
  }
}

/** Streams a WAV file as mono float samples in [-1, 1], down-mixing if needed. */
class MonoWavReader(file: File) : Closeable {
  val header: WavHeader = WavIO.readHeader(file)
  private val input: InputStream
  private var remaining: Long = header.dataSize
  private val raw = ByteArray(header.bytesPerFrame * 4096)

  init {
    val stream = FileInputStream(file)
    var toSkip = header.dataOffset
    while (toSkip > 0) {
      val skipped = stream.skip(toSkip)
      if (skipped <= 0) throw EOFException()
      toSkip -= skipped
    }
    input = BufferedInputStream(stream, 1 shl 16)
  }

  /** Fills [out] and returns the number of mono samples read, or -1 at the end. */
  fun read(out: FloatArray): Int = read(out, 0, out.size)

  /** Like [read], filling at most [count] samples of [out] starting at [offset]. */
  fun read(out: FloatArray, offset: Int, count: Int): Int {
    if (remaining <= 0) return -1
    val frameBytes = header.bytesPerFrame
    val maxFrames = min(count, raw.size / frameBytes)
    val wanted = min(maxFrames.toLong() * frameBytes, remaining).toInt()
    var got = 0
    while (got < wanted) {
      val n = input.read(raw, got, wanted - got)
      if (n < 0) break
      got += n
    }
    val frames = got / frameBytes
    if (frames == 0) {
      remaining = 0
      return -1
    }
    remaining -= frames.toLong() * frameBytes
    val bb = ByteBuffer.wrap(raw, 0, frames * frameBytes).order(ByteOrder.LITTLE_ENDIAN)
    val channels = header.channels
    for (f in 0 until frames) {
      var sum = 0f
      for (c in 0 until channels) {
        sum += if (header.bitsPerSample == 16) bb.short / 32768f else bb.float
      }
      out[offset + f] = sum / channels
    }
    return frames
  }

  override fun close() = input.close()
}

/** Writes 16-bit mono PCM; the header is patched with the final size on close. */
class MonoWavWriter(private val file: File, val sampleRate: Int) : Closeable {
  private val output: BufferedOutputStream
  private var dataBytes: Long = 0
  private val buffer = ByteBuffer.allocate(8192 * 2).order(ByteOrder.LITTLE_ENDIAN)
  var peak = 0f
    private set

  init {
    file.parentFile?.mkdirs()
    output = BufferedOutputStream(FileOutputStream(file), 1 shl 16)
    output.write(WavIO.headerBytes(sampleRate, 1, 0))
  }

  val framesWritten: Long get() = dataBytes / 2

  fun write(samples: FloatArray, count: Int) {
    var i = 0
    while (i < count) {
      buffer.clear()
      val n = min(count - i, 8192)
      for (k in 0 until n) {
        val s = samples[i + k]
        val abs = if (s < 0) -s else s
        if (abs > peak) peak = abs
        val clipped = max(-1f, min(1f, s))
        buffer.putShort((clipped * 32767f).roundToInt().toShort())
      }
      output.write(buffer.array(), 0, n * 2)
      dataBytes += n * 2L
      i += n
    }
  }

  fun writeSilence(frames: Long) {
    val zeros = ByteArray(8192)
    var left = frames * 2
    while (left > 0) {
      val n = min(left, zeros.size.toLong()).toInt()
      output.write(zeros, 0, n)
      left -= n
    }
    dataBytes += frames * 2
  }

  override fun close() {
    output.flush()
    output.close()
    RandomAccessFile(file, "rw").use { raf ->
      raf.seek(0)
      raf.write(WavIO.headerBytes(sampleRate, 1, dataBytes))
    }
  }
}
