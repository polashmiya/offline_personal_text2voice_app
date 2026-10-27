package com.voicestudio.offline.audio

import java.io.Closeable
import java.io.File
import java.io.IOException
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

data class MixParams(
  val voice: File,
  /** Mono WAV (already decoded); null = no background music. */
  val music: File?,
  val output: File,
  /** Scratch folder for resampled copies; deleted by the caller. */
  val workDir: File,
  /** 0 = keep the voice sample rate. */
  val sampleRate: Int,
  val voiceGain: Float,
  val musicGain: Float,
  val loopMusic: Boolean,
  val trimStartMs: Double,
  val trimEndMs: Double,
  val padStartMs: Double,
  val padEndMs: Double,
  val musicFadeInMs: Double,
  val musicFadeOutMs: Double,
  val duck: Boolean,
  /** How far music drops under speech, in dB (positive). */
  val duckDb: Float,
  val duckAttackMs: Double,
  val duckReleaseMs: Double,
  val normalize: Boolean,
)

data class MixResult(val durationMs: Long, val sampleRate: Int, val peak: Float)

/**
 * Voice + background music mixer. Streaming and file based: audio is never
 * held in memory whole. The timeline is
 *
 *   [padStart][voice (trimmed)][padEnd]
 *
 * with music under the whole timeline (looped if asked), faded in/out,
 * ducked under speech, then master gain and a lookahead limiter.
 * The mix is rendered twice: pass 1 measures loudness, pass 2 writes.
 */
object Mixer {
  private const val HOP_MS = 10
  private const val SPEECH_RMS = 0.015f // ≈ -36 dBFS: below this a hop counts as pause
  private const val DUCK_HOLD_MS = 600 // pauses shorter than this keep the music down
  private const val VOICE_EDGE_FADE_MS = 6
  private const val LOOP_EDGE_FADE_MS = 30
  private val TARGET_RMS = 10.0.pow(-20.0 / 20).toFloat()
  private val CEILING = 10.0.pow(-1.0 / 20).toFloat()

  fun mix(p: MixParams): MixResult {
    val voiceRate = WavIO.readHeader(p.voice).sampleRate
    val rate = if (p.sampleRate > 0) p.sampleRate else voiceRate
    p.workDir.mkdirs()
    val voice = atRate(p.voice, rate, File(p.workDir, "voice.wav"))
    val music = p.music?.let { atRate(it, rate, File(p.workDir, "music.wav")) }

    val voiceFrames = WavIO.readHeader(voice).frameCount
    val trimStart = msToFrames(p.trimStartMs, rate).coerceAtLeast(0)
    val trimEnd = msToFrames(p.trimEndMs, rate).coerceAtLeast(0)
    val voiceLength = voiceFrames - trimStart - trimEnd
    if (voiceLength <= 0) throw IllegalArgumentException("Trim removes all of the voice")

    val timeline = Timeline(
      padStart = msToFrames(p.padStartMs, rate).coerceAtLeast(0),
      voiceStart = trimStart,
      voiceLength = voiceLength,
      padEnd = msToFrames(p.padEndMs, rate).coerceAtLeast(0),
    )
    val duckCurve = if (music != null && p.duck && p.duckDb > 0) duckCurve(voice, timeline, rate, p) else null

    // Pass 1: loudness of the mix where it is audible.
    var gain = 1f
    if (p.normalize) {
      var sumSquares = 0.0
      var count = 0L
      Renderer(voice, music, timeline, rate, p, duckCurve).use { r ->
        val block = FloatArray(BLOCK)
        while (true) {
          val n = r.next(block)
          if (n <= 0) break
          for (i in 0 until n) {
            val a = abs(block[i])
            if (a > SPEECH_RMS) {
              sumSquares += a * a
              count++
            }
          }
        }
      }
      if (count > 0) gain = (TARGET_RMS / sqrt(sumSquares / count).toFloat()).coerceIn(0.25f, 4f)
    }

    // Pass 2: write with master gain and limiter.
    val temp = File(p.output.parentFile, "${p.output.name}.part")
    temp.delete()
    val limiter = Limiter(rate, CEILING)
    var peak = 0f
    try {
      MonoWavWriter(temp, rate).use { writer ->
        Renderer(voice, music, timeline, rate, p, duckCurve).use { r ->
          val block = FloatArray(BLOCK)
          var skip = limiter.latency
          fun emit(buf: FloatArray, n: Int) {
            var from = 0
            if (skip > 0) {
              from = min(skip, n)
              skip -= from
            }
            if (from < n) {
              val out = if (from == 0) buf else buf.copyOfRange(from, n)
              writer.write(out, n - from)
            }
          }
          while (true) {
            val n = r.next(block)
            if (n <= 0) break
            for (i in 0 until n) block[i] *= gain
            limiter.process(block, n)
            emit(block, n)
          }
          // Flush the limiter's lookahead.
          val tail = FloatArray(limiter.latency)
          limiter.process(tail, tail.size)
          emit(tail, tail.size)
        }
        peak = writer.peak
      }
      if (p.output.exists()) p.output.delete()
      if (!temp.renameTo(p.output)) throw IOException("Could not finalize mix")
    } catch (e: Exception) {
      temp.delete()
      throw e
    }
    val header = WavIO.readHeader(p.output)
    if (header.frameCount <= 0) throw InvalidAudioException("Mix is empty")
    return MixResult(header.durationMs, rate, peak)
  }

