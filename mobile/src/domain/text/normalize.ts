/**
 * Text normalization: turns numbers, money, dates, times, units, URLs,
 * acronyms… into words. Produces a *synthesis representation* — the user's
 * original text is never modified.
 *
 * Patterns that can span scripts ("আমি 10:30 AM এ আসবো") are expanded before
 * language segmentation, using the language of the surrounding words.
 */

import {
  BN_MONTHS,
  bengaliDecimal,
  bengaliDigits,
  bengaliInteger,
  bengaliTime,
  bengaliYear,
} from './numbers/bengali';
import {
  EN_MONTHS,
  englishDecimal,
  englishDigits,
  englishInteger,
  englishOrdinal,
  englishTime,
  englishYear,
} from './numbers/english';
import { contextLanguage, isBengaliDigit, isWordChar, toAsciiDigits } from './script';
import { lookupLexicon, SPELLED_SUFFIXES } from './lexicon';

type Lang = 'bn' | 'en';

const D = '[0-9\\u09E6-\\u09EF]';
// Amount with optional thousands (1,250 / 1,00,000) and decimals
const AMOUNT = `${D}{1,3}(?:,${D}{2,3})+(?:\\.${D}+)?|${D}+(?:\\.${D}+)?`;

const WORDS = {
  bn: {
    dot: 'ডট', slash: 'স্ল্যাশ', at: 'অ্যাট', dash: 'ড্যাশ', percent: 'শতাংশ', plus: 'প্লাস',
    minus: 'মাইনাস', and: 'এবং', equals: 'সমান', hash: 'হ্যাশট্যাগ', degree: 'ডিগ্রি',
    colon: 'কোলন', underscore: 'আন্ডারস্কোর',
  },
  en: {
    dot: 'dot', slash: 'slash', at: 'at', dash: 'dash', percent: 'percent', plus: 'plus',
    minus: 'minus', and: 'and', equals: 'equals', hash: 'hashtag', degree: 'degrees',
    colon: 'colon', underscore: 'underscore',
  },
} as const;

const CURRENCIES: Record<string, { bn: [string, string]; en: [string, string, string, string] }> = {
  // [major, minor] / [major singular, major plural, minor singular, minor plural]
  BDT: { bn: ['টাকা', 'পয়সা'], en: ['taka', 'taka', 'poisha', 'poisha'] },
  USD: { bn: ['ডলার', 'সেন্ট'], en: ['dollar', 'dollars', 'cent', 'cents'] },
  EUR: { bn: ['ইউরো', 'সেন্ট'], en: ['euro', 'euros', 'cent', 'cents'] },
  GBP: { bn: ['পাউন্ড', 'পেন্স'], en: ['pound', 'pounds', 'penny', 'pence'] },
  INR: { bn: ['রুপি', 'পয়সা'], en: ['rupee', 'rupees', 'paisa', 'paise'] },
};

const CURRENCY_PREFIX: Record<string, string> = {
  '৳': 'BDT', tk: 'BDT', 'tk.': 'BDT', bdt: 'BDT', $: 'USD', usd: 'USD', '€': 'EUR',
  eur: 'EUR', '£': 'GBP', gbp: 'GBP', '₹': 'INR', inr: 'INR', rs: 'INR', 'rs.': 'INR',
};

