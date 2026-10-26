const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: Array<[number, string]> = [
  [1_000_000_000_000, 'trillion'],
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1000, 'thousand'],
];

const ORDINAL_IRREGULAR: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

export const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function below100(n: number): string {
  if (n < 20) {
    return ONES[n];
  }
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) {
    return below100(rest);
  }
  return rest === 0
    ? `${ONES[hundreds]} hundred`
    : `${ONES[hundreds]} hundred ${below100(rest)}`;
}

export function englishInteger(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Cannot read ${value}`);
  }
  let n = Math.floor(value);
  if (n < 1000) {
    return below1000(n);
  }
  const parts: string[] = [];
  for (const [size, name] of SCALES) {
    if (n >= size) {
      parts.push(`${englishInteger(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) {
    parts.push(below1000(n));
  }
  return parts.join(' ');
}

export function englishOrdinal(value: number): string {
  const words = englishInteger(value);
  const match = /([a-z]+)$/.exec(words);
  if (!match) {
    return words;
  }
  const last = match[1];
  let ordinal: string;
  if (ORDINAL_IRREGULAR[last]) {
    ordinal = ORDINAL_IRREGULAR[last];
  } else if (last.endsWith('y')) {
    ordinal = `${last.slice(0, -1)}ieth`;
  } else {
    ordinal = `${last}th`;
  }
  return words.slice(0, words.length - last.length) + ordinal;
}

export function englishDigits(digits: string): string {
  return [...digits]
    .filter(ch => /\d/.test(ch))
    .map(ch => ONES[Number(ch)])
    .join(' ');
}

export function englishDecimal(integerPart: string, fractionPart: string): string {
  const whole = englishInteger(Number(integerPart));
  return fractionPart ? `${whole} point ${englishDigits(fractionPart)}` : whole;
}

/** 2026 → "twenty twenty-six", 2005 → "two thousand five", 1900 → "nineteen hundred". */
export function englishYear(year: number): string {
  if (year >= 2000 && year < 2010) {
    return englishInteger(year);
  }
  if (year >= 1100 && year < 10000) {
    const head = Math.floor(year / 100);
    const tail = year % 100;
    if (tail === 0) {
      return `${below100(head)} hundred`;
    }
    return tail < 10
      ? `${below100(head)} oh ${ONES[tail]}`
      : `${below100(head)} ${below100(tail)}`;
  }
  return englishInteger(year);
}

export function englishTime(hour: number, minute: number, meridiem?: 'am' | 'pm'): string {
  const hourWord = englishInteger(hour);
  let minuteWord = '';
  if (minute === 0) {
    minuteWord = meridiem ? '' : " o'clock";
  } else if (minute < 10) {
    minuteWord = ` oh ${ONES[minute]}`;
  } else {
    minuteWord = ` ${below100(minute)}`;
  }
  const suffix = meridiem ? ` ${meridiem === 'am' ? 'A M' : 'P M'}` : '';
  return `${hourWord}${minuteWord}${suffix}`;
}
