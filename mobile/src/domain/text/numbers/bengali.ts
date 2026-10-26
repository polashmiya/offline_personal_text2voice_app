/**
 * Bengali (Bangladesh) number reading using the lakh/crore system.
 * 0–99 are irregular in Bengali, so they are listed explicitly.
 */

const BN_0_TO_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বাহান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

const BN_HOUR = [
  'বারোটা', 'একটা', 'দুইটা', 'তিনটা', 'চারটা', 'পাঁচটা', 'ছয়টা',
  'সাতটা', 'আটটা', 'নয়টা', 'দশটা', 'এগারোটা', 'বারোটা',
];

export const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

export const BN_DIGIT_WORDS = BN_0_TO_99.slice(0, 10);

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    parts.push(`${BN_0_TO_99[hundreds]}শো`);
  }
  if (rest > 0) {
    parts.push(BN_0_TO_99[rest]);
  }
  return parts.join(' ');
}

/** Reads a non-negative integer in Bengali words (lakh/crore grouping). */
export function bengaliInteger(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Cannot read ${value}`);
  }
  const n = Math.floor(value);
  if (n < 100) {
    return BN_0_TO_99[n];
  }
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;

  const parts: string[] = [];
  if (crore > 0) {
    parts.push(`${bengaliInteger(crore)} কোটি`);
  }
  if (lakh > 0) {
    parts.push(`${BN_0_TO_99[lakh]} লাখ`);
  }
  if (thousand > 0) {
    parts.push(`${BN_0_TO_99[thousand]} হাজার`);
  }
  if (rest > 0) {
    parts.push(below1000(rest));
  }
  return parts.join(' ');
}

/** Reads each digit separately: "০১৭" → "শূন্য এক সাত". */
export function bengaliDigits(digits: string): string {
  return [...digits]
    .filter(ch => /\d/.test(ch))
    .map(ch => BN_DIGIT_WORDS[Number(ch)])
    .join(' ');
}

/** "3.14" → "তিন দশমিক এক চার". */
export function bengaliDecimal(integerPart: string, fractionPart: string): string {
  const whole = bengaliInteger(Number(integerPart));
  if (!fractionPart) {
    return whole;
  }
  return `${whole} দশমিক ${bengaliDigits(fractionPart)}`;
}

/** Years read the way Bangladeshis say them: 1971 → "উনিশশো একাত্তর". */
export function bengaliYear(year: number): string {
  if (year >= 1100 && year < 2000) {
    const head = Math.floor(year / 100);
    const tail = year % 100;
    return tail === 0
      ? `${BN_0_TO_99[head]}শো`
      : `${BN_0_TO_99[head]}শো ${BN_0_TO_99[tail]}`;
  }
  return bengaliInteger(year);
}

export function bengaliTime(hour24: number, minute: number, meridiem?: 'am' | 'pm'): string {
  let h = hour24;
  if (meridiem === 'pm' && h < 12) {
    h += 12;
  }
  if (meridiem === 'am' && h === 12) {
    h = 0;
  }
  const period =
    h < 4 ? 'রাত' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  const hourWord = BN_HOUR[h % 12];
  const minuteWords = minute > 0 ? ` ${bengaliInteger(minute)} মিনিট` : '';
  return `${period} ${hourWord}${minuteWords}`;
}