const UNITS: Record<string, { bn: string; en: [string, string] }> = {
  km: { bn: 'কিলোমিটার', en: ['kilometer', 'kilometers'] },
  cm: { bn: 'সেন্টিমিটার', en: ['centimeter', 'centimeters'] },
  mm: { bn: 'মিলিমিটার', en: ['millimeter', 'millimeters'] },
  kg: { bn: 'কেজি', en: ['kilogram', 'kilograms'] },
  mg: { bn: 'মিলিগ্রাম', en: ['milligram', 'milligrams'] },
  ml: { bn: 'মিলিলিটার', en: ['milliliter', 'milliliters'] },
  kb: { bn: 'কেবি', en: ['kilobyte', 'kilobytes'] },
  mb: { bn: 'এমবি', en: ['megabyte', 'megabytes'] },
  gb: { bn: 'জিবি', en: ['gigabyte', 'gigabytes'] },
  tb: { bn: 'টিবি', en: ['terabyte', 'terabytes'] },
  ghz: { bn: 'গিগাহার্টজ', en: ['gigahertz', 'gigahertz'] },
  mhz: { bn: 'মেগাহার্টজ', en: ['megahertz', 'megahertz'] },
  hz: { bn: 'হার্টজ', en: ['hertz', 'hertz'] },
  mah: { bn: 'মিলিঅ্যাম্পিয়ার আওয়ার', en: ['milliamp hour', 'milliamp hours'] },
  kw: { bn: 'কিলোওয়াট', en: ['kilowatt', 'kilowatts'] },
  '°c': { bn: 'ডিগ্রি সেলসিয়াস', en: ['degree Celsius', 'degrees Celsius'] },
  '°f': { bn: 'ডিগ্রি ফারেনহাইট', en: ['degree Fahrenheit', 'degrees Fahrenheit'] },
};

/** NFC where available; Bengali য়/ড়/ঢ় normalize to their decomposed forms. */
export function nfc(text: string): string {
  return typeof text.normalize === 'function' ? text.normalize('NFC') : text;
}

const BN_ORDINALS: Record<string, string> = Object.fromEntries(
  Object.entries({
    '1ম': 'প্রথম', '2য়': 'দ্বিতীয়', '3য়': 'তৃতীয়', '4র্থ': 'চতুর্থ', '5ম': 'পঞ্চম',
    '6ষ্ঠ': 'ষষ্ঠ', '7ম': 'সপ্তম', '8ম': 'অষ্টম', '9ম': 'নবম', '10ম': 'দশম',
  }).map(([k, val]) => [nfc(k), val]),
);

const EN_ABBREVIATIONS: Record<string, string> = {
  'mr.': 'Mister', 'mrs.': 'Missus', 'ms.': 'Miss', 'dr.': 'Doctor', 'prof.': 'Professor',
  'st.': 'Saint', 'vs.': 'versus', 'etc.': 'et cetera', 'e.g.': 'for example', 'i.e.': 'that is',
  'approx.': 'approximately', 'no.': 'number', 'jan.': 'January', 'feb.': 'February',
  'aug.': 'August', 'sept.': 'September', 'oct.': 'October', 'nov.': 'November', 'dec.': 'December',
};

const BN_ABBREVIATIONS: Array<[string, string]> = [
  ['মোসাঃ', 'মোসাম্মত'], ['মোসা.', 'মোসাম্মত'], ['মোঃ', 'মোহাম্মদ'], ['মো.', 'মোহাম্মদ'],
  ['ডাঃ', 'ডাক্তার'], ['ডা.', 'ডাক্তার'], ['ড.', 'ডক্টর'], ['কি.মি.', 'কিলোমিটার'],
  ['সে.মি.', 'সেন্টিমিটার'], ['খ্রি.', 'খ্রিস্টাব্দ'], ['খ্রিঃ', 'খ্রিস্টাব্দ'],
];

const ascii = (s: string) => toAsciiDigits(s).replace(/,/g, '');

function hasBengaliDigit(s: string): boolean {
  return [...s].some(isBengaliDigit);
}

function langFor(text: string, offset: number, match: string, fallback: Lang): Lang {
  return hasBengaliDigit(match) ? 'bn' : contextLanguage(text, offset, offset + match.length, fallback);
}

export function readNumber(raw: string, lang: Lang): string {
  const value = ascii(raw);
  const [intPart, fracPart = ''] = value.split('.');
  // Long digit strings and leading zeros are identifiers: read digit by digit.
  if (intPart.length > 12 || (intPart.length > 1 && intPart.startsWith('0'))) {
    return lang === 'bn' ? bengaliDigits(value) : englishDigits(value);
  }
  return lang === 'bn' ? bengaliDecimal(intPart, fracPart) : englishDecimal(intPart, fracPart);
}

