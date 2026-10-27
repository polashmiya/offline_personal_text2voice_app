package com.voicestudio.offline.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.voicestudio.offline.MainActivity
import com.voicestudio.offline.R

/**
 * Media notification + lock-screen controls for [AudioPlayer]: play/pause,
 * back/forward 10 s, close. Foreground (type mediaPlayback) only while audio
 * plays, so playback survives screen lock and app switching; when paused the
 * notification stays but can be swiped away.
 */
class PlaybackService : Service() {
  private var session: MediaSession? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    AudioPlayer.init(this)
    session = MediaSession(this, "VoiceStudioPlayer").apply {
      setCallback(
        object : MediaSession.Callback() {
          override fun onPlay() = safely { AudioPlayer.play() }
          override fun onPause() = safely { AudioPlayer.pause() }
          override fun onFastForward() = safely { AudioPlayer.seekBy(SKIP_MS) }
          override fun onRewind() = safely { AudioPlayer.seekBy(-SKIP_MS) }
          override fun onSkipToNext() = safely { AudioPlayer.seekBy(SKIP_MS) }
          override fun onSkipToPrevious() = safely { AudioPlayer.seekBy(-SKIP_MS) }
          override fun onSeekTo(pos: Long) = safely { AudioPlayer.seek(pos.toInt()) }
          override fun onStop() = safely { AudioPlayer.pause() }
        },
      )
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Started via startForegroundService: Android requires startForeground in every case,
    // even if playback was paused in the meantime. refresh() below then sets the real state.
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, build(AudioPlayer.status().playing), type)
    when (intent?.action) {
      ACTION_TOGGLE -> safely { AudioPlayer.toggle() }
      ACTION_BACK -> safely { AudioPlayer.seekBy(-SKIP_MS) }
      ACTION_FORWARD -> safely { AudioPlayer.seekBy(SKIP_MS) }
      ACTION_CLOSE -> safely { AudioPlayer.pause() }
    }
    refresh(closing = intent?.action == ACTION_CLOSE)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    session?.release()
    session = null
    instance = null
    super.onDestroy()
  }

  /** Mirrors the player in the session and the notification. */
  fun refresh(closing: Boolean = false) {
    val status = AudioPlayer.status()
    val s = session ?: return
    if (!status.loaded || closing) {
      s.isActive = false
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }
    s.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, AudioPlayer.title.ifBlank { getString(R.string.app_name) })
        .putString(MediaMetadata.METADATA_KEY_ARTIST, getString(R.string.app_name))
        .putLong(MediaMetadata.METADATA_KEY_DURATION, status.durationMs.toLong())
        .build(),
    )
    s.setPlaybackState(
      PlaybackState.Builder()
        .setActions(
          PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
            PlaybackState.ACTION_SEEK_TO or PlaybackState.ACTION_FAST_FORWARD or PlaybackState.ACTION_REWIND or
            PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_STOP,
        )
        .setState(
          if (status.playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
          status.positionMs.toLong(),
          if (status.playing) 1f else 0f,
        )
        .build(),
    )
    val notification = build(status.playing)
    if (status.playing) {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    } else {
      // Paused: not foreground any more, but keep the (now dismissible) notification.
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
      getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
    }
  }

  private fun build(playing: Boolean): Notification {
    ensureChannel(this)
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    fun action(icon: Int, label: String, act: String) = Notification.Action.Builder(
      android.graphics.drawable.Icon.createWithResource(this, icon),
      label,
      PendingIntent.getService(
        this,
        act.hashCode(),
        Intent(this, PlaybackService::class.java).setAction(act),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      ),
    ).build()

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(AudioPlayer.title.ifBlank { getString(R.string.app_name) })
      .setContentText(getString(R.string.app_name))
      .setContentIntent(open)
      .setOngoing(playing)
      .setShowWhen(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setDeleteIntent(
        PendingIntent.getService(
          this,
          ACTION_CLOSE.hashCode(),
          Intent(this, PlaybackService::class.java).setAction(ACTION_CLOSE),
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        ),
      )
      .addAction(action(android.R.drawable.ic_media_rew, "Back 10 s", ACTION_BACK))
      .addAction(
        if (playing) {
          action(android.R.drawable.ic_media_pause, "Pause", ACTION_TOGGLE)
        } else {
          action(android.R.drawable.ic_media_play, "Play", ACTION_TOGGLE)
        },
      )
      .addAction(action(android.R.drawable.ic_media_ff, "Forward 10 s", ACTION_FORWARD))
      .setStyle(Notification.MediaStyle().setMediaSession(session?.sessionToken).setShowActionsInCompactView(0, 1, 2))
      .build()
  }

  private inline fun safely(block: () -> Unit) {
    try {
      block()
    } catch (_: Exception) {
      // e.g. nothing loaded any more: the refresh below hides the notification.
    }
  }

  companion object {
    private const val CHANNEL_ID = "playback"
    private const val NOTIFICATION_ID = 4102
    private const val SKIP_MS = 10_000
    private const val ACTION_SYNC = "com.voicestudio.offline.PLAYBACK_SYNC"
    private const val ACTION_TOGGLE = "com.voicestudio.offline.PLAYBACK_TOGGLE"
    private const val ACTION_BACK = "com.voicestudio.offline.PLAYBACK_BACK"
    private const val ACTION_FORWARD = "com.voicestudio.offline.PLAYBACK_FORWARD"
    private const val ACTION_CLOSE = "com.voicestudio.offline.PLAYBACK_CLOSE"

    @Volatile private var instance: PlaybackService? = null

    /**
     * Called on every player change. Starting playback starts the service (the
     * user just pressed play, so the app is in the foreground); otherwise the
     * running service only refreshes or closes itself.
     */
    fun sync(context: Context) {
      val running = instance
      if (running != null) {
        ContextCompat.getMainExecutor(context).execute { instance?.refresh() }
        return
      }
      if (AudioPlayer.status().playing) {
        try {
          ContextCompat.startForegroundService(
            context,
            Intent(context, PlaybackService::class.java).setAction(ACTION_SYNC),
          )
        } catch (_: Exception) {
          // Background-start restrictions: playback still works, just without the notification.
        }
      }
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Play / pause controls while listening"
            setShowBadge(false)
          },
        )
      }
    }
  }
}
