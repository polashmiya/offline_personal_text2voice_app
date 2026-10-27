import { sanitizeFileName, truncateUtf8, withExtension } from '../fileName';

// UTF-8 byte length without relying on TextEncoder typings.
const utf8 = (s: string) => unescape(encodeURIComponent(s)).length;

describe('file names', () => {
  it('keeps long Bangla names within the filesystem byte limit', () => {
    const name = 'বাংলা'.repeat(40); // 200 chars, 600 bytes
    const safe = withExtension(name, 'mp3');
    expect(utf8(safe)).toBeLessThanOrEqual(255);
    expect(safe.endsWith('.mp3')).toBe(true);
  });

  it('never cuts a character in half', () => {
    const cut = truncateUtf8('আমি', 5); // each letter is 3 bytes
    expect(cut).toBe('আ');
    expect(utf8(cut)).toBeLessThanOrEqual(5);
  });

  it('keeps short names as they are and removes invalid characters', () => {
    expect(sanitizeFileName('My: video/part?1')).toBe('My_ video_part_1');
    expect(sanitizeFileName('আমার ভিডিও')).toBe('আমার ভিডিও');
  });

  it('falls back to a default name', () => {
    expect(sanitizeFileName('...')).toMatch(/^voice_\d{8}_\d{6}$/);
  });
});