function readMoney(amount: string, code: string, lang: Lang): string {
  const currency = CURRENCIES[code];
  const value = ascii(amount);
  const [intPart, fracPart = ''] = value.split('.');
  // Beyond ~15 digits a JS number is no longer exact: read the amount digit by digit, like readNumber.
  if (intPart.length > 12) {
    const unit = lang === 'bn' ? currency.bn[0] : currency.en[1];
    return `${lang === 'bn' ? bengaliDigits(intPart) : englishDigits(intPart)} ${unit}`;
  }
  const major = Number(intPart);
  const minor = fracPart ? Number(fracPart.padEnd(2, '0').slice(0, 2)) : 0;
  if (lang === 'bn') {
    const head = `${bengaliInteger(major)} ${currency.bn[0]}`;
    return minor > 0 ? `${head} ${bengaliInteger(minor)} ${currency.bn[1]}` : head;
  }
  const [one, many, minorOne, minorMany] = currency.en;
  const head = `${englishInteger(major)} ${major === 1 ? one : many}`;
  return minor > 0
    ? `${head} and ${englishInteger(minor)} ${minor === 1 ? minorOne : minorMany}`
    : head;
}

function readDate(day: number, month: number, year: number, lang: Lang): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  if (lang === 'bn') {
    return `${bengaliInteger(day)} ${BN_MONTHS[month - 1]} ${bengaliYear(year)}`;
  }
  return `${EN_MONTHS[month - 1]} ${englishOrdinal(day)}, ${englishYear(year)}`;
}

/** "js" → "J S". Bengali voices later map each letter to its Bengali name. */
function spellLetters(text: string): string {
  return [...text.toUpperCase()].join(' ');
}

type Replacer = (match: string, groups: string[], offset: number, whole: string) => string | null;

function replaceAll(text: string, pattern: RegExp, replacer: Replacer): string {
  return text.replace(pattern, (...args: unknown[]) => {
    const match = args[0] as string;
    // String.replace passes (match, ...groups, offset, whole)
    const offset = args[args.length - 2] as number;
    const whole = args[args.length - 1] as string;
    const groups = args.slice(1, -2).map(g => (g === undefined ? '' : String(g)));
    const replaced = replacer(match, groups, offset, whole);
    return replaced === null ? match : ` ${replaced} `;
  });
}

/**
 * Expands patterns whose reading depends on context language, before
 * segmentation. `fallback` is the dominant language of the document.
 */
