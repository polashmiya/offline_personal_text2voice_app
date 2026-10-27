package com.voicestudio.offline.files

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.StatFs
import android.provider.OpenableColumns
import android.view.WindowManager
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.voicestudio.offline.BuildConfig
import com.voicestudio.offline.specs.NativeFileBridgeSpec
import com.voicestudio.offline.util.ErrorCodes
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * File access using the Storage Access Framework (no broad storage
 * permissions), a FileProvider for sharing, and app-private storage for
 * everything else.
 */
class FileBridgeModule(private val context: ReactApplicationContext) :
  NativeFileBridgeSpec(context), ActivityEventListener {

  private val io: ExecutorService = Executors.newFixedThreadPool(2)
  private var pendingPick: PendingPick? = null
  private var pendingSave: PendingSave? = null

  private data class PendingPick(val promise: Promise, val maxBytes: Long)
  private data class PendingSave(val promise: Promise, val source: File)

  init {
    context.addActivityEventListener(this)
  }

  override fun getName() = NAME

  override fun invalidate() {
    context.removeActivityEventListener(this)
    io.shutdown()
    super.invalidate()
  }

  private fun async(promise: Promise, code: String = ErrorCodes.IO, block: () -> Any?) {
    io.execute {
      try {
        promise.resolve(block())
      } catch (e: UnsafeArchiveException) {
        promise.reject(ErrorCodes.INVALID_PACKAGE, e.message, e)
      } catch (e: SecurityException) {
        promise.reject(ErrorCodes.FILE_PERMISSION, e.message, e)
      } catch (e: Exception) {
        promise.reject(code, e.message ?: code, e)
      }
    }
  }

  /** Only paths inside this app's private storage may be touched from JS. */
  private fun safeFile(path: String): File {
    val file = File(path).canonicalFile
    if (storageRoots().none { file.path == it || file.path.startsWith(it + File.separator) }) {
      throw SecurityException("Path outside app storage")
    }
    return file
  }

  private fun storageRoots(): List<String> =
    listOfNotNull(context.filesDir, context.cacheDir, context.getExternalFilesDir(null)).map { it.canonicalFile.path }

  /** Like [safeFile], but never a storage root itself (for delete/move). */
  private fun safeChild(path: String): File {
    val file = safeFile(path)
    if (file.path in storageRoots()) throw SecurityException("Refusing to modify a storage root")
    return file
  }

  override fun getPaths(): WritableMap = Arguments.createMap().apply {
    putString("filesDir", context.filesDir.absolutePath)
    putString("cacheDir", context.cacheDir.absolutePath)
  }

  override fun getBuildInfo(): WritableMap = Arguments.createMap().apply {
    putString("versionName", BuildConfig.VERSION_NAME)
    putString("flavor", BuildConfig.FLAVOR)
    putBoolean("allowNetwork", BuildConfig.ALLOW_NETWORK)
  }

  // ------------------------------------------------------------ picking

  override fun pickFile(mimeTypes: ReadableArray, maxBytes: Double, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject(ErrorCodes.FILE_PERMISSION, "No activity")
    if (pendingPick != null) return promise.reject(ErrorCodes.BUSY, "Picker already open")
    val types = (0 until mimeTypes.size()).mapNotNull { mimeTypes.getString(it) }.ifEmpty { listOf("*/*") }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = if (types.size == 1) types[0] else "*/*"
      if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
    }
    pendingPick = PendingPick(promise, maxBytes.toLong())
    try {
      activity.startActivityForResult(intent, REQUEST_PICK)
    } catch (e: ActivityNotFoundException) {
      pendingPick = null
      promise.reject(ErrorCodes.FILE_PERMISSION, "No file picker available", e)
    }
  }

  private fun handlePicked(uri: Uri, pick: PendingPick) = async(pick.promise) {
    val resolver = context.contentResolver
    var name = "imported"
    var size = -1L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        name = c.getString(0) ?: name
        if (!c.isNull(1)) size = c.getLong(1)
      }
    }
    if (size > pick.maxBytes) throw IOException("File is too large")
    val safeName = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_").take(120)
    val dir = File(context.cacheDir, "imports").apply { mkdirs() }
    val target = File(dir, "${System.currentTimeMillis()}_$safeName")
    var copied = 0L
    resolver.openInputStream(uri)?.use { input ->
      FileOutputStream(target).use { output ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          copied += n
          if (copied > pick.maxBytes) {
            output.close()
            target.delete()
            throw IOException("File is too large")
          }
          output.write(buffer, 0, n)
        }
      }
    } ?: throw IOException("Cannot open the selected file")
    Arguments.createMap().apply {
      putString("name", safeName)
      putDouble("sizeBytes", copied.toDouble())
      putString("mimeType", resolver.getType(uri) ?: "application/octet-stream")
      putString("cachedPath", target.absolutePath)
    }
  }

  // ------------------------------------------------------------ saving / sharing

  override fun saveToUserLocation(sourcePath: String, suggestedName: String, mimeType: String, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject(ErrorCodes.FILE_PERMISSION, "No activity")
    if (pendingSave != null) return promise.reject(ErrorCodes.BUSY, "Save dialog already open")
    val source = try {
      safeFile(sourcePath).also { if (!it.isFile) throw IOException("Nothing to save") }
    } catch (e: Exception) {
      return promise.reject(ErrorCodes.EXPORT_FAILED, e.message, e)
    }
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = mimeType
      putExtra(Intent.EXTRA_TITLE, suggestedName)
    }
    pendingSave = PendingSave(promise, source)
    try {
      activity.startActivityForResult(intent, REQUEST_SAVE)
    } catch (e: ActivityNotFoundException) {
      pendingSave = null
      promise.reject(ErrorCodes.FILE_PERMISSION, "No document provider available", e)
    }
  }

  private fun handleSave(uri: Uri, save: PendingSave) = async(save.promise, ErrorCodes.EXPORT_FAILED) {
    context.contentResolver.openOutputStream(uri, "wt")?.use { output ->
      FileInputStream(save.source).use { it.copyTo(output, 64 * 1024) }
    } ?: throw IOException("Cannot write to the chosen location")
    uri.toString()
  }

  override fun shareFile(path: String, mimeType: String, title: String, promise: Promise) {
    try {
      val file = safeFile(path)
      if (!file.isFile) throw IOException("File missing")
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      (context.currentActivity ?: context).startActivity(chooser)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject(ErrorCodes.FILE_PERMISSION, e.message, e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      REQUEST_PICK -> {
        val pick = pendingPick ?: return
        pendingPick = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) pick.promise.resolve(null) else handlePicked(uri, pick)
      }
      REQUEST_SAVE -> {
        val save = pendingSave ?: return
        pendingSave = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) save.promise.resolve(null) else handleSave(uri, save)
      }
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  // ------------------------------------------------------------ packages & files

  override fun extractZipSafely(zipPath: String, destDir: String, maxTotalBytes: Double, maxEntries: Double, promise: Promise) =
    async(promise, ErrorCodes.INVALID_PACKAGE) {
      val result = SafeZip.extract(safeFile(zipPath), safeFile(destDir), maxTotalBytes.toLong(), maxEntries.toInt())
      Arguments.createMap().apply {
        putInt("fileCount", result.fileCount)
        putDouble("totalBytes", result.totalBytes.toDouble())
      }
    }

  override fun createZip(entries: ReadableArray, outputPath: String, promise: Promise) = async(promise) {
    val out = safeFile(outputPath)
    out.parentFile?.mkdirs()
    val temp = File(out.parentFile, "${out.name}.part")
    val items = (0 until entries.size()).map { i ->
      val map = entries.getMap(i) ?: throw IOException("Invalid zip entry")
      val name = map.getString("zipPath") ?: throw IOException("Invalid zip entry")
      if (name.isEmpty() || name.startsWith("/") || name.contains("..") || name.contains("\\")) {
        throw IOException("Unsafe zip path")
      }
      name to safeFile(map.getString("sourcePath") ?: throw IOException("Invalid zip entry"))
    }
    ZipOutputStream(BufferedOutputStream(FileOutputStream(temp), 1 shl 16)).use { zip ->
      val buffer = ByteArray(64 * 1024)
      for ((name, file) in items) {
        if (!file.isFile) throw IOException("Missing file for $name")
        val entry = ZipEntry(name)
        // WAV barely compresses; store it (needs size + CRC up front) to keep exports fast.
        if (name.endsWith(".wav")) {
          val crc = CRC32()
          FileInputStream(file).use { input ->
            while (true) {
              val n = input.read(buffer)
              if (n < 0) break
              crc.update(buffer, 0, n)
            }
          }
          entry.method = ZipEntry.STORED
          entry.size = file.length()
          entry.compressedSize = file.length()
          entry.crc = crc.value
        }
        zip.putNextEntry(entry)
        FileInputStream(file).use { it.copyTo(zip, buffer.size) }
        zip.closeEntry()
      }
    }
    if (out.exists()) out.delete()
    if (!temp.renameTo(out)) throw IOException("Could not write archive")
    Arguments.createMap().apply {
      putInt("fileCount", items.size)
      putDouble("sizeBytes", out.length().toDouble())
    }
  }

  override fun sha256(path: String, promise: Promise) = async(promise) {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(safeFile(path)).use { input ->
      val buffer = ByteArray(256 * 1024)
      while (true) {
        val n = input.read(buffer)
        if (n < 0) break
        digest.update(buffer, 0, n)
      }
    }
    digest.digest().joinToString("") { "%02x".format(it) }
  }

  override fun readText(path: String, promise: Promise) = async(promise) {
    val file = safeFile(path)
    if (file.length() > MAX_TEXT_BYTES) throw IOException("Text file too large")
    file.readText(Charsets.UTF_8)
  }

  /** Write to a temp file, then rename: a crash never leaves a half-written file. */
  override fun writeTextAtomic(path: String, content: String, promise: Promise) = async(promise) {
    val file = safeFile(path)
    file.parentFile?.mkdirs()
    val temp = File(file.parentFile, "${file.name}.tmp")
    FileOutputStream(temp).use { out ->
      out.write(content.toByteArray(Charsets.UTF_8))
      out.fd.sync()
    }
    if (!temp.renameTo(file)) {
      file.delete()
      if (!temp.renameTo(file)) throw IOException("Could not save file")
    }
    null
  }

  override fun exists(path: String, promise: Promise) = async(promise) { safeFile(path).exists() }

  /** Copies a file bundled in the APK's assets/ (e.g. "music/calm-ambient.wav") into app storage, atomically. */
  override fun copyAsset(assetPath: String, destPath: String, promise: Promise) = async(promise) {
    if (assetPath.isBlank() || assetPath.startsWith("/") || assetPath.contains("..") || assetPath.contains('\\')) {
      throw IllegalArgumentException("Invalid asset path")
    }
    val dest = safeFile(destPath)
    dest.parentFile?.mkdirs()
    val temp = File(dest.parentFile, "${dest.name}.part")
    var bytes = 0L
    try {
      reactApplicationContext.assets.open(assetPath).use { input ->
        FileOutputStream(temp).use { out -> bytes = input.copyTo(out, 1 shl 16) }
      }
      if (dest.exists()) dest.delete()
      if (!temp.renameTo(dest)) throw IOException("Could not finalize copy")
    } catch (e: Exception) {
      temp.delete()
      throw e
    }
    bytes.toDouble()
  }

  override fun mkdirs(path: String, promise: Promise) = async(promise) {
    val dir = safeFile(path)
    if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Could not create folder")
    null
  }

  override fun deletePath(path: String, promise: Promise) = async(promise) {
    val file = safeChild(path)
    if (file.exists() && !file.deleteRecursively()) throw IOException("Could not delete")
    null
  }

  /** Moves [from] to [to]. An existing target is kept aside until the move succeeds. */
  override fun movePath(from: String, to: String, promise: Promise) = async(promise) {
    val source = safeChild(from)
    val target = safeChild(to)
    if (!source.exists()) throw IOException("Nothing to move")
    target.parentFile?.mkdirs()
    val backup = File(target.parentFile, "${target.name}.old")
    backup.deleteRecursively()
    val hadTarget = target.exists()
    if (hadTarget && !target.renameTo(backup)) throw IOException("Could not move existing item aside")
    if (!source.renameTo(target)) {
      if (hadTarget) backup.renameTo(target) // put the old one back
      throw IOException("Could not move")
    }
    backup.deleteRecursively()
    null
  }

  override fun listDir(path: String, promise: Promise) = async(promise) {
    val dir = safeFile(path)
    Arguments.createArray().apply {
      dir.listFiles()?.sortedBy { it.name }?.forEach { f ->
        pushMap(
          Arguments.createMap().apply {
            putString("name", f.name)
            putString("path", f.absolutePath)
            putDouble("sizeBytes", if (f.isFile) f.length().toDouble() else 0.0)
            putBoolean("isDirectory", f.isDirectory)
            putDouble("modifiedAt", f.lastModified().toDouble())
          },
        )
      }
    }
  }

  override fun directorySize(path: String, promise: Promise) = async(promise) {
    val dir = safeFile(path)
    if (!dir.exists()) 0.0 else dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }.toDouble()
  }

  override fun freeSpaceBytes(promise: Promise) = async(promise) {
    StatFs(context.filesDir.absolutePath).availableBytes.toDouble()
  }

  override fun keepScreenOn(enabled: Boolean) {
    val activity = context.currentActivity ?: return
    UiThreadUtil.runOnUiThread {
      if (enabled) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }

  companion object {
    const val NAME = "FileBridge"
    private const val REQUEST_PICK = 7301
    private const val REQUEST_SAVE = 7302
    private const val MAX_TEXT_BYTES = 8L * 1024 * 1024
  }
}
