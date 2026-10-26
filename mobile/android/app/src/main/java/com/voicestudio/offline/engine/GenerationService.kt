package com.voicestudio.offline.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.voicestudio.offline.MainActivity
import com.voicestudio.offline.R

/**
 * Keeps the process alive (with a visible notification) while a long
 * generation runs, so screen lock or switching apps does not kill it.
 * The work itself runs in VoiceEngineModule; this service only holds the
 * foreground state, a partial wake lock, and shows real progress.
 */
class GenerationService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    instance = this
    ensureChannel(this)
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    currentTitle = title
    val notification = build(this, title, text, 0)
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    if (wakeLock == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VoiceStudio:generation").apply {
        setReferenceCounted(false)
        acquire(MAX_WAKE_MS)
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    instance = null
    super.onDestroy()
  }

  companion object {
    const val ACTION_START = "com.voicestudio.offline.GENERATION_START"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "generation"
    private const val NOTIFICATION_ID = 4101
    private const val MAX_WAKE_MS = 2 * 60 * 60 * 1000L

    @Volatile private var instance: GenerationService? = null
    @Volatile private var currentTitle: String = ""

    fun update(text: String, progress: Int) {
      val service = instance ?: return
      val manager = service.getSystemService(NotificationManager::class.java)
      manager.notify(NOTIFICATION_ID, build(service, currentTitle, text, progress))
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Speech generation", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shows progress while speech is being generated"
            setShowBadge(false)
          },
        )
      }
    }

    private fun build(context: Context, title: String, text: String, progress: Int): Notification {
      val open = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setContentTitle(title)
        .setContentText(text)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setSilent(true)
        .setContentIntent(open)
        .setProgress(100, progress.coerceIn(0, 100), progress <= 0)
        .build()
    }
  }
}
