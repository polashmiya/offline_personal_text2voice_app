package com.voicestudio.offline.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.os.Build
import androidx.core.content.ContextCompat
import java.io.File
import kotlin.math.max

/**
 * The app's single audio player, shared by the JS player (AudioToolsModule)
 * and the media notification / lock screen (PlaybackService). Handles audio
 * focus (pauses for calls and other apps) and pauses when headphones are
 * unplugged. Every state change is pushed to the notification.
 */
object AudioPlayer {
  data class Status(
    val loaded: Boolean,
    val playing: Boolean,
    val positionMs: Int,
    val durationMs: Int,
    val completed: Boolean,
  )

  private val lock = Any()
  private var player: MediaPlayer? = null
  private var completed = false
  private var rate = 1f
  private lateinit var appContext: Context

  @Volatile var title: String = ""
    private set

  private var focusRequest: AudioFocusRequest? = null
  private var noisyRegistered = false

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) pause()
  }

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) pause()
    }
  }

  fun init(context: Context) {
    if (!::appContext.isInitialized) appContext = context.applicationContext
  }

  fun load(context: Context, path: String) {
    init(context)
    synchronized(lock) {
      releaseLocked()
      val file = File(path)
      if (!file.isFile) throw InvalidAudioException("Audio file missing")
      try {
        player = MediaPlayer().apply {
          setAudioAttributes(attributes())
          setDataSource(file.absolutePath)
          setOnCompletionListener {
            synchronized(lock) { completed = true }
            stopListening()
            PlaybackService.sync(appContext)
          }
          prepare()
        }
      } catch (e: Exception) {
        releaseLocked()
        throw e
      }
    }
    PlaybackService.sync(appContext)
  }

  fun setTitle(value: String) {
    title = value.take(200)
    if (::appContext.isInitialized) PlaybackService.sync(appContext)
  }

  fun play() {
    synchronized(lock) {
      val p = player ?: throw InvalidAudioException("Nothing loaded")
      if (!requestFocus()) return // a call is active: don't start
      if (completed) {
        p.seekTo(0)
        completed = false
      }
      p.start()
      applyRate(p)
    }
    startListening()
    PlaybackService.sync(appContext)
  }

  fun pause() {
    synchronized(lock) { player?.takeIf { it.isPlaying }?.pause() }
    stopListening()
    if (::appContext.isInitialized) PlaybackService.sync(appContext)
  }

  fun toggle() {
    if (status().playing) pause() else play()
  }

  fun seek(positionMs: Int) {
    synchronized(lock) {
      val p = player ?: return
      val clamped = positionMs.coerceIn(0, max(0, p.duration))
      p.seekTo(clamped)
      if (clamped < p.duration) completed = false
    }
    PlaybackService.sync(appContext)
  }

  fun seekBy(deltaMs: Int) = seek(status().positionMs + deltaMs)

  fun setRate(value: Float) {
    synchronized(lock) {
      rate = value.coerceIn(0.5f, 2f)
      player?.let { if (it.isPlaying) applyRate(it) }
    }
  }

  fun status(): Status = synchronized(lock) {
    val p = player
    Status(
      loaded = p != null,
      playing = p?.isPlaying == true,
      positionMs = p?.currentPosition ?: 0,
      durationMs = p?.duration ?: 0,
      completed = completed,
    )
  }

  fun release() {
    synchronized(lock) { releaseLocked() }
    stopListening()
    if (::appContext.isInitialized) PlaybackService.sync(appContext)
  }

  private fun releaseLocked() {
    player?.release()
    player = null
    completed = false
  }

  private fun applyRate(p: MediaPlayer) {
    p.playbackParams = (p.playbackParams ?: PlaybackParams()).setSpeed(rate)
  }

  private fun attributes(): AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

  private fun audioManager() = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun requestFocus(): Boolean {
    val am = audioManager()
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attributes())
        .setOnAudioFocusChangeListener(focusListener)
        .build()
        .also { focusRequest = it }
      am.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun startListening() {
    if (noisyRegistered) return
    ContextCompat.registerReceiver(
      appContext,
      noisyReceiver,
      IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    noisyRegistered = true
  }

  private fun stopListening() {
    if (!::appContext.isInitialized) return
    if (noisyRegistered) {
      try {
        appContext.unregisterReceiver(noisyReceiver)
      } catch (_: IllegalArgumentException) {
      }
      noisyRegistered = false
    }
    val am = audioManager()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(focusListener)
    }
  }
}
