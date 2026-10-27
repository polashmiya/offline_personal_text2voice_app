/**
 * Text → synthesis plan.
 *
 *   original text
 *   → sentence split (offsets into the original)
 *   → pronunciation dictionary (user rules win)
 *   → Roman Banglish → Bengali script
 *   → cross-script normalization (numbers, money, dates, times, units…)
 *   → language segmentation
 *   → per-language normalization (acronyms, abbreviations)
 *   → voice routing (native, or English → Bengali-script pronunciation)
 *   → chunking with pauses
 *
 * The plan is pure data; the synthesis service feeds chunks to the engine.
 */

import type { AppError, LanguageCode, LanguageHandling, LanguageMode } from '../types';
import { containsLatin, isBengaliLetter, isLatinLetter } from './script';
import { convertBanglish, looksLikeBanglish } from './banglish';
import { applyPronunciations, PronunciationEntry } from './pronunciation';
import {
  collapseSpaces,
  expandSemiotics,
  nfc,
  normalizeBengaliSegment,
  normalizeEnglishSegment,
} from './normalize';
import { dominantLanguage, segmentLanguages } from './segmenter';
import { englishTextToBengali } from './englishToBengali';
import { Sentence, SentenceBreak, splitSentences } from './sentences';
import { chunkSentence } from './chunker';

export type VoiceTextCapabilities = {
  primaryLanguage: LanguageCode;
  languageHandling: Partial<Record<LanguageCode, LanguageHandling>>;
  maxChunkChars: number;
};

export type PlannedChunk = {
  index: number;
  /** Text sent to the engine. */
  text: string;
  sentenceIndex: number;
  /** Offsets of the source sentence in the original text. */
  sourceStart: number;
  sourceEnd: number;
  /** Silence to insert after this chunk, at 1.0x speed. */
  pauseAfterMs: number;
  /** Internal while planning: the pause came from a [pause] marker. */
  pausedByMarker?: boolean;
};

export type SynthesisPlan = {
  chunks: PlannedChunk[];
  sentenceCount: number;
  characterCount: number;
  /** Silence before the first chunk, from a [pause] marker at the very start. */
  leadingPauseMs: number;
};

export type PlanResult =
  | { ok: true; plan: SynthesisPlan }
  | { ok: false; error: AppError; unsupportedLanguages?: LanguageCode[] };

export type PlanInput = {
  text: string;
  mode: LanguageMode;
  voice: VoiceTextCapabilities;
  dictionary?: PronunciationEntry[];
  projectId?: string;
};

const PAUSES: Record<SentenceBreak, number> = {
  sentence: 350,
  question: 450,
  exclamation: 400,
  line: 450,
  paragraph: 800,
  end: 0,
};
const CLAUSE_PAUSE = 150;
const SPLIT_PAUSE = 60;

function hasLetters(text: string): boolean {
  for (const ch of text) {
    if (isBengaliLetter(ch) || isLatinLetter(ch)) {
      return true;
    }
  }
  return false;
}

function convertRomanBengali(text: string, mode: LanguageMode): string {
  if (mode === 'banglish') {
    return convertBanglish(text);
  }
  if ((mode === 'auto' || mode === 'bn') && containsLatin(text) && looksLikeBanglish(text)) {
    return convertBanglish(text);
  }
  return text;
}

/** Turns one source sentence into the text the voice should read. */
export function prepareSentence(
  sentence: string,
  input: Omit<PlanInput, 'text'>,
  documentLanguage: LanguageCode,
): { spoken: string; unsupported: Set<LanguageCode> } {
  const unsupported = new Set<LanguageCode>();
  let text = nfc(sentence);
  text = applyPronunciations(text, input.dictionary ?? [], {
    projectId: input.projectId,
    voiceLanguage: input.voice.primaryLanguage,
  });
  text = convertRomanBengali(text, input.mode);

  const fallback = hasLetters(text) ? dominantLanguage(text) : documentLanguage;
  text = expandSemiotics(text, fallback);

  const spokenParts = segmentLanguages(text, fallback).map(segment => {
    if (segment.language === 'unknown') {
      return segment.text;
    }
    const normalized =
      segment.language === 'bn'
        ? normalizeBengaliSegment(segment.text)
        : normalizeEnglishSegment(segment.text);
    const handling = input.voice.languageHandling[segment.language];
    if (handling === 'native') {
      return normalized;
    }
    if (handling === 'transliterate' && segment.language === 'en') {
      return englishTextToBengali(normalized);
    }
    if (hasLetters(segment.text)) {
      unsupported.add(segment.language);
    }
    return normalized;
  });

  return { spoken: collapseSpaces(spokenParts.join('')).trim(), unsupported };
}

// ------------------------------------------------------------------ pause markers

/** [pause 1s] · [pause 500ms] · [pause 1.5] (seconds) · [বিরতি ২ সে] · [বিরতি ৫০০ মি.সে] */
const PAUSE_MARKER =
  /\[\s*(?:pause|বিরতি)\s+([0-9০-৯]+(?:[.,][0-9০-৯]+)?)\s*(ms|s|sec|secs|seconds?|সে|সেকেন্ড|মি\.?\s?সে|মিলিসেকেন্ড)?\s*\]/giu;
export const MAX_MARKER_PAUSE_MS = 30_000;

