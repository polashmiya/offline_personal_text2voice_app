/**
 * Sentence splitting on the original text. Keeps offsets so progress and
 * highlighting can point back into what the user typed.
 */

import { isDigit, isLatinLetter } from './script';

export type SentenceBreak = 'sentence' | 'question' | 'exclamation' | 'line' | 'paragraph' | 'end';

export type Sentence = {
  text: string;
  start: number;
  end: number;
  breakAfter: SentenceBreak;
};

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'approx', 'no', 'jan',
  'feb', 'aug', 'sept', 'oct', 'nov', 'dec', 'inc', 'ltd', 'co', 'jr', 'sr', 'tk', 'rs',
]);
// Bengali abbreviations end with '.' too (ডা. মো.) — a dot after 1–3 Bengali chars is not a sentence end.
const BENGALI_SHORT_ABBR = /(?:^|[\s(])[ঀ-৿]{1,3}$/;

const TERMINATORS = new Set(['.', '!', '?', '।', '॥', '…']);
const CLOSERS = new Set(['"', "'", ')', ']', '»', '”', '’']);

function isAbbreviation(text: string, dotIndex: number): boolean {
  let i = dotIndex - 1;
  while (i >= 0 && (isLatinLetter(text[i]) || text[i] === '.')) {
    i--;
  }
  const word = text.slice(i + 1, dotIndex).toLowerCase();
  if (word && ABBREVIATIONS.has(word)) {
    return true;
  }
  // Single capital initial: "A. Rahman"
  if (word.length === 1 && /[a-z]/.test(word) && text[dotIndex - 1] === text[dotIndex - 1].toUpperCase()) {
    return true;
  }
  return BENGALI_SHORT_ABBR.test(text.slice(Math.max(0, dotIndex - 5), dotIndex));
}

export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;

  const push = (end: number, breakAfter: SentenceBreak) => {
    const raw = text.slice(start, end);
    const trimmedStart = start + (raw.length - raw.trimStart().length);
    const trimmed = raw.trim();
    if (trimmed) {
      sentences.push({
        text: trimmed,
        start: trimmedStart,
        end: trimmedStart + trimmed.length,
        breakAfter,
      });
    } else if (sentences.length && breakAfter === 'paragraph') {
      sentences[sentences.length - 1].breakAfter = 'paragraph';
    }
    start = end;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '\n') {
      let j = i;
      let newlines = 0;
      while (j < text.length && /\s/.test(text[j])) {
        if (text[j] === '\n') {
          newlines++;
        }
        j++;
      }
      push(i, newlines > 1 ? 'paragraph' : 'line');
      if (newlines > 1 && sentences.length) {
        sentences[sentences.length - 1].breakAfter = 'paragraph';
      }
      start = j;
      i = j - 1;
      continue;
    }

    if (!TERMINATORS.has(ch)) {
      continue;
    }
    // Decimal or version number: 3.14, v1.2
    if (ch === '.' && isDigit(text[i - 1] ?? '') && isDigit(text[i + 1] ?? '')) {
      continue;
    }
    // Part of a token (React.js, example.com): no whitespace after the dot
    let end = i + 1;
    while (end < text.length && (TERMINATORS.has(text[end]) || CLOSERS.has(text[end]))) {
      end++;
    }
    const next = text[end];
    if (next !== undefined && !/\s/.test(next)) {
      continue;
    }
    if (ch === '.' && isAbbreviation(text, i)) {
      continue;
    }
    const terminators = text.slice(i, end);
    const breakAfter: SentenceBreak = terminators.includes('?')
      ? 'question'
      : terminators.includes('!')
      ? 'exclamation'
      : 'sentence';
    push(end, breakAfter);
    i = end - 1;
  }
  push(text.length, 'end');
  if (sentences.length) {
    sentences[sentences.length - 1].breakAfter = 'end';
  }
  return sentences;
}
