/**
 * English → Bengali-script pronunciation, so a Bengali voice can read English
 * words the way Bangladeshi speakers say them ("React" → "রিয়্যাক্ট").
 *
 * The curated lexicon handles common words. Everything else goes through
 * approximate spelling rules — English spelling is irregular, so results for
 * unknown words are understandable rather than perfect. Users can fix any
 * word with the pronunciation dictionary.
 */

import { LETTER_NAMES_BN, lookupLexicon } from './lexicon';
import { splitLatinWords } from './banglish';

const HASANTA = '্';

type VowelOut = { independent: string; sign: string };

const v = (independent: string, sign: string): VowelOut => ({ independent, sign });

const VOWEL_DIGRAPHS: Array<[string, VowelOut]> = [
  ['ight', v('আইট', 'াইট')],
  ['igh', v('আই', 'াই')],
  ['ee', v('ঈ', 'ী')],
  ['ea', v('ঈ', 'ী')],
  ['oo', v('উ', 'ু')],
  ['ou', v('আউ', 'াউ')],
  ['ow', v('আউ', 'াউ')],
  ['ai', v('এই', 'েই')],
  ['ay', v('এই', 'েই')],
  ['oa', v('ও', 'ো')],
  ['oi', v('অয়', 'য়')],
  ['oy', v('অয়', 'য়')],
  ['au', v('অ', '')],
  ['aw', v('অ', '')],
  ['ew', v('ইউ', 'িউ')],
];

const CONSONANT_DIGRAPHS: Array<[string, string]> = [
  ['tch', 'চ'],
  ['sh', 'শ'],
  ['ch', 'চ'],
  ['th', 'থ'],
  ['ph', 'ফ'],
  ['ck', 'ক'],
  ['gh', 'গ'],
  ['wh', 'ওয়'],
];

const SINGLE_CONSONANTS: Record<string, string> = {
  b: 'ব', d: 'ড', f: 'ফ', h: 'হ', j: 'জ', k: 'ক', l: 'ল', m: 'ম', n: 'ন', p: 'প',
  q: 'ক', r: 'র', s: 'স', t: 'ট', v: 'ভ', z: 'জ', x: 'ক্স',
};

const isVowelLetter = (ch: string | undefined) => !!ch && 'aeiou'.includes(ch);
const isConsonantLetter = (ch: string | undefined) =>
  !!ch && /[a-z]/.test(ch) && !isVowelLetter(ch);

/** A vowel is "closed" when followed by two consonants or one consonant at the end. */
function isClosed(word: string, vowelEnd: number): boolean {
  const next = word[vowelEnd];
  const after = word[vowelEnd + 1];
  if (!isConsonantLetter(next) || next === 'y' || next === 'w') {
    return false;
  }
  return after === undefined || (isConsonantLetter(after) && after !== 'y');
}

function hasMagicE(word: string, vowelIndex: number): boolean {
  // vowel + single consonant + final e: name, line, phone, use
  return (
    word.length >= 4 &&
    vowelIndex === word.length - 3 &&
    isConsonantLetter(word[word.length - 2]) &&
    word[word.length - 1] === 'e'
  );
}