export type PauseMarker = { start: number; end: number; ms: number };

const toAsciiDigits = (s: string) => s.replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x09e6)).replace(',', '.');

export function findPauseMarkers(text: string): PauseMarker[] {
  const markers: PauseMarker[] = [];
  for (const m of text.matchAll(PAUSE_MARKER)) {
    const value = Number(toAsciiDigits(m[1]));
    const unit = (m[2] ?? 's').toLowerCase();
    const isMs = unit === 'ms' || unit.startsWith('মি');
    const ms = Math.round(isMs ? value : value * 1000);
    if (Number.isFinite(ms)) {
      markers.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, ms: Math.min(MAX_MARKER_PAUSE_MS, ms) });
    }
  }
  return markers;
}

/** The text with pause markers blanked out (same length, so offsets stay valid). */
export function withoutPauseMarkers(text: string): string {
  return text.replace(PAUSE_MARKER, m => ' '.repeat(m.length));
}

// ------------------------------------------------------------------ plan

/**
 * Builds the plan. Pause markers split the text: each part is planned on
 * its own (offsets kept relative to the full text) and the marker's silence
 * replaces the pause after the last chunk before it. A marker before any
 * speech becomes leading silence.
 */
export function buildSynthesisPlan(input: PlanInput): PlanResult {
  const text = input.text ?? '';
  const markers = findPauseMarkers(text);
  const clean = markers.length ? withoutPauseMarkers(text) : text;
  if (!hasLetters(clean) && !/[0-9০-৯]/.test(clean)) {
    return { ok: false, error: { code: 'empty_text' } };
  }

  // Digits/symbols only ("99%", "31/12"): nothing to detect, so read them in the voice's language.
  const documentLanguage = hasLetters(clean) ? dominantLanguage(clean) : input.voice.primaryLanguage;
  const chunks: PlannedChunk[] = [];
  const unsupported = new Set<LanguageCode>();
  let sentenceCount = 0;
  let leadingPauseMs = 0;

  // Parts between markers: [0, m0.start), [m0.end, m1.start), …, [mLast.end, len)
  let partStart = 0;
  for (let i = 0; i <= markers.length; i++) {
    const partEnd = i < markers.length ? markers[i].start : text.length;
    sentenceCount += planPart(text.slice(partStart, partEnd), partStart, sentenceCount, input, documentLanguage, chunks, unsupported);
    if (i < markers.length) {
      const last = chunks[chunks.length - 1];
      if (!last) {
        leadingPauseMs = Math.min(MAX_MARKER_PAUSE_MS, leadingPauseMs + markers[i].ms);
      } else if (last.pausedByMarker) {
        // Consecutive markers add up.
        last.pauseAfterMs = Math.min(MAX_MARKER_PAUSE_MS, last.pauseAfterMs + markers[i].ms);
      } else {
        last.pauseAfterMs = markers[i].ms;
        last.pausedByMarker = true;
      }
      partStart = markers[i].end;
    }
  }

  if (unsupported.size > 0) {
    return {
      ok: false,
      error: { code: 'unsupported_language', detail: [...unsupported].join(',') },
      unsupportedLanguages: [...unsupported],
    };
  }
  if (chunks.length === 0) {
    return { ok: false, error: { code: 'empty_text' } };
  }
  const last = chunks[chunks.length - 1];
  if (!last.pausedByMarker) {
    last.pauseAfterMs = 0; // a trailing marker is an explicit request for silence at the end
  }
  for (const chunk of chunks) {
    delete chunk.pausedByMarker;
  }
  return {
    ok: true,
    plan: { chunks, sentenceCount, characterCount: text.length, leadingPauseMs },
  };
}

/** Plans one marker-free part. Returns how many sentences it had. */
function planPart(
  part: string,
  offset: number,
  sentenceBase: number,
  input: PlanInput,
  documentLanguage: LanguageCode,
  chunks: PlannedChunk[],
  unsupported: Set<LanguageCode>,
): number {
  const sentences: Sentence[] = splitSentences(part);

  sentences.forEach((sentence, localIndex) => {
    const sentenceIndex = sentenceBase + localIndex;
    const prepared = prepareSentence(sentence.text, input, documentLanguage);
    prepared.unsupported.forEach(lang => unsupported.add(lang));

    const pieces = hasLetters(prepared.spoken)
      ? chunkSentence(prepared.spoken, input.voice.maxChunkChars)
      : [];
    if (pieces.length === 0) {
      // Punctuation-only line: keep its pause on the previous chunk.
      const previous = chunks[chunks.length - 1];
      if (previous) {
        previous.pauseAfterMs = Math.max(previous.pauseAfterMs, PAUSES[sentence.breakAfter]);
      }
      return;
    }
    pieces.forEach((piece, i) => {
      const isLast = i === pieces.length - 1;
      chunks.push({
        index: chunks.length,
        text: piece.text,
        sentenceIndex,
        sourceStart: offset + sentence.start,
        sourceEnd: offset + sentence.end,
        pauseAfterMs: isLast
          ? PAUSES[sentence.breakAfter]
          : piece.isClauseEnd
          ? CLAUSE_PAUSE
          : SPLIT_PAUSE,
      });
    });
  });
  return sentences.length;
}