export function expandSemiotics(input: string, fallback: Lang): string {
  let text = input;

  // Emails
  text = replaceAll(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, (m, _g, off, whole) => {
    const lang = langFor(whole, off, m, fallback);
    const w = WORDS[lang];
    const [user, domain] = m.split('@');
    return `${spellSymbols(user, lang)} ${w.at} ${domain.split('.').join(` ${w.dot} `)}`;
  });

  // URLs
  text = replaceAll(text, /\b(?:https?:\/\/|www\.)[^\s]+[^\s.,!?;:)\]।]/gi, (m, _g, off, whole) => {
    const lang = langFor(whole, off, m, fallback);
    const w = WORDS[lang];
    const stripped = m.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return stripped
      .split('/')
      .map(part => part.split('.').map(p => spellSymbols(p, lang)).join(` ${w.dot} `))
      .join(` ${w.slash} `)
      .replace(/^www /i, lang === 'bn' ? 'ডাব্লিউ ডাব্লিউ ডাব্লিউ ' : 'W W W ');
  });

  // ISO dates 2026-10-26
  text = replaceAll(text, new RegExp(`(${D}{4})-(${D}{1,2})-(${D}{1,2})`, 'g'), (m, g, off, whole) =>
    readDate(Number(ascii(g[2])), Number(ascii(g[1])), Number(ascii(g[0])), langFor(whole, off, m, fallback)),
  );
  // Day-first dates 26/10/2026, 26-10-2026, 26.10.2026 (Bangladesh convention)
  text = replaceAll(
    text,
    new RegExp(`(${D}{1,2})[/.-](${D}{1,2})[/.-](${D}{4})`, 'g'),
    (m, g, off, whole) =>
      readDate(Number(ascii(g[0])), Number(ascii(g[1])), Number(ascii(g[2])), langFor(whole, off, m, fallback)),
  );

  // Times 10:30, 10:30 AM, 7:05pm
  text = replaceAll(
    text,
    new RegExp(`(${D}{1,2}):(${D}{2})(?:\\s?([AaPp])\\.?\\s?[Mm]\\.?(?![A-Za-z]))?`, 'g'),
    (m, g, off, whole) => {
      const hour = Number(ascii(g[0]));
      const minute = Number(ascii(g[1]));
      if (hour > 23 || minute > 59) {
        return null;
      }
      const meridiem = g[2] ? (g[2].toLowerCase() === 'a' ? 'am' : 'pm') : undefined;
      const lang = langFor(whole, off, m, fallback);
      return lang === 'bn' ? bengaliTime(hour, minute, meridiem) : englishTime(hour, minute, meridiem);
    },
  );

  // Money with prefix: ৳1,250  $50.25  Tk. 500  BDT 500
  text = replaceAll(
    text,
    new RegExp(`(৳|\\$|€|£|₹|\\b(?:Tk\\.?|BDT|USD|EUR|GBP|INR|Rs\\.?))\\s?(${AMOUNT})`, 'gi'),
    (m, g, off, whole) => {
      const code = CURRENCY_PREFIX[g[0].toLowerCase()];
      return code ? readMoney(g[1], code, langFor(whole, off, m, fallback)) : null;
    },
  );
  // Money with suffix code: 500 BDT, 20 USD, 50$
  text = replaceAll(
    text,
    new RegExp(`(${AMOUNT})\\s?(৳|\\$|\\b(?:BDT|USD|EUR|GBP|INR)\\b)`, 'gi'),
    (m, g, off, whole) => {
      const code = CURRENCY_PREFIX[g[1].toLowerCase()];
      return code ? readMoney(g[0], code, langFor(whole, off, m, fallback)) : null;
    },
  );

  // Percent
  text = replaceAll(text, new RegExp(`(${AMOUNT})\\s?%`, 'g'), (m, g, off, whole) => {
    const lang = langFor(whole, off, m, fallback);
    return `${readNumber(g[0], lang)} ${WORDS[lang].percent}`;
  });

  // Bangladeshi phone numbers: 01712-345678, +880 1712 345678
  text = replaceAll(
    text,
    new RegExp(`(\\+?৮৮০|\\+?880)?[\\s-]?(০১|01)(${D}{3})[\\s-]?(${D}{6})(?!${D})`, 'g'),
    (m, g, off, whole) => {
      const lang = langFor(whole, off, m, fallback);
      const read = lang === 'bn' ? bengaliDigits : englishDigits;
      const prefix = g[0] ? `${WORDS[lang].plus} ${read(ascii(g[0]))}, ` : '';
      return `${prefix}${read(ascii(g[1] + g[2]))}, ${read(ascii(g[3]))}`;
    },
  );

  // Units: 5 km, 10GB, 25°C
  text = replaceAll(
    text,
    new RegExp(`(${AMOUNT})\\s?(km|cm|mm|kg|mg|ml|kb|mb|gb|tb|ghz|mhz|hz|mah|kw|°c|°f)(?![A-Za-z])`, 'gi'),
    (m, g, off, whole) => {
      const unit = UNITS[g[1].toLowerCase()];
      const lang = langFor(whole, off, m, fallback);
      const number = readNumber(g[0], lang);
      if (lang === 'bn') {
        return `${number} ${unit.bn}`;
      }
      return `${number} ${ascii(g[0]) === '1' ? unit.en[0] : unit.en[1]}`;
    },
  );

  // Bengali ordinals: ১ম, ২য়, ৪র্থ (য় may be precomposed or decomposed)
  text = replaceAll(text, new RegExp(`(${D}{1,2})(ম|\\u09DF|\\u09AF\\u09BC|র্থ|ষ্ঠ)`, 'g'), (_m, g) => {
    const suffix = g[1] === 'য়' ? 'য়' : g[1];
    return BN_ORDINALS[nfc(ascii(g[0]) + suffix)] ?? null;
  });
  // English ordinals: 1st, 22nd, 103rd, 4th
  text = replaceAll(text, /\b(\d+)(st|nd|rd|th)\b/gi, (_m, g) => englishOrdinal(Number(g[0])));

  // Negative numbers: -5 at start or after whitespace
  text = replaceAll(text, new RegExp(`(^|\\s)-(${AMOUNT})`, 'g'), (m, g, off, whole) => {
    const lang = langFor(whole, off, m, fallback);
    return `${g[0]}${WORDS[lang].minus} ${readNumber(g[1], lang)}`;
  });

  // Remaining plain numbers
  text = replaceAll(text, new RegExp(`${AMOUNT}`, 'g'), (m, _g, off, whole) =>
    readNumber(m, langFor(whole, off, m, fallback)),
  );

  // Symbols between words
  text = replaceAll(text, /\s([&+=@#])\s/g, (m, g, off, whole) => {
    const lang = langFor(whole, off, m, fallback);
    const w = WORDS[lang];
    const map: Record<string, string> = { '&': w.and, '+': w.plus, '=': w.equals, '@': w.at, '#': w.hash };
    return map[g[0]];
  });

  return collapseSpaces(text);
}

