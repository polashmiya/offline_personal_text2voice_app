package com.voicestudio.offline.audio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.sin

/**
 * Streaming windowed-sinc resampler (mono). Uses a precomputed polyphase
 * table so long files resample in linear time with no per-sample trig.
 */
class Resampler(private val inRate: Int, private val outRate: Int) {
  private val step = inRate.toDouble() / outRate
  private val cutoff = min(1.0, outRate.toDouble() / inRate) * 0.94
  private val table: Array<FloatArray> = Array(PHASES) { phase ->
    val frac = phase.toDouble() / PHASES
    val kernel = FloatArray(TAPS * 2)
    var sum = 0.0
    for (t in 0 until TAPS * 2) {
      // tap t covers input index (center - TAPS + 1 + t)
      val x = frac + TAPS - 1 - t
      val w = sinc(x * cutoff) * cutoff * hann(x / TAPS)
      kernel[t] = w.toFloat()
      sum += w
    }
    for (t in kernel.indices) kernel[t] = (kernel[t] / sum).toFloat()
    kernel
  }

  private var history = FloatArray(0)
  private var position = 0.0

  val isPassThrough: Boolean get() = inRate == outRate

  fun process(input: FloatArray, count: Int, flush: Boolean = false): FloatArray {
    if (isPassThrough) return input.copyOf(count)
    val buffer = FloatArray(history.size + count + if (flush) TAPS * 2 else 0)
    history.copyInto(buffer)
    input.copyInto(buffer, history.size, 0, count)
    val usable = history.size + count + if (flush) TAPS else 0

    val out = FloatArray(((usable - position) / step).toInt() + 2)
    var produced = 0
    while (true) {
      val base = floor(position).toInt()
      if (base + TAPS >= usable) break
      val frac = position - base
      val kernel = table[min(PHASES - 1, (frac * PHASES).toInt())]
      var acc = 0f
      val start = base - TAPS + 1
      for (t in 0 until TAPS * 2) {
        val idx = start + t
        if (idx >= 0) acc += buffer[idx] * kernel[t]
      }
      if (produced == out.size) break
      out[produced++] = acc
      position += step
    }
    val drop = (floor(position).toInt() - TAPS).coerceIn(0, history.size + count)
    history = buffer.copyOfRange(drop, history.size + count)
    position -= drop
    return out.copyOf(produced)
  }

  private fun sinc(x: Double): Double = if (x == 0.0) 1.0 else sin(PI * x) / (PI * x)

  private fun hann(t: Double): Double = if (t <= -1.0 || t >= 1.0) 0.0 else 0.5 * (1 + cos(PI * t))

  companion object {
    private const val TAPS = 16
    private const val PHASES = 512
  }
}
