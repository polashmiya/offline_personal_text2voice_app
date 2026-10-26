package com.voicestudio.offline.recorder

import com.voicestudio.offline.audio.MonoWavReader
import java.io.File
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/** Objective measurements of one recorded take. Verdicts are made in JS. */
data class TakeAnalysis(
  val durationMs: Long,
  val sampleRate: Int,
  val speechMs: Long,
  val leadingSilenceMs: Long,
  val trailingSilenceMs: Long,
  val peakDb: Double,
  val speechRmsDb: Double,
  val noiseFloorDb: Double,
  val clippedSamples: Int,
)

object TakeAnalyzer {
  private const val FRAME_MS = 20
  private const val FLOOR_DB = -96.0
  private const val CLIP_LEVEL = 0.999f

  fun toDb(linear: Double): Double = if (linear <= 1e-9) FLOOR_DB else max(FLOOR_DB, 20 * log10(linear))

  fun analyze(file: File): TakeAnalysis {
    MonoWavReader(file).use { reader ->
      val rate = reader.header.sampleRate
      val frameLen = rate * FRAME_MS / 1000
      val frameEnergy = ArrayList<Double>(1024)
      val block = FloatArray(4096)
      var acc = 0.0
      var inFrame = 0
      var peak = 0f
      var clipped = 0
      while (true) {
        val n = reader.read(block)
        if (n < 0) break
        for (i in 0 until n) {
          val s = block[i]
          val a = if (s < 0) -s else s
          if (a > peak) peak = a
          if (a >= CLIP_LEVEL) clipped++
          acc += s * s
          if (++inFrame == frameLen) {
            frameEnergy.add(acc / frameLen)
            acc = 0.0
            inFrame = 0
          }
        }
      }
      val frameDb = DoubleArray(frameEnergy.size) { toDb(sqrt(frameEnergy[it])) }
      val durationMs = reader.header.durationMs
      if (frameDb.isEmpty()) {
        return TakeAnalysis(durationMs, rate, 0, 0, 0, toDb(peak.toDouble()), FLOOR_DB, FLOOR_DB, clipped)
      }

      // Noise floor: the quietest 10% of frames. Speech: 12 dB above it (never below -50 dBFS).
      val sorted = frameDb.sorted()
      val noise = sorted[(sorted.size * 0.1).toInt().coerceAtMost(sorted.size - 1)]
      val threshold = max(noise + 12.0, -50.0)
      val first = frameDb.indexOfFirst { it > threshold }
      val last = frameDb.indexOfLast { it > threshold }
      if (first < 0) {
        return TakeAnalysis(durationMs, rate, 0, durationMs, 0, toDb(peak.toDouble()), FLOOR_DB, noise, clipped)
      }
      var speechEnergy = 0.0
      var speechFrames = 0
      for (i in first..last) {
        if (frameDb[i] > threshold) {
          speechEnergy += frameEnergy[i]
          speechFrames++
        }
      }
      return TakeAnalysis(
        durationMs = durationMs,
        sampleRate = rate,
        speechMs = (last - first + 1).toLong() * FRAME_MS,
        leadingSilenceMs = first.toLong() * FRAME_MS,
        trailingSilenceMs = (frameDb.size - 1 - last).toLong() * FRAME_MS,
        peakDb = toDb(peak.toDouble()),
        speechRmsDb = toDb(sqrt(speechEnergy / max(1, speechFrames))),
        noiseFloorDb = noise,
        clippedSamples = clipped,
      )
    }
  }
}
