import { activeSpan, buildTimeline, parseTimeline, shiftTimeline, toSrt, toVtt, type TimedSpan } from '../timeline';

const text = 'আমি ভালো আছি। How are you? Long sentence here.';
// sentence 0: 0..13, sentence 1: 14..26, sentence 2: 27..46
const chunks = [
  { sentenceIndex: 0, sourceStart: 0, sourceEnd: 13, startMs: 150, endMs: 1200 },
  { sentenceIndex: 1, sourceStart: 14, sourceEnd: 26, startMs: 1550, endMs: 2400 },
  { sentenceIndex: 2, sourceStart: 27, sourceEnd: 46, startMs: 2850, endMs: 3300 },
  { sentenceIndex: 2, sourceStart: 27, sourceEnd: 46, startMs: 3360, endMs: 4100 },
];

describe('buildTimeline', () => {
  it('merges chunks of one sentence into one span', () => {
    const spans = buildTimeline(chunks);
    expect(spans).toHaveLength(3);
    expect(spans[2]).toEqual({ startMs: 2850, endMs: 4100, sourceStart: 27, sourceEnd: 46 });
  });

  it('drops zero-length chunks', () => {
    expect(buildTimeline([{ sentenceIndex: 0, sourceStart: 0, sourceEnd: 3, startMs: 10, endMs: 10 }])).toEqual([]);
  });
});

describe('activeSpan', () => {
  const spans = buildTimeline(chunks);
  it('is -1 before the first sentence', () => expect(activeSpan(spans, 0)).toBe(-1));
  it('finds the sentence being spoken', () => expect(activeSpan(spans, 1600)).toBe(1));
  it('keeps the previous sentence during a pause', () => expect(activeSpan(spans, 2500)).toBe(1));
  it('stays on the last sentence after the end', () => expect(activeSpan(spans, 99_999)).toBe(2));
  it('handles empty timelines', () => expect(activeSpan([], 100)).toBe(-1));
});

describe('shiftTimeline', () => {
  it('moves spans and clips to the new length', () => {
    const spans: TimedSpan[] = [
      { startMs: 0, endMs: 100, sourceStart: 0, sourceEnd: 1 },
      { startMs: 500, endMs: 900, sourceStart: 1, sourceEnd: 2 },
    ];
    expect(shiftTimeline(spans, -200, 600)).toEqual([{ startMs: 300, endMs: 600, sourceStart: 1, sourceEnd: 2 }]);
    expect(shiftTimeline(spans, 1000, 5000)[0].startMs).toBe(1000);
  });
});

describe('parseTimeline', () => {
  it('rejects junk', () => {
    expect(parseTimeline(null)).toEqual([]);
    expect(parseTimeline('{')).toEqual([]);
    expect(parseTimeline('[{"startMs":1}]')).toEqual([]);
  });
  it('round-trips', () => {
    const spans = buildTimeline(chunks);
    expect(parseTimeline(JSON.stringify(spans))).toEqual(spans);
  });
});

describe('subtitles', () => {
  const spans = buildTimeline(chunks);

  it('writes SRT with comma milliseconds and original text', () => {
    const srt = toSrt(text, spans);
    expect(srt).toContain('1\n00:00:00,150 --> 00:00:01,200\nআমি ভালো আছি।\n');
    expect(srt).toContain('3\n00:00:02,850 --> 00:00:04,100\nLong sentence here.');
  });

  it('writes WebVTT with header, dot milliseconds and escaping', () => {
    const vtt = toVtt('a < b & c', [{ startMs: 3_723_004, endMs: 3_724_000, sourceStart: 0, sourceEnd: 9 }]);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('01:02:03.004 --> 01:02:04.000\na &lt; b &amp; c');
  });

  it('wraps long cues onto two lines near the middle', () => {
    const long = 'This is a fairly long sentence that should wrap onto two subtitle lines.';
    const srt = toSrt(long, [{ startMs: 0, endMs: 1000, sourceStart: 0, sourceEnd: long.length }]);
    const lines = srt.split('\n').slice(2, 4);
    expect(lines.every(l => l.length <= 42)).toBe(true);
    expect(lines.join(' ')).toBe(long);
  });

  it('skips cues with no text', () => {
    expect(toSrt('   ', [{ startMs: 0, endMs: 10, sourceStart: 0, sourceEnd: 3 }])).toBe('');
  });
});