function ruleTransliterate(input: string): string {
  const word = input.toLowerCase();
  let out = '';
  let prevConsonant = false;
  let i = 0;

  const emitConsonant = (text: string) => {
    if (prevConsonant) {
      out += HASANTA;
    }
    out += text;
    prevConsonant = true;
  };
  const emitVowel = (vowel: VowelOut) => {
    out += prevConsonant ? vowel.sign : vowel.independent;
    prevConsonant = false;
  };

  while (i < word.length) {
    const rest = word.slice(i);
    const ch = word[i];

    // Silent letters
    if (i === 0 && (rest.startsWith('kn') || rest.startsWith('wr'))) {
      i += 1;
      continue;
    }
    if (rest === 'mb') {
      emitConsonant('ম');
      break;
    }
    // Final silent e (simple, love, phone)
    if (rest === 'e' && word.length > 2 && isConsonantLetter(word[i - 1])) {
      break;
    }
    if (rest.startsWith('tion') || rest.startsWith('sion')) {
      emitConsonant('শ');
      emitConsonantRaw('ন');
      i += 4;
      continue;
    }
    if (rest.startsWith('ture')) {
      emitConsonant('চ');
      out += 'ার';
      prevConsonant = true;
      i += 4;
      continue;
    }
    // r-coloured vowels: server → সার্ভার, start → স্টার্ট, order → অর্ডার
    if (/^(er|ir|ur|ar)([^aeiouy]|$)/.test(rest)) {
      emitVowel(v('আ', 'া'));
      emitConsonantRaw('র');
      i += 2;
      continue;
    }
    if (/^or([^aeiouy]|$)/.test(rest)) {
      emitVowel(v('অ', ''));
      emitConsonantRaw('র');
      i += 2;
      continue;
    }

    const vowelDigraph = VOWEL_DIGRAPHS.find(([pattern]) => rest.startsWith(pattern));
    if (vowelDigraph) {
      emitVowel(vowelDigraph[1]);
      i += vowelDigraph[0].length;
      continue;
    }

    if (isVowelLetter(ch)) {
      const magic = hasMagicE(word, i);
      const closed = isClosed(word, i + 1);
      let vowel: VowelOut;
      switch (ch) {
        case 'a':
          // station → স্টেশন, occasion → অকেশন
          vowel = /^(tion|sion)/.test(word.slice(i + 1))
            ? v('এ', 'ে')
            : magic
            ? v('এই', 'েই')
            : closed
              ? v('অ্যা', '্যা')
              : v('আ', 'া');
          break;
        case 'e':
          vowel = v('এ', 'ে');
          break;
        case 'i':
          vowel = magic ? v('আই', 'াই') : v('ই', 'ি');
          break;
        case 'o':
          vowel = magic ? v('ও', 'ো') : closed ? v('অ', '') : v('ও', 'ো');
          break;
        default: // u
          vowel = magic ? v('ইউ', 'িউ') : closed ? v('আ', 'া') : v('উ', 'ু');
      }
      // '্যা' after a consonant is a ya-phala + aa, which already carries the vowel.
      emitVowel(vowel);
      i += 1;
      continue;
    }

    if (ch === 'y') {
      const isLast = i === word.length - 1;
      if (isLast && prevConsonant) {
        emitVowel(word.length <= 3 || !/[aeiou]/.test(word.slice(0, i)) ? v('আই', 'াই') : v('ই', 'ি'));
      } else if (isVowelLetter(word[i + 1])) {
        out += prevConsonant ? '্য' : 'ইয়';
        prevConsonant = true;
      } else {
        emitVowel(v('ই', 'ি'));
      }
      i += 1;
      continue;
    }

    if (ch === 'w') {
      if (prevConsonant) {
        out += '্ব';
      } else {
        out += 'ওয়';
        prevConsonant = true;
      }
      i += 1;
      continue;
    }

    if (rest.startsWith('qu')) {
      emitConsonant('কোয়');
      i += 2;
      continue;
    }

    if (rest.startsWith('ng')) {
      if (isVowelLetter(word[i + 2])) {
        emitConsonant('ঙ্গ');
      } else {
        out += 'ং';
        prevConsonant = false;
      }
      i += 2;
      continue;
    }
    if (rest.startsWith('nk')) {
      emitConsonant('ঙ');
      emitConsonant('ক');
      i += 2;
      continue;
    }

    const digraph = CONSONANT_DIGRAPHS.find(([pattern]) => rest.startsWith(pattern));
    if (digraph) {
      emitConsonant(digraph[1]);
      i += digraph[0].length;
      continue;
    }

    if (ch === 'c') {
      emitConsonant('eiy'.includes(word[i + 1] ?? '') ? 'স' : 'ক');
      i += word[i + 1] === 'c' ? 2 : 1;
      continue;
    }
    if (ch === 'g') {
      const soft = 'eiy'.includes(word[i + 1] ?? '') && i + 2 < word.length;
      emitConsonant(soft || (word[i + 1] === 'e' && i + 2 === word.length) ? 'জ' : 'গ');
      i += word[i + 1] === 'g' ? 2 : 1;
      continue;
    }

    const single = SINGLE_CONSONANTS[ch];
    if (single) {
      emitConsonant(i === 0 && ch === 'x' ? 'জ' : single);
      // Collapse doubled consonants: app, all, class
      i += word[i + 1] === ch ? 2 : 1;
      continue;
    }

    out += ch;
    prevConsonant = false;
    i += 1;
  }
  return out;

  function emitConsonantRaw(text: string) {
    out += text;
    prevConsonant = true;
  }
}

export function spellLettersBengali(text: string): string {
  return [...text.toUpperCase()]
    .map(ch => LETTER_NAMES_BN[ch] ?? ch)
    .filter(Boolean)
    .join(' ');
}

/** One English word → Bengali-script pronunciation. */
export function englishWordToBengali(word: string): string {
  const entry = lookupLexicon(word);
  if (entry) {
    return entry.bn;
  }
  const isAcronym = word.length >= 2 && word === word.toUpperCase() && /^[A-Z]+$/.test(word);
  if (isAcronym || word.length === 1) {
    return spellLettersBengali(word);
  }
  return ruleTransliterate(word);
}

const isSingleCapital = (word: string | undefined) => !!word && /^[A-Z]$/.test(word);

/**
 * Converts every Latin word in `text`; everything else passes through.
 * Runs of single capitals ("A P I", "J S") are letter names, so "A" there
 * is "এ", while a lone "A" at the start of a sentence is the article.
 */
export function englishTextToBengali(text: string): string {
  const parts = splitLatinWords(text);
  const words = parts.filter(p => p.isWord).map(p => p.text);
  let wordIndex = -1;
  return parts
    .map(part => {
      if (!part.isWord) {
        return part.text;
      }
      wordIndex++;
      const inLetterRun =
        isSingleCapital(part.text) &&
        (isSingleCapital(words[wordIndex - 1]) || isSingleCapital(words[wordIndex + 1]));
      return inLetterRun ? spellLettersBengali(part.text) : englishWordToBengali(part.text);
    })
    .join('');
}