  /** Copies [input] to [output] at [rate] (16-bit mono). Returns [input] if no change is needed. */
  fun atRate(input: File, rate: Int, output: File): File {
    if (WavIO.readHeader(input).sampleRate == rate) return input
    resampleWav(input, output, rate)
    return output
  }

  fun resampleWav(input: File, output: File, sampleRate: Int) {
    MonoWavReader(input).use { reader ->
      val rate = if (sampleRate > 0) sampleRate else reader.header.sampleRate
      val resampler = Resampler(reader.header.sampleRate, rate)
      MonoWavWriter(output, rate).use { writer ->
        val block = FloatArray(BLOCK)
        while (true) {
          val n = reader.read(block)
          val out = if (n < 0) resampler.process(block, 0, flush = true) else resampler.process(block, n)
          writer.write(out, out.size)
          if (n < 0) break
        }
      }
    }
  }

  private fun msToFrames(ms: Double, rate: Int): Long = (ms * rate / 1000).toLong()

  private const val BLOCK = 8192

  private class Timeline(val padStart: Long, val voiceStart: Long, val voiceLength: Long, val padEnd: Long) {
    val total: Long get() = padStart + voiceLength + padEnd
  }

  /**
   * Music gain per 10 ms hop: speech activity (RMS gate), widened by the
   * attack (so music dips just *before* a word) and a hold (so short pauses
   * don't pump), then smoothed with attack/release time constants.
   */
  private fun duckCurve(voice: File, t: Timeline, rate: Int, p: MixParams): FloatArray {
    val hop = rate * HOP_MS / 1000
    val hops = ceil(t.total.toDouble() / hop).toInt() + 1
    val active = BooleanArray(hops)
    MonoWavReader(voice).use { reader ->
      skipFrames(reader, t.voiceStart)
      val buf = FloatArray(hop)
      var done = 0L
      while (done < t.voiceLength) {
        val want = min(hop.toLong(), t.voiceLength - done).toInt()
        val n = readFully(reader, buf, want)
        if (n <= 0) break
        var sum = 0.0
        for (i in 0 until n) sum += buf[i] * buf[i] * p.voiceGain * p.voiceGain
        if (sqrt(sum / n) > SPEECH_RMS) {
          active[((t.padStart + done) / hop).toInt().coerceAtMost(hops - 1)] = true
        }
        done += n
      }
    }
    // Widen: hop h is "under speech" if speech occurs in [h - hold, h + lookahead].
    val lookahead = max(1, (p.duckAttackMs / HOP_MS).toInt())
    val hold = DUCK_HOLD_MS / HOP_MS
    val prefix = IntArray(hops + 1)
    for (h in 0 until hops) prefix[h + 1] = prefix[h] + if (active[h]) 1 else 0
    val low = 10.0.pow(-p.duckDb / 20.0).toFloat()
    val attack = 1f - exp(-HOP_MS / max(1.0, p.duckAttackMs)).toFloat()
    val release = 1f - exp(-HOP_MS / max(1.0, p.duckReleaseMs)).toFloat()
    val curve = FloatArray(hops)
    var g = 1f
    for (h in 0 until hops) {
      val from = max(0, h - hold)
      val to = min(hops, h + lookahead + 1)
      val target = if (prefix[to] - prefix[from] > 0) low else 1f
      g += (target - g) * if (target < g) attack else release
      curve[h] = g
    }
    return curve
  }

