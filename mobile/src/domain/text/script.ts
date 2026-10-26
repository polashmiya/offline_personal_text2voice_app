/**
 * Character classification helpers. Implemented with explicit code-point
 * ranges (no \p{…} regexes) so behavior is identical on Hermes and Node.
 */

export type CharClass = 'bengali' | 'latin' | 'neutral';

const BENGALI_START = 0x0980;
const BENGALI_END = 0x09ff;
const BENGALI_DIGIT_START = 0x09e6;
const BENGALI_DIGIT_END = 0x09ef;
const TAKA_SIGN = 0x09f3;
const RUPEE_MARK = 0x09f2;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;

export function isBengaliDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= BENGALI_DIGIT_START && c <= BENGALI_DIGIT_END;
}

/** Bengali letters, vowel signs and marks (not digits or currency signs). */
export function isBengaliLetter(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c === ZWNJ || c === ZWJ) {
    return true;
  }
  if (c < BENGALI_START || c > BENGALI_END) {
    return false;
  }
  return !(
    (c >= BENGALI_DIGIT_START && c <= BENGALI_DIGIT_END) ||
    c === TAKA_SIGN ||
    c === RUPEE_MARK
  );
}

export function isLatinLetter(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 0x41 && c <= 0x5a) ||
    (c >= 0x61 && c <= 0x7a) ||
    (c >= 0xc0 && c <= 0x24f && c !== 0xd7 && c !== 0xf7)
  );
}

export function isAsciiDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0x30 && c <= 0x39;
}

export function isDigit(ch: string): boolean {
  return isAsciiDigit(ch) || isBengaliDigit(ch);
}

/** Letters or digits of any supported script: used for whole-word matching. */
export function isWordChar(ch: string | undefined): boolean {
  if (!ch) {
    return false;
  }
  return isBengaliLetter(ch) || isLatinLetter(ch) || isDigit(ch);
}

export function classifyChar(ch: string): CharClass {
  if (isBengaliLetter(ch)) {
    return 'bengali';
  }
  if (isLatinLetter(ch)) {
    return 'latin';
  }
  return 'neutral';
}

/** Converts Bengali digits (০-৯) to ASCII digits; other characters unchanged. */
export function toAsciiDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    out += isBengaliDigit(ch)
      ? String.fromCharCode(ch.charCodeAt(0) - BENGALI_DIGIT_START + 0x30)
      : ch;
  }
  return out;
}

export function containsBengali(text: string): boolean {
  for (const ch of text) {
    if (isBengaliLetter(ch) || isBengaliDigit(ch)) {
      return true;
    }
  }
  return false;
}

export function containsLatin(text: string): boolean {
  for (const ch of text) {
    if (isLatinLetter(ch)) {
      return true;
    }
  }
  return false;
}

/**
 * Language of the nearest letter around [start, end), preferring the text
 * before the match. Used to decide how to read numbers, times and units.
 */
export function contextLanguage(
  text: string,
  start: number,
  end: number,
  fallback: 'bn' | 'en',
): 'bn' | 'en' {
  for (let i = start - 1; i >= 0; i--) {
    const cls = classifyChar(text[i]);
    if (cls === 'bengali') {
      return 'bn';
    }
    if (cls === 'latin') {
      return 'en';
    }
    if (isBengaliDigit(text[i])) {
      return 'bn';
    }
  }
  for (let i = end; i < text.length; i++) {
    const cls = classifyChar(text[i]);
    if (cls === 'bengali') {
      return 'bn';
    }
    if (cls === 'latin') {
      return 'en';
    }
  }
  return fallback;
}
