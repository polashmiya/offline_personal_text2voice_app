/**
 * LanguageSegmenter: splits text into contiguous Bengali / English runs.
 *
 * - Script decides the language of letters.
 * - Spaces, digits and punctuation join the run before them, so phrases
 *   like "React Native" stay together and punctuation stays with its sentence.
 * - Segments cover the input exactly: concatenating segment texts gives the
 *   original string back (nothing is dropped or reordered).
 */

import type { LanguageSegment } from '../types';
import { classifyChar, isBengaliDigit } from './script';

type Run = { start: number; end: number; cls: 'bengali' | 'latin' | 'neutral'; bnHint: boolean };

function toRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < text.length; i++) {
    const cls = classifyChar(text[i]);
    const last = runs[runs.length - 1];
    if (last && last.cls === cls) {
      last.end = i + 1;
      last.bnHint ||= isBengaliDigit(text[i]);
    } else {
      runs.push({ start: i, end: i + 1, cls, bnHint: isBengaliDigit(text[i]) });
    }
  }
  return runs;
}

export function segmentLanguages(
  text: string,
  fallback: 'bn' | 'en' = 'bn',
): LanguageSegment[] {
  if (!text) {
    return [];
  }
  const runs = toRuns(text);
  const languageOf = (run: Run): LanguageSegment['language'] =>
    run.cls === 'bengali' ? 'bn' : run.cls === 'latin' ? 'en' : 'unknown';

  // Resolve neutral runs: attach to the previous lettered run, or the next one at the start.
  const resolved: Array<{ start: number; end: number; language: LanguageSegment['language'] }> = [];
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    let language = languageOf(run);
    if (language === 'unknown') {
      const prev = resolved[resolved.length - 1];
      if (prev) {
        language = prev.language;
      } else {
        const next = runs.slice(r + 1).find(x => x.cls !== 'neutral');
        language = run.bnHint ? 'bn' : next ? languageOf(next) : fallback;
      }
    }
    const prev = resolved[resolved.length - 1];
    if (prev && prev.language === language) {
      prev.end = run.end;
    } else {
      resolved.push({ start: run.start, end: run.end, language });
    }
  }

  return resolved.map(s => ({
    text: text.slice(s.start, s.end),
    language: s.language,
    start: s.start,
    end: s.end,
  }));
}

/** Dominant language by letter count; used as the fallback for neutral text. */
export function dominantLanguage(text: string): 'bn' | 'en' {
  let bn = 0;
  let en = 0;
  for (const ch of text) {
    const cls = classifyChar(ch);
    if (cls === 'bengali') {
      bn++;
    } else if (cls === 'latin') {
      en++;
    }
  }
  return en > bn ? 'en' : 'bn';
}