function spellSymbols(part: string, lang: Lang): string {
  const w = WORDS[lang];
  return part
    .replace(/_/g, ` ${w.underscore} `)
    .replace(/-/g, ` ${w.dash} `)
    .replace(/\./g, ` ${w.dot} `)
    .trim();
}

export function collapseSpaces(text: string): string {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/ +([,।!?.;:])/g, '$1');
}

/** Normalizes an English segment: abbreviations, dotted names, acronyms, CamelCase. */
export function normalizeEnglishSegment(text: string): string {
  let out = text.replace(/\b(?:[A-Za-z]{1,6}\.){1,2}(?=\s|$)/g, m => EN_ABBREVIATIONS[m.toLowerCase()] ?? m);

  // React.js → React dot J S, Node.js, Next.js
  out = out.replace(/\b([A-Za-z][A-Za-z0-9]*)((?:\.[A-Za-z0-9]+)+)\b/g, (m, head: string, tail: string) => {
    const parts = tail.split('.').filter(Boolean);
    const spoken = parts.map(p => (SPELLED_SUFFIXES.has(p.toLowerCase()) ? spellLetters(p) : p));
    return [head, ...spoken].join(' dot ');
  });

  // An ALL-CAPS sentence is shouting, not a row of acronyms.
  const latinWords = out.match(/[A-Za-z]{2,}/g) ?? [];
  const shouting = latinWords.length >= 3 && latinWords.every(w => w === w.toUpperCase());

  out = out.replace(/[A-Za-z][A-Za-z0-9']*/g, word => {
    const entry = lookupLexicon(word);
    if (entry?.en) {
      return entry.en;
    }
    if (entry) {
      return word;
    }
    // Acronyms: API → A P I, SQL → S Q L, MP3 handled as letters + number words already
    if (!shouting && word.length >= 2 && word.length <= 6 && /^[A-Z]+s?$/.test(word)) {
      const plural = word.endsWith('s') && word.length > 2;
      const letters = plural ? word.slice(0, -1) : word;
      return spellLetters(letters) + (plural ? 's' : '');
    }
    // CamelCase: TanStack → Tan Stack
    if (/^[A-Z]?[a-z]+(?:[A-Z][a-z]+)+$/.test(word)) {
      return word.replace(/([a-z])([A-Z])/g, '$1 $2');
    }
    return word;
  });
  return out;
}

/** Normalizes a Bengali segment: common Bangladeshi abbreviations. */
export function normalizeBengaliSegment(text: string): string {
  let out = text;
  for (const [rawAbbr, full] of BN_ABBREVIATIONS) {
    const abbr = nfc(rawAbbr);
    let from = 0;
    let index = out.indexOf(abbr, from);
    while (index !== -1) {
      if (!isWordChar(out[index - 1])) {
        out = `${out.slice(0, index)}${full} ${out.slice(index + abbr.length)}`;
        from = index + full.length + 1;
      } else {
        from = index + abbr.length;
      }
      index = out.indexOf(abbr, from);
    }
  }
  return collapseSpaces(out);
}