  private fun skipFrames(reader: MonoWavReader, frames: Long) {
    val buf = FloatArray(BLOCK)
    var left = frames
    while (left > 0) {
      val n = readFully(reader, buf, min(left, BLOCK.toLong()).toInt())
      if (n <= 0) break
      left -= n
    }
  }

  /** Reads exactly [count] samples unless the file ends first. */
  private fun readFully(reader: MonoWavReader, out: FloatArray, count: Int): Int {
    var got = 0
    while (got < count) {
      val n = reader.read(out, got, count - got)
      if (n < 0) break
      got += n
    }
    return got
  }

  /** Produces the un-mastered timeline mix block by block. */
  private class Renderer(
    voiceFile: File,
    private val musicFile: File?,
    private val t: Timeline,
    private val rate: Int,
    private val p: MixParams,
    private val duck: FloatArray?,
  ) : Closeable {
    private val voice = MonoWavReader(voiceFile)
    private var music: MonoWavReader? = musicFile?.let { MonoWavReader(it) }
    private val musicFrames = music?.header?.frameCount ?: 0L
    private var musicPos = 0L // position inside the current loop iteration
    private var pos = 0L
    private val voiceEdge = (rate * VOICE_EDGE_FADE_MS / 1000).toLong()
    private val loopEdge = (rate * LOOP_EDGE_FADE_MS / 1000).toLong().coerceAtMost(musicFrames / 4)
    private val fadeIn = msToFrames(p.musicFadeInMs, rate)
    private val fadeOut = msToFrames(p.musicFadeOutMs, rate)
    private val hop = rate * HOP_MS / 1000
    private val voiceBuf = FloatArray(BLOCK)
    private val musicBuf = FloatArray(BLOCK)
    private val scratch = FloatArray(BLOCK)
    private var looped = false

    init {
      skipFrames(voice, t.voiceStart)
    }

    fun next(out: FloatArray): Int {
      val n = min(out.size.toLong(), t.total - pos).toInt()
      if (n <= 0) return 0

      // Voice: the part of this block that overlaps the voice region.
      voiceBuf.fill(0f, 0, n)
      val vStart = t.padStart
      val vEnd = t.padStart + t.voiceLength
      val from = max(pos, vStart)
      val to = min(pos + n, vEnd)
      if (to > from) {
        val count = (to - from).toInt()
        val got = readFully(voice, scratch, count)
        for (i in 0 until got) {
          val inVoice = from + i - vStart
          var s = scratch[i] * p.voiceGain
          if (inVoice < voiceEdge) s *= inVoice.toFloat() / voiceEdge
          val fromEnd = t.voiceLength - 1 - inVoice
          if (fromEnd < voiceEdge) s *= max(0f, fromEnd.toFloat() / voiceEdge)
          voiceBuf[(from - pos).toInt() + i] = s
        }
      }

      // Music (looped), with loop-seam fades, fade in/out and ducking.
      readMusic(musicBuf, n)
      for (i in 0 until n) {
        val at = pos + i
        var m = musicBuf[i] * p.musicGain
        if (m != 0f) {
          if (at < fadeIn) m *= at.toFloat() / fadeIn
          val toEnd = t.total - at
          if (toEnd < fadeOut) m *= toEnd.toFloat() / fadeOut
          if (duck != null) {
            val hf = at.toDouble() / hop
            val h = hf.toInt().coerceAtMost(duck.size - 2)
            val frac = (hf - h).toFloat().coerceIn(0f, 1f)
            m *= duck[h] + (duck[h + 1] - duck[h]) * frac
          }
        }
        out[i] = voiceBuf[i] + m
      }
      pos += n
      return n
    }

    /** Fills [out] with the next [n] music samples; loops by reopening the file. */
    private fun readMusic(out: FloatArray, n: Int) {
      out.fill(0f, 0, n)
      var filled = 0
      while (filled < n) {
        val reader = music ?: return
        val want = n - filled
        val got = readFully(reader, scratch, want)
        for (i in 0 until got) {
          val inLoop = musicPos + i
          var s = scratch[i]
          if (loopEdge > 0) {
            // Short fades at every seam so loops (and an early end) never click.
            if (looped && inLoop < loopEdge) s *= inLoop.toFloat() / loopEdge
            val fromEnd = musicFrames - 1 - inLoop
            if (fromEnd < loopEdge) s *= max(0f, fromEnd.toFloat() / loopEdge)
          }
          out[filled + i] = s
        }
        filled += got
        musicPos += got
        if (got < want) {
          reader.close()
          music = null
          if (p.loopMusic && musicPos > 0) {
            music = MonoWavReader(musicFile!!)
            musicPos = 0
            looped = true
          }
        }
      }
    }

    override fun close() {
      voice.close()
      music?.close()
    }
  }

