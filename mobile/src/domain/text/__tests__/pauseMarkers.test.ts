import { buildSynthesisPlan, findPauseMarkers, withoutPauseMarkers, type VoiceTextCapabilities } from '../pipeline';

const voice: VoiceTextCapabilities = {
  primaryLanguage: 'en',
  languageHandling: { en: 'native' },
  maxChunkChars: 200,
};

const plan = (text: string) => {
  const result = buildSynthesisPlan({ text, mode: 'en', voice });
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.plan;
};

describe('findPauseMarkers', () => {
  it('reads seconds, milliseconds and Bangla forms', () => {
    expect(findPauseMarkers('a [pause 1s] b [pause 500ms] c [PAUSE 1.5] d').map(m => m.ms)).toEqual([1000, 500, 1500]);
    expect(findPauseMarkers('ক [বিরতি ২ সে] খ [বিরতি ৩০০ মি.সে]').map(m => m.ms)).toEqual([2000, 300]);
  });

  it('caps very long pauses', () => {
    expect(findPauseMarkers('[pause 999s]')[0].ms).toBe(30_000);
  });

  it('ignores ordinary brackets', () => {
    expect(findPauseMarkers('see [note 1] and [pause]')).toEqual([]);
  });

  it('blanks markers without moving offsets', () => {
    const text = 'Hi [pause 1s] there';
    expect(withoutPauseMarkers(text)).toHaveLength(text.length);
    expect(withoutPauseMarkers(text)).not.toContain('pause');
  });
});

describe('plans with pause markers', () => {
  it('never speaks the marker', () => {
    const p = plan('Hello there. [pause 2s] Next part.');
    expect(p.chunks.map(c => c.text).join(' ')).not.toMatch(/pause|\[|\]/i);
  });

  it('uses the marker as the pause after the previous chunk', () => {
    const p = plan('Hello there. [pause 2s] Next part.');
    expect(p.chunks).toHaveLength(2);
    expect(p.chunks[0].pauseAfterMs).toBe(2000);
    expect(p.chunks[1].pauseAfterMs).toBe(0);
  });

  it('splits mid-sentence at the marker', () => {
    const p = plan('Wait for it [pause 1s] now.');
    expect(p.chunks.map(c => c.text)).toEqual(['Wait for it', 'now.']);
    expect(p.chunks[0].pauseAfterMs).toBe(1000);
  });

  it('adds up consecutive markers', () => {
    expect(plan('One. [pause 1s][pause 500ms] Two.').chunks[0].pauseAfterMs).toBe(1500);
  });

  it('turns a leading marker into leading silence and keeps a trailing one', () => {
    const p = plan('[pause 3s] Start. End. [pause 2s]');
    expect(p.leadingPauseMs).toBe(3000);
    expect(p.chunks[p.chunks.length - 1].pauseAfterMs).toBe(2000);
  });

  it('keeps source offsets pointing at the original text', () => {
    const text = 'First line. [pause 1s] Second line.';
    const p = plan(text);
    const second = p.chunks[1];
    expect(text.slice(second.sourceStart, second.sourceEnd).trim()).toBe('Second line.');
    expect(p.chunks[0].sentenceIndex).not.toBe(second.sentenceIndex);
  });

  it('text that is only markers is empty', () => {
    expect(buildSynthesisPlan({ text: '[pause 1s]', mode: 'en', voice }).ok).toBe(false);
  });

  it('plans without markers are unchanged', () => {
    const p = plan('One. Two.');
    expect(p.leadingPauseMs).toBe(0);
    expect(p.chunks[p.chunks.length - 1].pauseAfterMs).toBe(0);
  });
});

describe('text without letters', () => {
  it('reads digits and symbols in the voice language (English voice)', () => {
    for (const text of ['99%', '-5', '1,2,3,4', '31/02/2024']) {
      expect(buildSynthesisPlan({ text, mode: 'auto', voice }).ok).toBe(true);
    }
  });
});

describe('huge money amounts', () => {
  it('reads them digit by digit instead of a rounded number', () => {
    const result = buildSynthesisPlan({ text: '৳99999999999999999999', mode: 'bn', voice: { primaryLanguage: 'bn', languageHandling: { bn: 'native' }, maxChunkChars: 400 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const spoken = result.plan.chunks.map(c => c.text).join(' ');
      expect(spoken).not.toContain('কোটি কোটি');
      expect(spoken.split('নয়').length - 1).toBe(20);
    }
  });
});
