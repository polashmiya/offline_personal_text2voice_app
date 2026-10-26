package com.voicestudio.offline.files

import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.zip.ZipInputStream

class UnsafeArchiveException(message: String) : IOException(message)

/**
 * Extracts a zip archive while defending against malicious packages:
 * path traversal ("../"), absolute paths, symlink-style names, zip bombs
 * (bytes are counted as written, not trusted from headers), and entry floods.
 * Nothing inside the archive is ever executed.
 */
object SafeZip {
  data class Result(val fileCount: Int, val totalBytes: Long)

  fun extract(zip: File, destination: File, maxTotalBytes: Long, maxEntries: Int): Result {
    if (!zip.isFile) throw IOException("Archive not found")
    destination.mkdirs()
    val root = destination.canonicalFile
    var total = 0L
    var count = 0
    val buffer = ByteArray(64 * 1024)

    ZipInputStream(BufferedInputStream(FileInputStream(zip))).use { input ->
      while (true) {
        val entry = input.nextEntry ?: break
        count++
        if (count > maxEntries) throw UnsafeArchiveException("Too many files in package")
        val name = entry.name
        if (name.isEmpty() || name.startsWith("/") || name.startsWith("\\") ||
          name.contains("..") || name.contains('\\') || name.contains(':') || name.contains('\u0000')
        ) {
          throw UnsafeArchiveException("Unsafe path in package: $name")
        }
        val target = File(root, name).canonicalFile
        if (!target.path.startsWith(root.path + File.separator)) {
          throw UnsafeArchiveException("Path escapes package folder: $name")
        }
        if (entry.isDirectory) {
          target.mkdirs()
          continue
        }
        target.parentFile?.mkdirs()
        FileOutputStream(target).use { out ->
          while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            total += n
            if (total > maxTotalBytes) throw UnsafeArchiveException("Package is larger than allowed")
            out.write(buffer, 0, n)
          }
        }
      }
    }
    if (count == 0) throw UnsafeArchiveException("Package is empty or not a zip file")
    return Result(count, total)
  }
}
