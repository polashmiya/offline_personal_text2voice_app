package com.voicestudio.offline.audio

import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaPlayer
import android.media.PlaybackParams
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.voicestudio.offline.specs.NativeAudioToolsSpec
import com.voicestudio.offline.util.ErrorCodes
import com.voicestudio.offline.util.Lame
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

class AudioToolsModule(context: ReactApplicationContext) : NativeAudioToolsSpec(context) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor { r ->
    Thread(r, "audio-tools").apply { priority = Thread.NORM_PRIORITY - 1 }
  }
  private var player: MediaPlayer? = null
  private var playerCompleted = false
  private var playbackRate = 1f

  override fun getName() = NAME

  override fun invalidate() {
    releasePlayer()
    worker.shutdownNow()
    super.invalidate()
  }

  private fun runAsync(promise: Promise, errorCode: String, block: () -> Any?) {
    worker.execute {
      try {
        promise.resolve(block())
      } catch (e: InvalidAudioException) {
        promise.reject(ErrorCodes.INVALID_AUDIO, e.message, e)
      } catch (e: OutOfMemoryError) {
        promise.reject(ErrorCodes.INSUFFICIENT_MEMORY, "Out of memory", e)
      } catch (e: Exception) {
        promise.reject(errorCode, e.message ?: errorCode, e)
      }
    }
  }

  override fun getAudioInfo(path: String, promise: Promise) = runAsync(promise, ErrorCodes.INVALID_AUDIO) {
    val file = File(path)
    if (file.extension.equals("wav", ignoreCase = true)) {
      val header = WavIO.readHeader(file)
      Arguments.createMap().apply {
        putDouble("durationMs", header.durationMs.toDouble())
        putInt("sampleRate", header.sampleRate)
        putInt("channels", header.channels)
        putDouble("sizeBytes", file.length().toDouble())
      }
    } else {
      extractorInfo(file)
    }
  }

  /** Reads duration/rate of a compressed file; also proves the file is decodable. */
  private fun extractorInfo(file: File): WritableMap {
    if (!file.isFile) throw InvalidAudioException("File not found")
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file.absolutePath)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw InvalidAudioException("No audio track")
      val format = extractor.getTrackFormat(track)
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
      return Arguments.createMap().apply {
        putDouble("durationMs", durationUs / 1000.0)
        putInt("sampleRate", format.getInteger(MediaFormat.KEY_SAMPLE_RATE))
        putInt("channels", format.getInteger(MediaFormat.KEY_CHANNEL_COUNT))
        putDouble("sizeBytes", file.length().toDouble())
      }
    } catch (e: IOException) {
      throw InvalidAudioException("Unreadable audio: ${e.message}")
    } finally {
      extractor.release()
    }
  }

  /**
   * Joins chunk WAVs with pauses. Two passes over the files (never the whole
   * audio in memory): pass 1 measures speech loudness, pass 2 writes with
   * gain, short edge fades (no clicks) and peak protection.
   */
  override fun concatenateWav(request: ReadableMap, promise: Promise) = runAsync(promise, ErrorCodes.AUDIO_PROCESSING) {
    val inputs = request.getArray("inputs") ?: throw IllegalArgumentException("inputs missing")
    val output = File(request.getString("outputPath")!!)
    val normalize = request.getBoolean("normalize")
    val leadingMs = request.getDouble("leadingSilenceMs")
    val trailingMs = request.getDouble("trailingSilenceMs")
    if (inputs.size() == 0) throw IllegalArgumentException("Nothing to join")

    data class Part(val file: File, val pauseMs: Double)
    val parts = (0 until inputs.size()).map {
      val item = inputs.getMap(it)!!
      Part(File(item.getString("path")!!), item.getDouble("pauseAfterMs"))
    }

    // Pass 1: loudness of speech samples and true peak
    var sampleRate = 0
    var sumSquares = 0.0
    var activeCount = 0L
    var peak = 0f
    val block = FloatArray(8192)
    for (part in parts) {
      MonoWavReader(part.file).use { reader ->
        if (sampleRate == 0) sampleRate = reader.header.sampleRate
        if (reader.header.sampleRate != sampleRate) throw InvalidAudioException("Chunks have different sample rates")
        while (true) {
          val n = reader.read(block)
          if (n < 0) break
          for (i in 0 until n) {
            val a = abs(block[i])
            if (a > peak) peak = a
            if (a > SPEECH_THRESHOLD) {
              sumSquares += a * a
              activeCount++
            }
          }
        }
      }
    }
    var gain = 1f
    if (normalize && activeCount > 0) {
      val rms = sqrt(sumSquares / activeCount).toFloat()
      gain = (TARGET_RMS / rms).coerceIn(0.25f, 8f)
    }
    if (peak * gain > PEAK_CEILING) gain = PEAK_CEILING / max(peak, 1e-6f)

    // Pass 2: write
    val fadeFrames = (sampleRate * EDGE_FADE_MS / 1000).toInt()
    val temp = File(output.parentFile, "${output.name}.part")
    MonoWavWriter(temp, sampleRate).use { writer ->
      writer.writeSilence((leadingMs * sampleRate / 1000).toLong())
      for (part in parts) {
        MonoWavReader(part.file).use { reader ->
          val total = reader.header.frameCount
          var index = 0L
          while (true) {
            val n = reader.read(block)
            if (n < 0) break
            for (i in 0 until n) {
              val pos = index + i
              var s = block[i] * gain
              if (pos < fadeFrames) s *= pos.toFloat() / fadeFrames
              val fromEnd = total - 1 - pos
              if (fromEnd < fadeFrames) s *= max(0f, fromEnd.toFloat() / fadeFrames)
              block[i] = s
            }
            writer.write(block, n)
            index += n
          }
        }
        writer.writeSilence((part.pauseMs * sampleRate / 1000).toLong())
      }
      writer.writeSilence((trailingMs * sampleRate / 1000).toLong())
    }
    if (output.exists()) output.delete()
    if (!temp.renameTo(output)) throw IOException("Could not finalize output")
    val header = WavIO.readHeader(output)
    if (header.frameCount <= 0) throw InvalidAudioException("Output is empty")
    Arguments.createMap().apply {
      putString("outputPath", output.absolutePath)
      putDouble("durationMs", header.durationMs.toDouble())
      putInt("sampleRate", header.sampleRate)
      putDouble("peak", (peak * gain).toDouble())
    }
  }

  override fun computeWaveform(path: String, buckets: Double, promise: Promise) = runAsync(promise, ErrorCodes.INVALID_AUDIO) {
    val count = buckets.toInt().coerceIn(1, 4000)
    MonoWavReader(File(path)).use { reader ->
      val total = max(1L, reader.header.frameCount)
      val peaks = FloatArray(count)
      val block = FloatArray(8192)
      var index = 0L
      while (true) {
        val n = reader.read(block)
        if (n < 0) break
        for (i in 0 until n) {
          val bucket = ((index + i) * count / total).toInt().coerceAtMost(count - 1)
          val a = abs(block[i])
          if (a > peaks[bucket]) peaks[bucket] = a
        }
        index += n
      }
      val maxPeak = max(peaks.maxOrNull() ?: 0f, 1e-6f)
      Arguments.createArray().apply { peaks.forEach { pushDouble((it / maxPeak).toDouble()) } }
    }
  }

  override fun getSupportedExportFormats(promise: Promise) = runAsync(promise, ErrorCodes.EXPORT_FAILED) {
    val formats = AudioEncoder.supportedFormats().toMutableList()
    if (Lame.isAvailable) formats.add(1, "mp3")
    Arguments.createArray().apply { formats.forEach { pushString(it) } }
  }

  override fun exportAudio(request: ReadableMap, promise: Promise) = runAsync(promise, ErrorCodes.EXPORT_FAILED) {
    val input = File(request.getString("inputPath")!!)
    val output = File(request.getString("outputPath")!!)
    val format = request.getString("format")!!
    val bitrate = request.getDouble("bitrateKbps").toInt().coerceIn(32, 320)
    val sampleRate = request.getDouble("sampleRate").toInt()
    val temp = File(output.parentFile, "${output.name}.part")
    temp.delete()
    try {
      when (format) {
        "wav" -> Mixer.resampleWav(input, temp, sampleRate)
        "mp3" -> Lame.encodeWav(input, temp, bitrate, sampleRate)
        else -> AudioEncoder.encode(input, temp, format, bitrate, sampleRate)
      }
      if (output.exists()) output.delete()
      if (!temp.renameTo(output)) throw IOException("Could not finalize export")
    } catch (e: Exception) {
      temp.delete()
      throw e
    }
    // Validate: the exported file must be readable and non-empty.
    val info = if (format == "wav") {
      val h = WavIO.readHeader(output)
      h.durationMs.toDouble()
    } else {
      extractorInfo(output).getDouble("durationMs")
    }
    if (info <= 0 && format != "flac") throw InvalidAudioException("Exported file has no audio")
    Arguments.createMap().apply {
      putString("outputPath", output.absolutePath)
      putDouble("sizeBytes", output.length().toDouble())
      putDouble("durationMs", info)
    }
  }

  override fun decodeToWav(inputPath: String, outputPath: String, maxDurationMs: Double, promise: Promise) =
    runAsync(promise, ErrorCodes.INVALID_AUDIO) {
      val output = File(outputPath)
      val temp = File(output.parentFile, "${output.name}.part")
      temp.parentFile?.mkdirs()
      val result = AudioDecoder.decodeToMonoWav(File(inputPath), temp, maxDurationMs.toLong().coerceAtLeast(1000))
      if (output.exists()) output.delete()
      if (!temp.renameTo(output)) {
        temp.delete()
        throw IOException("Could not finalize decoded audio")
      }
      Arguments.createMap().apply {
        putString("outputPath", output.absolutePath)
        putDouble("durationMs", result.durationMs.toDouble())
        putInt("sampleRate", result.sampleRate)
      }
    }

  override fun mixAudio(request: ReadableMap, promise: Promise) = runAsync(promise, ErrorCodes.AUDIO_PROCESSING) {
    val output = File(request.getString("outputPath")!!)
    val workDir = File(output.parentFile, "${output.name}.work")
    try {
      val musicPath = if (request.hasKey("musicPath") && !request.isNull("musicPath")) request.getString("musicPath") else null
      val result = Mixer.mix(
        MixParams(
          voice = File(request.getString("voicePath")!!),
          music = musicPath?.let { File(it) },
          output = output,
          workDir = workDir,
          sampleRate = request.getDouble("sampleRate").toInt(),
          voiceGain = request.getDouble("voiceGain").toFloat().coerceIn(0f, 2f),
          musicGain = request.getDouble("musicGain").toFloat().coerceIn(0f, 1f),
          loopMusic = request.getBoolean("loopMusic"),
          trimStartMs = request.getDouble("trimStartMs"),
          trimEndMs = request.getDouble("trimEndMs"),
          padStartMs = request.getDouble("padStartMs"),
          padEndMs = request.getDouble("padEndMs"),
          musicFadeInMs = request.getDouble("musicFadeInMs"),
          musicFadeOutMs = request.getDouble("musicFadeOutMs"),
          duck = request.getBoolean("duck"),
          duckDb = request.getDouble("duckDb").toFloat().coerceIn(0f, 40f),
          duckAttackMs = request.getDouble("duckAttackMs").coerceIn(5.0, 2000.0),
          duckReleaseMs = request.getDouble("duckReleaseMs").coerceIn(20.0, 5000.0),
          normalize = request.getBoolean("normalize"),
        ),
      )
      Arguments.createMap().apply {
        putString("outputPath", output.absolutePath)
        putDouble("durationMs", result.durationMs.toDouble())
        putInt("sampleRate", result.sampleRate)
        putDouble("peak", result.peak.toDouble())
      }
    } finally {
      workDir.deleteRecursively()
    }
  }

  // ---------------------------------------------------------------- player

  private fun status(): WritableMap {
    val p = player
    return Arguments.createMap().apply {
      putBoolean("loaded", p != null)
      putBoolean("playing", p?.isPlaying == true)
      putDouble("positionMs", (p?.currentPosition ?: 0).toDouble())
      putDouble("durationMs", (p?.duration ?: 0).toDouble())
      putBoolean("completed", playerCompleted)
    }
  }

  private fun releasePlayer() {
    player?.release()
    player = null
    playerCompleted = false
  }

  override fun playerLoad(path: String, promise: Promise) {
    try {
      releasePlayer()
      val file = File(path)
      if (!file.isFile) throw InvalidAudioException("Audio file missing")
      player = MediaPlayer().apply {
        setDataSource(file.absolutePath)
        setOnCompletionListener { playerCompleted = true }
        prepare()
      }
      promise.resolve(status())
    } catch (e: Exception) {
      releasePlayer()
      promise.reject(ErrorCodes.INVALID_AUDIO, e.message, e)
    }
  }

  override fun playerPlay(promise: Promise) {
    val p = player ?: return promise.reject(ErrorCodes.INVALID_AUDIO, "Nothing loaded")
    try {
      if (playerCompleted) {
        p.seekTo(0)
        playerCompleted = false
      }
      p.start()
      applyRate(p)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject(ErrorCodes.INVALID_AUDIO, e.message, e)
    }
  }

  override fun playerPause(promise: Promise) {
    player?.takeIf { it.isPlaying }?.pause()
    promise.resolve(null)
  }

  override fun playerSeek(positionMs: Double, promise: Promise) {
    val p = player ?: return promise.resolve(null)
    val clamped = positionMs.toInt().coerceIn(0, max(0, p.duration))
    p.seekTo(clamped)
    if (clamped < p.duration) playerCompleted = false
    promise.resolve(null)
  }

  override fun playerSetRate(rate: Double, promise: Promise) {
    playbackRate = rate.toFloat().coerceIn(0.5f, 2f)
    player?.let { if (it.isPlaying) applyRate(it) }
    promise.resolve(null)
  }

  private fun applyRate(p: MediaPlayer) {
    p.playbackParams = (p.playbackParams ?: PlaybackParams()).setSpeed(playbackRate)
  }

  override fun playerGetStatus(promise: Promise) = promise.resolve(status())

  override fun playerRelease(promise: Promise) {
    releasePlayer()
    promise.resolve(null)
  }

  companion object {
    const val NAME = "AudioTools"
    private const val SPEECH_THRESHOLD = 0.02f
    private val TARGET_RMS = 10.0.pow(-20.0 / 20).toFloat() // ≈ -20 dBFS speech level
    private val PEAK_CEILING = 10.0.pow(-1.0 / 20).toFloat() // -1 dBFS
    private const val EDGE_FADE_MS = 6
  }
}
