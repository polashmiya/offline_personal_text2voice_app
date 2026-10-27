import type { ExportFormat } from '../types';

const INVALID = /[\\/:*?"<>|\u0000-\u001F]/g;
const MAX_LENGTH = 100;
/** ext4/f2fs allow 255 bytes per name; Bangla is 3 bytes per character. Leaves room for the extension. */
const MAX_BYTES = 180;

function utf8Length(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Cuts on whole characters so the result is at most maxBytes of UTF-8. */
export function truncateUtf8(s: string, maxBytes: number): string {
  let out = '';
  for (const ch of s) {
    if (utf8Length(out + ch) > maxBytes) {
      break;
    }
    out += ch;
  }
  return out;
}

/** voice_YYYYMMDD_HHmmss */
export function defaultFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `voice_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(
    date.getHours(),
  )}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Removes characters Android/Windows filesystems reject. Keeps Bengali text. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(INVALID, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_LENGTH);
  const fitted = truncateUtf8(cleaned, MAX_BYTES).replace(/[.\s]+$/, '');
  return fitted || defaultFileName();
}

export const FORMAT_INFO: Record<
  ExportFormat,
  { extension: string; mime: string; lossy: boolean; label: string; /** Title/artist tags can be written. */ tags: boolean }
> = {
  wav: { extension: 'wav', mime: 'audio/wav', lossy: false, label: 'WAV', tags: true },
  mp3: { extension: 'mp3', mime: 'audio/mpeg', lossy: true, label: 'MP3', tags: true },
  m4a: { extension: 'm4a', mime: 'audio/mp4', lossy: true, label: 'M4A (AAC)', tags: false },
  flac: { extension: 'flac', mime: 'audio/flac', lossy: false, label: 'FLAC', tags: true },
  opus: { extension: 'ogg', mime: 'audio/ogg', lossy: true, label: 'OGG (Opus)', tags: false },
};

export const BITRATES = [128, 192, 256, 320] as const;
export const DEFAULT_BITRATE = 192;

export function withExtension(name: string, format: ExportFormat): string {
  const base = sanitizeFileName(name).replace(/\.(wav|mp3|m4a|flac|ogg|opus)$/i, '');
  return `${base}.${FORMAT_INFO[format].extension}`;
}

/** Estimated output size in bytes. */
export function estimateSize(
  durationSeconds: number,
  format: ExportFormat,
  bitrateKbps: number,
  sampleRate: number,
): number {
  if (format === 'wav') {
    return Math.round(durationSeconds * sampleRate * 2) + 44;
  }
  if (format === 'flac') {
    // Speech typically compresses to ~55% of PCM.
    return Math.round(durationSeconds * sampleRate * 2 * 0.55);
  }
  return Math.round((durationSeconds * bitrateKbps * 1000) / 8);
}
