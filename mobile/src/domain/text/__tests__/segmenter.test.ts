import { segmentLanguages } from '../segmenter';

describe('segmentLanguages', () => {
  it('splits the critical mixed sentence into phrases (spec §11)', () => {
    const text = 'আজকে আমরা React Native দিয়ে একটি offline application তৈরি করবো।';
    const segments = segmentLanguages(text);
    expect(segments.map(s => [s.text.trim(), s.language])).toEqual([
      ['আজকে আমরা', 'bn'],
      ['React Native', 'en'],
      ['দিয়ে একটি', 'bn'],
      ['offline application', 'en'],
      ['তৈরি করবো।', 'bn'],
    ]);
  });

  it('covers the input exactly — no text lost or reordered', () => {
    const text = '  "Hello" বলো, 123 টাকা!  React.js ok?\nনতুন লাইন ';
    const segments = segmentLanguages(text);
    expect(segments.map(s => s.text).join('')).toBe(text);
    segments.forEach(s => expect(text.slice(s.start, s.end)).toBe(s.text));
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toBe(segments[i - 1].end);
    }
  });

  it('keeps punctuation and numbers with the preceding language', () => {
    const segments = segmentLanguages('দাম 50, ঠিক আছে');
    expect(segments).toHaveLength(1);
    expect(segments[0].language).toBe('bn');
  });

  it('uses Bengali digits as a hint at the start of text', () => {
    const segments = segmentLanguages('১০ জন এসেছে');
    expect(segments[0].language).toBe('bn');
  });

  it('handles empty and neutral-only input', () => {
    expect(segmentLanguages('')).toEqual([]);
    expect(segmentLanguages('123 ...', 'en')[0].language).toBe('en');
  });
});
