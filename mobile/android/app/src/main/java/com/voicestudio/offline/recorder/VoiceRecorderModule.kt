package com.voicestudio.offline.recorder

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.voicestudio.offline.audio.MonoWavWriter
import com.voicestudio.offline.specs.NativeVoiceRecorderSpec
import com.voicestudio.offline.util.ErrorCodes
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Records 16-bit mono PCM WAV for the personal voice dataset. Nothing is
 * compressed or sent anywhere; files stay in app storage until the user
 * exports them.
 */
class VoiceRecorderModule(private val context: ReactApplicationContext) : NativeVoiceRecorderSpec(context) {

  private val io = Executors.newSingleThreadExecutor()
  private val lock = Any()
  private var session: Session? = null

  @Volatile private var levelDb = TakeAnalyzer.toDb(0.0)
  @Volatile private var peakDb = TakeAnalyzer.toDb(0.0)
  @Volatile private var framesCaptured = 0L
  @Volatile private var activeRate = 0

  private class Session(
    val record: AudioRecord,
    val file: File?,
    val writer: MonoWavWriter?,
    val stop: AtomicBoolean,
    val thread: Thread,
    val autoStopped: AtomicBoolean,
    var failure: Exception? = null,
  )

  override fun getName() = NAME

  override fun invalidate() {
    synchronized(lock) { session?.let { abort(it) } }
    io.shutdown()
    super.invalidate()
  }

  private fun hasPermission() =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  /** Only paths inside this app's private storage. */
  private fun safeFile(path: String): File {
    val file = File(path).canonicalFile
    val roots = listOfNotNull(context.filesDir, context.cacheDir).map { it.canonicalFile.path }
    if (roots.none { file.path.startsWith(it + File.separator) }) throw SecurityException("Path outside app storage")
    return file
  }

