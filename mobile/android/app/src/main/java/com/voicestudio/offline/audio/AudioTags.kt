package com.voicestudio.offline.audio

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Title/artist tags written without any native library, UTF-8 throughout so
 * Bangla titles survive:
 *   MP3  → ID3v2.4 tag in front of the stream
 *   WAV  → RIFF LIST/INFO chunk after the data
 *   FLAC → VORBIS_COMMENT metadata block
 * M4A and OGG/Opus come from MediaMuxer, which cannot write tags, so the app
 * says so instead of pretending.
 */
data class AudioTags(val title: String, val artist: String, val comment: String) {
  val isEmpty: Boolean get() = title.isBlank() && artist.isBlank() && comment.isBlank()

  companion object {
    const val SOFTWARE = "Voice Studio (offline)"
    private const val MAX_CHARS = 200

    fun of(title: String?, artist: String?, comment: String?) = AudioTags(
      title.orEmpty().trim().take(MAX_CHARS),
      artist.orEmpty().trim().take(MAX_CHARS),
      comment.orEmpty().trim().take(MAX_CHARS),
    )
  }
}

object TagWriter {
  // ------------------------------------------------------------- ID3v2.4

  fun id3v2(tags: AudioTags): ByteArray {
    val frames = ByteArrayOutputStream()
    fun text(id: String, value: String) {
      if (value.isBlank()) return
      val body = byteArrayOf(3) + value.toByteArray(Charsets.UTF_8) // 3 = UTF-8
      frame(frames, id, body)
    }
    text("TIT2", tags.title)
    text("TPE1", tags.artist)
    text("TSSE", AudioTags.SOFTWARE)
    if (tags.comment.isNotBlank()) {
      // encoding, language, empty description (terminated), text
      val body = byteArrayOf(3) + "und".toByteArray(Charsets.US_ASCII) + byteArrayOf(0) +
        tags.comment.toByteArray(Charsets.UTF_8)
      frame(frames, "COMM", body)
    }
    val payload = frames.toByteArray()
    val out = ByteArrayOutputStream()
    out.write("ID3".toByteArray(Charsets.US_ASCII))
    out.write(byteArrayOf(4, 0, 0)) // v2.4.0, no flags
    out.write(synchsafe(payload.size))
    out.write(payload)
    return out.toByteArray()
  }

  private fun frame(out: ByteArrayOutputStream, id: String, body: ByteArray) {
    out.write(id.toByteArray(Charsets.US_ASCII))
    out.write(synchsafe(body.size))
    out.write(byteArrayOf(0, 0))
    out.write(body)
  }

  private fun synchsafe(n: Int): ByteArray = byteArrayOf(
    ((n shr 21) and 0x7F).toByte(),
    ((n shr 14) and 0x7F).toByte(),
    ((n shr 7) and 0x7F).toByte(),
    (n and 0x7F).toByte(),
  )

  // ------------------------------------------------------------- WAV LIST/INFO

  /** Appends a LIST/INFO chunk to a finished WAV and fixes the RIFF size. */
  fun appendWavInfo(file: File, tags: AudioTags) {
    val info = ByteArrayOutputStream()
    info.write("INFO".toByteArray(Charsets.US_ASCII))
    fun sub(id: String, value: String) {
      if (value.isBlank()) return
      val data = value.toByteArray(Charsets.UTF_8) + byteArrayOf(0)
      info.write(id.toByteArray(Charsets.US_ASCII))
      info.write(le32(data.size))
      info.write(data)
      if (data.size % 2 == 1) info.write(0)
    }
    sub("INAM", tags.title)
    sub("IART", tags.artist)
    sub("ICMT", tags.comment)
    sub("ISFT", AudioTags.SOFTWARE)
    val body = info.toByteArray()
    RandomAccessFile(file, "rw").use { raf ->
      var end = raf.length()
      if (end % 2 == 1L) {
        raf.seek(end)
        raf.write(0)
        end++
      }
      raf.seek(end)
      raf.write("LIST".toByteArray(Charsets.US_ASCII))
      raf.write(le32(body.size))
      raf.write(body)
      val riffSize = raf.length() - 8
      raf.seek(4)
      raf.write(le32(riffSize.coerceAtMost(0xFFFFFFFFL).toInt()))
    }
  }

  // ------------------------------------------------------------- FLAC

  /**
   * Rewrites the encoder's header ("fLaC" + metadata blocks) so a
   * VORBIS_COMMENT block is the last metadata block.
   */
  fun flacHeaderWithComments(header: ByteArray, tags: AudioTags): ByteArray {
    val out = ByteArrayOutputStream()
    out.write(header, 0, 4) // "fLaC"
    var pos = 4
    while (pos + 4 <= header.size) {
      val flags = header[pos].toInt() and 0xFF
      val length = ((header[pos + 1].toInt() and 0xFF) shl 16) or
        ((header[pos + 2].toInt() and 0xFF) shl 8) or (header[pos + 3].toInt() and 0xFF)
      val type = flags and 0x7F
      val end = minOf(header.size, pos + 4 + length)
      if (type != 4) { // drop any existing comment block; keep the rest, not marked last
        out.write(type)
        out.write(header, pos + 1, 3)
        out.write(header, pos + 4, end - pos - 4)
      }
      pos = end
      if (flags and 0x80 != 0) break
    }
    val comments = vorbisComment(tags)
    out.write(0x80 or 4)
    out.write((comments.size shr 16) and 0xFF)
    out.write((comments.size shr 8) and 0xFF)
    out.write(comments.size and 0xFF)
    out.write(comments)
    return out.toByteArray()
  }

  private fun vorbisComment(tags: AudioTags): ByteArray {
    val entries = listOfNotNull(
      tags.title.takeIf { it.isNotBlank() }?.let { "TITLE=$it" },
      tags.artist.takeIf { it.isNotBlank() }?.let { "ARTIST=$it" },
      tags.comment.takeIf { it.isNotBlank() }?.let { "COMMENT=$it" },
    ).map { it.toByteArray(Charsets.UTF_8) }
    val vendor = AudioTags.SOFTWARE.toByteArray(Charsets.UTF_8)
    val out = ByteArrayOutputStream()
    out.write(le32(vendor.size))
    out.write(vendor)
    out.write(le32(entries.size))
    for (e in entries) {
      out.write(le32(e.size))
      out.write(e)
    }
    return out.toByteArray()
  }

  private fun le32(n: Int): ByteArray = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(n).array()
}