  /**
   * Lookahead peak limiter: signal delayed by L samples; gain = sliding
   * minimum of the required gain over L+1 samples (with release), then a
   * box filter of length L+1. Every gain value averaged for an output
   * sample comes from a window containing that sample, so no sample exceeds
   * the ceiling, while the gain itself never jumps (no clicks).
   */
  private class Limiter(rate: Int, private val ceiling: Float) {
    val latency = max(1, rate * 5 / 1000) // 5 ms
    private val size = latency + 1
    private val delay = FloatArray(latency)
    private var delayIdx = 0
    // monotonic deque for the sliding minimum of required gain
    private val dqVal = FloatArray(size)
    private val dqIdx = LongArray(size)
    private var dqHead = 0
    private var dqLen = 0
    private val box = FloatArray(size) { 1f }
    private var boxIdx = 0
    private var boxSum = size.toDouble()
    private var held = 1f
    private val releaseCoef = exp(-1.0 / (rate * 0.08)).toFloat() // 80 ms
    private var n = 0L

    fun process(buf: FloatArray, count: Int) {
      for (i in 0 until count) {
        val x = buf[i]
        val a = abs(x)
        val need = if (a > ceiling) ceiling / a else 1f

        // Sliding minimum over the last `size` samples: evict, then push.
        while (dqLen > 0 && dqIdx[dqHead] <= n - size) {
          dqHead = (dqHead + 1) % size
          dqLen--
        }
        while (dqLen > 0 && dqVal[(dqHead + dqLen - 1) % size] >= need) dqLen--
        val slot = (dqHead + dqLen) % size
        dqVal[slot] = need
        dqIdx[slot] = n
        dqLen++
        val windowMin = dqVal[dqHead]

        held = min(windowMin, 1f - (1f - held) * releaseCoef)
        boxSum += held - box[boxIdx]
        box[boxIdx] = held
        boxIdx = (boxIdx + 1) % size
        val g = (boxSum / size).toFloat()

        val delayed = delay[delayIdx]
        delay[delayIdx] = x
        delayIdx = (delayIdx + 1) % latency
        // `delayed` entered `latency` samples ago; clamp guards float rounding only.
        buf[i] = (delayed * g).coerceIn(-ceiling, ceiling)
        n++
      }
    }
  }
}
