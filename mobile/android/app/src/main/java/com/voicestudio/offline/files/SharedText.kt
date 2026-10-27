package com.voicestudio.offline.files

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.io.ByteArrayOutputStream

/**
 * Text handed to the app by another app: "Share → Voice Studio" (plain text
 * or a .txt file) or "Open with" on a .txt file. Held until JS takes it.
 * Nothing leaves the device; the text only lands in the editor.
 */
object SharedText {
  private const val MAX_BYTES = 1 shl 20 // 1 MB of text is far beyond the editor limit

  @Volatile
  private var pending: String? = null

  fun take(): String? {
    val value = pending
    pending = null
    return value
  }

  fun capture(context: Context, intent: Intent?) {
    if (intent == null) return
    val text = try {
      when (intent.action) {
        Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }
          ?: streamUri(intent)?.let { read(context, it) }
        Intent.ACTION_VIEW -> intent.data?.let { read(context, it) }
        else -> null
      }
    } catch (_: Exception) {
      null // unreadable or revoked URI: ignore, the app simply opens normally
    }
    if (!text.isNullOrBlank()) pending = text
  }

  @Suppress("DEPRECATION")
  private fun streamUri(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }

  private fun read(context: Context, uri: Uri): String? {
    if (uri.scheme != "content") return null // never read file:// paths handed in by other apps
    context.contentResolver.openInputStream(uri)?.use { input ->
      val out = ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      while (out.size() < MAX_BYTES) {
        val n = input.read(buffer, 0, minOf(buffer.size, MAX_BYTES - out.size()))
        if (n < 0) break
        out.write(buffer, 0, n)
      }
      return out.toString(Charsets.UTF_8.name()).removePrefix("﻿")
    }
    return null
  }
}
