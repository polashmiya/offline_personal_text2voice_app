package com.voicestudio.offline.engine

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsMatchaModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import com.voicestudio.offline.audio.WavIO
import com.voicestudio.offline.specs.NativeVoiceEngineSpec
import com.voicestudio.offline.util.ErrorCodes
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Offline TTS engine (sherpa-onnx). One voice is loaded at a time; all
 * inference runs on a single background thread so the UI never blocks.
 *
 * Lifecycle: load → warm-up → synthesize → idle → unload (after an idle
 * timeout or under memory pressure).
 */
class VoiceEngineModule(private val context: ReactApplicationContext) :
  NativeVoiceEngineSpec(context), ComponentCallbacks2 {

  private val inference: ExecutorService = Executors.newSingleThreadExecutor { r ->
    Thread(r, "tts-inference").apply { priority = Thread.NORM_PRIORITY }
  }
  private val mainHandler = Handler(Looper.getMainLooper())
  private val cancelFlags = ConcurrentHashMap<String, AtomicBoolean>()
  private val busy = AtomicBoolean(false)

  @Volatile private var tts: OfflineTts? = null
  @Volatile private var loadedVoiceId: String? = null
  @Volatile private var loadedKey: String? = null

  private val idleUnload = Runnable {
    if (!busy.get()) inference.execute { releaseModel("idle") }
  }

  init {
    context.applicationContext.registerComponentCallbacks(this)
  }

  override fun getName() = NAME

  override fun invalidate() {
    context.applicationContext.unregisterComponentCallbacks(this)
    mainHandler.removeCallbacks(idleUnload)
    cancelFlags.values.forEach { it.set(true) }
    inference.execute { releaseModel("invalidate") }
    inference.shutdown()
    super.invalidate()
  }

  private fun releaseModel(reason: String) {
    tts?.let {
      Log.i(TAG, "Unloading voice ($reason)")
      it.release()
    }
    tts = null
    loadedVoiceId = null
    loadedKey = null
  }

  private fun scheduleIdleUnload() {
    mainHandler.removeCallbacks(idleUnload)
    mainHandler.postDelayed(idleUnload, IDLE_UNLOAD_MS)
  }

  private fun memoryInfo(): ActivityManager.MemoryInfo {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
  }

  private fun requireFile(path: String, label: String) {
    if (path.isEmpty() || !File(path).isFile) {
      throw EngineException(ErrorCodes.MODEL_MISSING, "$label not found")
    }
  }

  private fun buildConfig(c: ReadableMap): OfflineTtsConfig {
    val engine = c.getString("engine")!!
    val model = c.getString("modelPath")!!
    val tokens = c.getString("tokensPath")!!
    val lexicon = c.getString("lexiconPath") ?: ""
    val dataDir = c.getString("dataDir") ?: ""
    val dictDir = c.getString("dictDir") ?: ""
    requireFile(model, "Model")
    requireFile(tokens, "Tokens")
    val threads = c.getDouble("numThreads").toInt().coerceIn(1, 8)

    val modelConfig = OfflineTtsModelConfig().apply {
      numThreads = threads
      debug = false
      provider = "cpu"
    }
    when (engine) {
      "vits" -> modelConfig.vits = OfflineTtsVitsModelConfig().apply {
        this.model = model
        this.tokens = tokens
        this.lexicon = lexicon
        this.dataDir = dataDir
        this.dictDir = dictDir
        noiseScale = c.getDouble("noiseScale").toFloat()
        noiseScaleW = c.getDouble("noiseScaleW").toFloat()
        lengthScale = c.getDouble("lengthScale").toFloat()
      }
      "kokoro" -> {
        val voices = c.getString("voicesPath") ?: ""
        requireFile(voices, "Voice embeddings")
        modelConfig.kokoro = OfflineTtsKokoroModelConfig().apply {
          this.model = model
          this.voices = voices
          this.tokens = tokens
          this.lexicon = lexicon
          this.dataDir = dataDir
          this.dictDir = dictDir
          this.lang = c.getString("lang") ?: ""
          lengthScale = c.getDouble("lengthScale").toFloat()
        }
      }
      "matcha" -> {
        val vocoder = c.getString("vocoderPath") ?: ""
        requireFile(vocoder, "Vocoder")
        modelConfig.matcha = OfflineTtsMatchaModelConfig().apply {
          acousticModel = model
          this.vocoder = vocoder
          this.tokens = tokens
          this.lexicon = lexicon
          this.dataDir = dataDir
          this.dictDir = dictDir
          noiseScale = c.getDouble("noiseScale").toFloat()
          lengthScale = c.getDouble("lengthScale").toFloat()
        }
      }
      else -> throw EngineException(ErrorCodes.MODEL_CORRUPT, "Unsupported engine $engine")
    }
    return OfflineTtsConfig().apply {
      this.model = modelConfig
      maxNumSentences = 1
      silenceScale = 0.2f
    }
  }

  override fun loadVoice(config: ReadableMap, promise: Promise) {
    val voiceId = config.getString("voiceId") ?: return promise.reject(ErrorCodes.MODEL_MISSING, "voiceId missing")
    val key = config.toHashMap().toString()
    inference.execute {
      try {
        mainHandler.removeCallbacks(idleUnload)
        val current = tts
        if (current != null && loadedKey == key) {
          promise.resolve(loadResult(current, voiceId, 0, true))
          scheduleIdleUnload()
          return@execute
        }
        releaseModel("switch")

        // Refuse to load if the device clearly cannot hold the model.
        val modelBytes = File(config.getString("modelPath") ?: "").length()
        val mem = memoryInfo()
        if (mem.lowMemory || mem.availMem < modelBytes * 2 + MIN_FREE_BYTES) {
          throw EngineException(ErrorCodes.INSUFFICIENT_MEMORY, "Not enough free memory to load this voice")
        }

        val started = SystemClock.elapsedRealtime()
        val engine = OfflineTts(null, buildConfig(config))
        if (engine.sampleRate() <= 0) {
          engine.release()
          throw EngineException(ErrorCodes.MODEL_CORRUPT, "Model failed to initialize")
        }
        // Warm-up: the first inference is much slower; do it before the user waits on it.
        engine.generate("a", 0, 1.0f)
        val loadMs = SystemClock.elapsedRealtime() - started

        tts = engine
        loadedVoiceId = voiceId
        loadedKey = key
        Log.i(TAG, "Loaded voice in ${loadMs}ms, rate=${engine.sampleRate()} speakers=${engine.numSpeakers()}")
        promise.resolve(loadResult(engine, voiceId, loadMs, false))
        scheduleIdleUnload()
      } catch (e: EngineException) {
        promise.reject(e.code, e.message, e)
      } catch (e: OutOfMemoryError) {
        releaseModel("oom")
        promise.reject(ErrorCodes.INSUFFICIENT_MEMORY, "Out of memory while loading voice", e)
      } catch (e: Throwable) {
        releaseModel("error")
        promise.reject(ErrorCodes.MODEL_CORRUPT, e.message ?: "Model failed to load", e)
      }
    }
  }

  private fun loadResult(engine: OfflineTts, voiceId: String, loadMs: Long, already: Boolean) =
    Arguments.createMap().apply {
      putString("voiceId", voiceId)
      putInt("sampleRate", engine.sampleRate())
      putInt("numSpeakers", engine.numSpeakers())
      putDouble("loadMs", loadMs.toDouble())
      putBoolean("alreadyLoaded", already)
    }

  override fun unloadVoice(promise: Promise) {
    inference.execute {
      releaseModel("request")
      promise.resolve(null)
    }
  }

  override fun synthesizeChunk(request: ReadableMap, promise: Promise) {
    val jobId = request.getString("jobId") ?: ""
    val text = request.getString("text") ?: ""
    val speakerId = request.getDouble("speakerId").toInt()
    val speed = request.getDouble("speed").toFloat().coerceIn(0.5f, 2.0f)
    val output = File(request.getString("outputPath") ?: "")
    val flag = cancelFlags.getOrPut(jobId) { AtomicBoolean(false) }

    inference.execute {
      busy.set(true)
      mainHandler.removeCallbacks(idleUnload)
      try {
        val engine = tts ?: throw EngineException(ErrorCodes.NOT_LOADED, "No voice loaded")
        if (flag.get()) {
          promise.resolve(cancelledResult(output, engine.sampleRate()))
          return@execute
        }
        val sid = speakerId.coerceIn(0, maxOf(0, engine.numSpeakers() - 1))
        val started = SystemClock.elapsedRealtime()
        val audio = engine.generateWithCallback(text, sid, speed, CancelCallback(flag))
        val elapsed = SystemClock.elapsedRealtime() - started
        if (flag.get()) {
          promise.resolve(cancelledResult(output, engine.sampleRate()))
          return@execute
        }
        val samples = audio.samples
        if (samples.isEmpty()) {
          throw EngineException(ErrorCodes.GENERATION_FAILED, "Engine produced no audio")
        }
        WavIO.writeMono(output, samples, audio.sampleRate)
        promise.resolve(
          Arguments.createMap().apply {
            putString("outputPath", output.absolutePath)
            putInt("sampleRate", audio.sampleRate)
            putDouble("numSamples", samples.size.toDouble())
            putDouble("durationMs", samples.size * 1000.0 / audio.sampleRate)
            putDouble("elapsedMs", elapsed.toDouble())
            putBoolean("cancelled", false)
          },
        )
      } catch (e: EngineException) {
        promise.reject(e.code, e.message, e)
      } catch (e: OutOfMemoryError) {
        promise.reject(ErrorCodes.INSUFFICIENT_MEMORY, "Out of memory during synthesis", e)
      } catch (e: Throwable) {
        promise.reject(ErrorCodes.GENERATION_FAILED, e.message ?: "Synthesis failed", e)
      } finally {
        busy.set(false)
        scheduleIdleUnload()
      }
    }
  }

  private fun cancelledResult(output: File, rate: Int) = Arguments.createMap().apply {
    output.delete()
    putString("outputPath", "")
    putInt("sampleRate", rate)
    putDouble("numSamples", 0.0)
    putDouble("durationMs", 0.0)
    putDouble("elapsedMs", 0.0)
    putBoolean("cancelled", true)
  }

  override fun cancel(jobId: String) {
    cancelFlags.getOrPut(jobId) { AtomicBoolean(false) }.set(true)
  }

  override fun getRuntimeInfo(promise: Promise) {
    val mem = memoryInfo()
    promise.resolve(
      Arguments.createMap().apply {
        putString("loadedVoiceId", loadedVoiceId ?: "")
        putDouble("availableMemoryBytes", mem.availMem.toDouble())
        putDouble("totalMemoryBytes", mem.totalMem.toDouble())
        putBoolean("lowMemory", mem.lowMemory)
        putInt("cpuCores", Runtime.getRuntime().availableProcessors())
        putString("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
        putInt("sdkInt", Build.VERSION.SDK_INT)
      },
    )
  }

  override fun startForegroundWork(title: String, text: String, promise: Promise) {
    try {
      val intent = Intent(context, GenerationService::class.java)
        .setAction(GenerationService.ACTION_START)
        .putExtra(GenerationService.EXTRA_TITLE, title)
        .putExtra(GenerationService.EXTRA_TEXT, text)
      ContextCompat.startForegroundService(context, intent)
      promise.resolve(null)
    } catch (e: Exception) {
      // Not fatal: generation still runs while the app is in the foreground.
      Log.w(TAG, "Foreground service unavailable: ${e.message}")
      promise.resolve(null)
    }
  }

  override fun updateForegroundWork(text: String, progress: Double) {
    GenerationService.update(text, progress.toInt())
  }

  override fun stopForegroundWork(promise: Promise) {
    context.stopService(Intent(context, GenerationService::class.java))
    promise.resolve(null)
  }

  // Memory pressure: drop the model when idle.
  override fun onTrimMemory(level: Int) {
    @Suppress("DEPRECATION")
    val critical = level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL
    if (critical && !busy.get()) inference.execute { releaseModel("memory pressure") }
  }

  override fun onConfigurationChanged(newConfig: Configuration) = Unit

  @Deprecated("Deprecated in Java")
  override fun onLowMemory() {
    if (!busy.get()) inference.execute { releaseModel("low memory") }
  }

  class EngineException(val code: String, message: String) : Exception(message)

  /**
   * sherpa-onnx's JNI looks up `invoke([F)Ljava/lang/Integer;` on the callback.
   * A Kotlin lambda (after D8 desugaring) only has the erased `invoke(Object)`,
   * which crashes natively — so this must be a real class with a typed method.
   * Returning 0 tells the engine to stop (mid-chunk cancellation).
   */
  private class CancelCallback(private val cancelled: AtomicBoolean) : (FloatArray) -> Int {
    override fun invoke(samples: FloatArray): Int = if (cancelled.get()) 0 else 1
  }

  companion object {
    const val NAME = "VoiceEngine"
    private const val TAG = "VoiceEngine"
    private const val IDLE_UNLOAD_MS = 5 * 60 * 1000L
    private const val MIN_FREE_BYTES = 64L * 1024 * 1024
  }
}
