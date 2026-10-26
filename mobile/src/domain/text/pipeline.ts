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
};

export type SynthesisPlan = {
  chunks: PlannedChunk[];
  sentenceCount: number;
  characterCount: number;
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

export function buildSynthesisPlan(input: PlanInput): PlanResult {
  const text = input.text ?? '';
  if (!hasLetters(text) && !/[0-9০-৯]/.test(text)) {
    return { ok: false, error: { code: 'empty_text' } };
  }

  const documentLanguage = dominantLanguage(text);
  const sentences: Sentence[] = splitSentences(text);
  const chunks: PlannedChunk[] = [];
  const unsupported = new Set<LanguageCode>();

  sentences.forEach((sentence, sentenceIndex) => {
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
        sourceStart: sentence.start,
        sourceEnd: sentence.end,
        pauseAfterMs: isLast
          ? PAUSES[sentence.breakAfter]
          : piece.isClauseEnd
          ? CLAUSE_PAUSE
          : SPLIT_PAUSE,
      });
    });
  });

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
  chunks[chunks.length - 1].pauseAfterMs = 0;
  return {
    ok: true,
    plan: { chunks, sentenceCount: sentences.length, characterCount: text.length },
  };
}