  @SuppressLint("MissingPermission")
  private fun openRecord(): AudioRecord {
    for (rate in RATES) {
      val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      if (min <= 0) continue
      // Voice recognition: fixed gain, minimal processing — closest to a clean studio take.
      val record = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        rate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        max(min, rate / 5 * 2),
      )
      if (record.state == AudioRecord.STATE_INITIALIZED) return record
      record.release()
    }
    throw IOException("Microphone unavailable")
  }

  private fun begin(file: File?, maxMs: Long): Session {
    val record = openRecord()
    val rate = record.sampleRate
    val writer = file?.let { MonoWavWriter(it, rate) }
    val stop = AtomicBoolean(false)
    val autoStopped = AtomicBoolean(false)
    val maxFrames = maxMs * rate / 1000
    levelDb = TakeAnalyzer.toDb(0.0)
    peakDb = levelDb
    framesCaptured = 0
    activeRate = rate
    lateinit var created: Session
    val thread = Thread({
      val pcm = ShortArray(rate / 50) // 20 ms blocks
      val floats = FloatArray(pcm.size)
      try {
        record.startRecording()
        if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) throw IOException("Microphone busy")
        while (!stop.get()) {
          val n = record.read(pcm, 0, pcm.size)
          if (n < 0) throw IOException("Microphone read error $n")
          if (n == 0) continue
          var energy = 0.0
          var blockPeak = 0f
          for (i in 0 until n) {
            val s = pcm[i] / 32768f
            floats[i] = s
            energy += s * s
            val a = if (s < 0) -s else s
            if (a > blockPeak) blockPeak = a
          }
          writer?.write(floats, n)
          levelDb = TakeAnalyzer.toDb(sqrt(energy / n))
          peakDb = TakeAnalyzer.toDb(blockPeak.toDouble())
          framesCaptured += n
          if (framesCaptured >= maxFrames) {
            autoStopped.set(true)
            break
          }
        }
      } catch (e: Exception) {
        created.failure = e
      } finally {
        try {
          record.stop()
        } catch (_: IllegalStateException) {
        }
      }
    }, "voice-recorder")
    created = Session(record, file, writer, stop, thread, autoStopped)
    thread.start()
    return created
  }

  private fun finish(s: Session) {
    s.stop.set(true)
    s.thread.join(3000)
    s.record.release()
    s.writer?.close()
  }

  private fun abort(s: Session) {
    try {
      finish(s)
    } catch (_: Exception) {
    }
    s.file?.delete()
    session = null
  }

  override fun start(outputPath: String, maxDurationMs: Double, promise: Promise) {
    if (!hasPermission()) return promise.reject(ErrorCodes.MIC_PERMISSION, "Microphone permission not granted")
    synchronized(lock) {
      if (session != null) return promise.reject(ErrorCodes.BUSY, "Already recording")
      try {
        val file = safeFile(outputPath)
        file.parentFile?.mkdirs()
        session = begin(file, maxDurationMs.toLong().coerceIn(1000, MAX_TAKE_MS))
        promise.resolve(Arguments.createMap().apply { putInt("sampleRate", activeRate) })
      } catch (e: Exception) {
        session = null
        promise.reject(ErrorCodes.RECORDING_FAILED, e.message, e)
      }
    }
  }

  override fun stop(promise: Promise) {
    val s = synchronized(lock) { session.also { session = null } }
      ?: return promise.reject(ErrorCodes.RECORDING_FAILED, "Not recording")
    io.execute {
      try {
        finish(s)
        s.failure?.let { throw it }
        val file = s.file ?: throw IOException("No file")
        promise.resolve(toMap(TakeAnalyzer.analyze(file)).apply { putBoolean("autoStopped", s.autoStopped.get()) })
      } catch (e: Exception) {
        s.file?.delete()
        promise.reject(ErrorCodes.RECORDING_FAILED, e.message, e)
      }
    }
  }

  override fun cancel(promise: Promise) {
    val s = synchronized(lock) { session.also { session = null } }
    if (s == null) return promise.resolve(null)
    io.execute {
      abort(s)
      promise.resolve(null)
    }
  }

  override fun getLevel(): WritableMap = Arguments.createMap().apply {
    val s = session
    putBoolean("recording", s != null)
    putBoolean("autoStopped", s?.autoStopped?.get() ?: false)
    putDouble("levelDb", levelDb)
    putDouble("peakDb", peakDb)
    putDouble("elapsedMs", if (activeRate > 0) framesCaptured * 1000.0 / activeRate else 0.0)
  }

  override fun analyze(path: String, promise: Promise) {
    io.execute {
      try {
        promise.resolve(toMap(TakeAnalyzer.analyze(safeFile(path))).apply { putBoolean("autoStopped", false) })
      } catch (e: Exception) {
        promise.reject(ErrorCodes.INVALID_AUDIO, e.message, e)
      }
    }
  }

  /** Records a few seconds of room tone (not saved) and reports the background noise level. */
  override fun measureNoise(durationMs: Double, promise: Promise) {
    if (!hasPermission()) return promise.reject(ErrorCodes.MIC_PERMISSION, "Microphone permission not granted")
    val s = synchronized(lock) {
      if (session != null) return promise.reject(ErrorCodes.BUSY, "Already recording")
      try {
        begin(null, durationMs.toLong().coerceIn(500, 10_000)).also { session = it }
      } catch (e: Exception) {
        return promise.reject(ErrorCodes.RECORDING_FAILED, e.message, e)
      }
    }
    io.execute {
      try {
        val levels = ArrayList<Double>()
        var maxPeak = TakeAnalyzer.toDb(0.0)
        while (s.thread.isAlive) {
          Thread.sleep(50)
          levels.add(levelDb)
          maxPeak = max(maxPeak, peakDb)
        }
        synchronized(lock) { if (session === s) session = null }
        finish(s)
        s.failure?.let { throw it }
        val sorted = levels.sorted()
        val median = if (sorted.isEmpty()) TakeAnalyzer.toDb(0.0) else sorted[sorted.size / 2]
        promise.resolve(
          Arguments.createMap().apply {
            putDouble("noiseDb", median)
            putDouble("peakDb", maxPeak)
          },
        )
      } catch (e: Exception) {
        promise.reject(ErrorCodes.RECORDING_FAILED, e.message, e)
      }
    }
  }

  private fun toMap(a: TakeAnalysis): WritableMap = Arguments.createMap().apply {
    putDouble("durationMs", a.durationMs.toDouble())
    putInt("sampleRate", a.sampleRate)
    putDouble("speechMs", a.speechMs.toDouble())
    putDouble("leadingSilenceMs", a.leadingSilenceMs.toDouble())
    putDouble("trailingSilenceMs", a.trailingSilenceMs.toDouble())
    putDouble("peakDb", a.peakDb)
    putDouble("speechRmsDb", a.speechRmsDb)
    putDouble("noiseFloorDb", a.noiseFloorDb)
    putInt("clippedSamples", a.clippedSamples)
  }

  companion object {
    const val NAME = "VoiceRecorder"
    private val RATES = intArrayOf(48000, 44100)
    private const val MAX_TAKE_MS = 60_000L
  }
}
