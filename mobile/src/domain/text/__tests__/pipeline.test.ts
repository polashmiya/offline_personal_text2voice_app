import { buildSynthesisPlan, VoiceTextCapabilities } from '../pipeline';
import { splitSentences } from '../sentences';
import { chunkSentence } from '../chunker';
import { applyPronunciations, PronunciationEntry } from '../pronunciation';
import { containsLatin } from '../script';

const bengaliVoice: VoiceTextCapabilities = {
  primaryLanguage: 'bn',
  languageHandling: { bn: 'native', en: 'transliterate' },
  maxChunkChars: 200,
};
const englishVoice: VoiceTextCapabilities = {
  primaryLanguage: 'en',
  languageHandling: { en: 'native' },
  maxChunkChars: 200,
};
const bilingualVoice: VoiceTextCapabilities = {
  primaryLanguage: 'bn',
  languageHandling: { bn: 'native', en: 'native' },
  maxChunkChars: 200,
};

const CRITICAL =
  'আজকে আমরা React Native ব্যবহার করে একটি offline Text to Speech application তৈরি করবো।';

describe('critical mixed sentence (spec §74)', () => {
  it('keeps word order and drops nothing with a Bengali voice', () => {
    const result = buildSynthesisPlan({ text: CRITICAL, mode: 'auto', voice: bengaliVoice });
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    const spoken = result.plan.chunks.map(c => c.text).join(' ');
    expect(containsLatin(spoken)).toBe(false);
    const order = ['আজকে আমরা', 'রিয়্যাক্ট নেটিভ', 'ব্যবহার করে একটি', 'অফলাইন', 'টেক্সট টু স্পিচ', 'অ্যাপ্লিকেশন', 'তৈরি করবো'];
    let cursor = 0;
    for (const piece of order) {
      const at = spoken.indexOf(piece, cursor);
      expect(at).toBeGreaterThanOrEqual(cursor);
      cursor = at + piece.length;
    }
  });

  it('keeps English words as English for a bilingual voice', () => {
    const result = buildSynthesisPlan({ text: CRITICAL, mode: 'auto', voice: bilingualVoice });
    expect(result.ok && result.plan.chunks[0].text).toContain('React Native');
  });

  it('reports Bengali as unsupported for an English-only voice', () => {
    const result = buildSynthesisPlan({ text: CRITICAL, mode: 'auto', voice: englishVoice });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported_language');
      expect(result.unsupportedLanguages).toEqual(['bn']);
    }
  });
});

describe('buildSynthesisPlan', () => {
  it('rejects empty text', () => {
    const result = buildSynthesisPlan({ text: '   \n ', mode: 'auto', voice: bengaliVoice });
    expect(result.ok).toBe(false);
  });

  it('converts Roman Banglish in auto mode', () => {
    const result = buildSynthesisPlan({
      text: 'ami tomake onek valobasi',
      mode: 'auto',
      voice: bengaliVoice,
    });
    expect(result.ok && result.plan.chunks[0].text).toBe('আমি তোমাকে অনেক ভালোবাসি');
  });

  it('does not convert ordinary English in auto mode', () => {
    const result = buildSynthesisPlan({
      text: 'This is a simple test.',
      mode: 'auto',
      voice: englishVoice,
    });
    expect(result.ok && result.plan.chunks[0].text).toBe('This is a simple test.');
  });

  it('applies sentence and paragraph pauses', () => {
    const result = buildSynthesisPlan({
      text: 'প্রথম বাক্য। দ্বিতীয় বাক্য?\n\nনতুন অনুচ্ছেদ।',
      mode: 'auto',
      voice: bengaliVoice,
    });
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    expect(result.plan.chunks.map(c => c.pauseAfterMs)).toEqual([350, 800, 0]);
  });

  it.each([500, 2000, 10000])('chunks %d characters without exceeding the limit', size => {
    const sentence = 'আমরা আজকে offline speech নিয়ে কথা বলবো, এবং অনেক কিছু শিখবো। ';
    const text = sentence.repeat(Math.ceil(size / sentence.length)).slice(0, size);
    const started = Date.now();
    const result = buildSynthesisPlan({ text, mode: 'auto', voice: { ...bengaliVoice, maxChunkChars: 120 } });
    expect(Date.now() - started).toBeLessThan(2000);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    result.plan.chunks.forEach(c => expect(c.text.length).toBeLessThanOrEqual(120));
    expect(result.plan.chunks.length).toBeGreaterThan(0);
  });

  it('applies the pronunciation dictionary first', () => {
    const dictionary: PronunciationEntry[] = [
      { id: '1', term: 'AKIJ', replacement: 'আকিজ', language: 'any', caseSensitive: false, enabled: true },
    ];
    const result = buildSynthesisPlan({
      text: 'AKIJ গ্রুপ',
      mode: 'auto',
      voice: bengaliVoice,
      dictionary,
    });
    expect(result.ok && result.plan.chunks[0].text).toBe('আকিজ গ্রুপ');
  });
});

describe('splitSentences', () => {
  it('does not split on decimals, abbreviations or dotted names', () => {
    const sentences = splitSentences('Dr. Rahman paid 3.5 taka. React.js is great! কেমন আছো? ভালো।');
    expect(sentences.map(s => s.text)).toEqual([
      'Dr. Rahman paid 3.5 taka.',
      'React.js is great!',
      'কেমন আছো?',
      'ভালো।',
    ]);
    expect(sentences.map(s => s.breakAfter)).toEqual(['sentence', 'exclamation', 'question', 'end']);
  });

  it('keeps offsets into the original text', () => {
    const text = '  এক। দুই।';
    splitSentences(text).forEach(s => expect(text.slice(s.start, s.end)).toBe(s.text));
  });

  it('does not split Bengali abbreviations', () => {
    expect(splitSentences('ডা. করিম এসেছেন।')).toHaveLength(1);
  });
});

describe('chunkSentence', () => {
  it('prefers clause boundaries', () => {
    const chunks = chunkSentence('এক দুই তিন চার পাঁচ, ছয় সাত আট নয় দশ এগারো বারো', 30);
    expect(chunks[0]).toEqual({ text: 'এক দুই তিন চার পাঁচ,', isClauseEnd: true });
  });
  it('never splits inside a word', () => {
    const chunks = chunkSentence('alpha beta gamma delta epsilon zeta eta theta', 12);
    chunks.forEach(c => expect(c.text.length).toBeLessThanOrEqual(12));
    expect(chunks.map(c => c.text).join(' ')).toBe('alpha beta gamma delta epsilon zeta eta theta');
  });
});

describe('applyPronunciations', () => {
  const entries: PronunciationEntry[] = [
    { id: '1', term: 'SQL', replacement: 'সিকুয়েল', language: 'any', caseSensitive: true, enabled: true },
    { id: '2', term: 'PostgreSQL', replacement: 'পোস্টগ্রেস', language: 'any', caseSensitive: true, enabled: true },
    { id: '3', term: 'off', replacement: 'X', language: 'any', caseSensitive: false, enabled: false },
  ];
  it('matches whole words, longest first, skips disabled', () => {
    expect(applyPronunciations('PostgreSQL vs SQL vs MySQL off', entries)).toBe(
      'পোস্টগ্রেস vs সিকুয়েল vs MySQL off',
    );
  });
});
