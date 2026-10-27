/**
 * Timing map of a generated audio file: which part of the original text is
 * heard when. Built from the exact chunk positions the native join reports,
 * merged to one span per sentence. Used for read-along highlighting and
 * subtitle (SRT / WebVTT) export.
 */

export type TimedSpan = {
  startMs: number;
  endMs: number;
  /** Offsets into the original text. */
  sourceStart: number;
  sourceEnd: number;
};

export type ChunkTiming = {
  sentenceIndex: number;
  sourceStart: number;
  sourceEnd: number;
  startMs: number;
  endMs: number;
};

/** One span per sentence: from its first chunk's start to its last chunk's end. */
export function buildTimeline(chunks: ChunkTiming[]): TimedSpan[] {
  const spans: TimedSpan[] = [];
  let current: (TimedSpan & { sentence: number }) | null = null;
  for (const c of chunks) {
    if (!(c.endMs > c.startMs)) {
      continue;
    }
    if (current && current.sentence === c.sentenceIndex) {
      current.endMs = Math.max(current.endMs, c.endMs);
      current.sourceStart = Math.min(current.sourceStart, c.sourceStart);
      current.sourceEnd = Math.max(current.sourceEnd, c.sourceEnd);
      continue;
    }
    if (current) {
      spans.push(strip(current));
    }
    current = { ...c, sentence: c.sentenceIndex };
  }
  if (current) {
    spans.push(strip(current));
  }
  return spans;
}

function strip(s: TimedSpan & { sentence: number }): TimedSpan {
  return { startMs: s.startMs, endMs: s.endMs, sourceStart: s.sourceStart, sourceEnd: s.sourceEnd };
}

/**
 * Index of the span being heard at positionMs (the last span that started),
 * or -1 before the first one. Pauses keep the previous sentence highlighted.
 */
export function activeSpan(spans: TimedSpan[], positionMs: number): number {
  let lo = 0;
  let hi = spans.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (spans[mid].startMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Moves the timeline (e.g. after the mixer adds silence before / trims the
 * start: offset = padStart − trimStart) and clips it to [0, totalMs].
 */
export function shiftTimeline(spans: TimedSpan[], offsetMs: number, totalMs: number): TimedSpan[] {
  return spans
    .map(s => ({ ...s, startMs: Math.max(0, s.startMs + offsetMs), endMs: Math.min(totalMs, s.endMs + offsetMs) }))
    .filter(s => s.endMs > s.startMs);
}

export function parseTimeline(raw: unknown): TimedSpan[] {
  if (typeof raw !== 'string' || !raw) {
    return [];
  }
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (s): s is TimedSpan =>
        s && [s.startMs, s.endMs, s.sourceStart, s.sourceEnd].every(n => typeof n === 'number' && Number.isFinite(n)),
    );
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ subtitles

const MAX_LINE = 42;

function cueText(text: string, span: TimedSpan): string {
  const raw = text.slice(span.sourceStart, span.sourceEnd).replace(/\s+/g, ' ').trim();
  return wrap(raw);
}

/** Wraps to at most two balanced lines when longer than one subtitle line. */
function wrap(text: string): string {
  if (text.length <= MAX_LINE) {
    return text;
  }
  const middle = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) {
      best = i;
    }
  }
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

function clock(ms: number, separator: ',' | '.'): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const milli = total % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${separator}${p(milli, 3)}`;
}

function cues(text: string, spans: TimedSpan[]) {
  return spans
    .map(span => ({ span, body: cueText(text, span) }))
    .filter(c => c.body.length > 0);
}

/** SubRip (.srt). */
export function toSrt(text: string, spans: TimedSpan[]): string {
  return cues(text, spans)
    .map((c, i) => `${i + 1}\n${clock(c.span.startMs, ',')} --> ${clock(c.span.endMs, ',')}\n${c.body}\n`)
    .join('\n');
}

/** WebVTT (.vtt). Cue text escapes the characters VTT treats as markup. */
export function toVtt(text: string, spans: TimedSpan[]): string {
  const body = cues(text, spans)
    .map(c => {
      const safe = c.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `${clock(c.span.startMs, '.')} --> ${clock(c.span.endMs, '.')}\n${safe}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
