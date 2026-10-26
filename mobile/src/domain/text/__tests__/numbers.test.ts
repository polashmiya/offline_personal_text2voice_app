import {
  bengaliInteger,
  bengaliTime,
  bengaliYear,
  bengaliDecimal,
} from '../numbers/bengali';
import {
  englishInteger,
  englishOrdinal,
  englishTime,
  englishYear,
} from '../numbers/english';

describe('Bengali numbers', () => {
  it.each([
    [0, 'শূন্য'],
    [7, 'সাত'],
    [25, 'পঁচিশ'],
    [99, 'নিরানব্বই'],
    [100, 'একশো'],
    [250, 'দুইশো পঞ্চাশ'],
    [1250, 'এক হাজার দুইশো পঞ্চাশ'],
    [100000, 'এক লাখ'],
    [2550000, 'পঁচিশ লাখ পঞ্চাশ হাজার'],
    [10000000, 'এক কোটি'],
    [1234567890, 'একশো তেইশ কোটি পঁয়তাল্লিশ লাখ সাতষট্টি হাজার আটশো নব্বই'],
  ])('%d → %s', (n, words) => {
    expect(bengaliInteger(n)).toBe(words);
  });

  it('reads decimals digit by digit after দশমিক', () => {
    expect(bengaliDecimal('3', '14')).toBe('তিন দশমিক এক চার');
  });

  it('reads years the Bangladeshi way', () => {
    expect(bengaliYear(1971)).toBe('উনিশশো একাত্তর');
    expect(bengaliYear(2026)).toBe('দুই হাজার ছাব্বিশ');
  });

  it('reads times with period of day', () => {
    expect(bengaliTime(10, 30, 'am')).toBe('সকাল দশটা ত্রিশ মিনিট');
    expect(bengaliTime(3, 0, 'pm')).toBe('বিকাল তিনটা');
    expect(bengaliTime(21, 15)).toBe('রাত নয়টা পনেরো মিনিট');
  });

  it('rejects negative numbers', () => {
    expect(() => bengaliInteger(-1)).toThrow(RangeError);
  });
});

describe('English numbers', () => {
  it.each([
    [0, 'zero'],
    [21, 'twenty-one'],
    [105, 'one hundred five'],
    [1250, 'one thousand two hundred fifty'],
    [2_000_000, 'two million'],
  ])('%d → %s', (n, words) => {
    expect(englishInteger(n)).toBe(words);
  });

  it('builds ordinals', () => {
    expect(englishOrdinal(1)).toBe('first');
    expect(englishOrdinal(26)).toBe('twenty-sixth');
    expect(englishOrdinal(40)).toBe('fortieth');
    expect(englishOrdinal(112)).toBe('one hundred twelfth');
  });

  it('reads years and times', () => {
    expect(englishYear(2026)).toBe('twenty twenty-six');
    expect(englishYear(2005)).toBe('two thousand five');
    expect(englishYear(1905)).toBe('nineteen oh five');
    expect(englishTime(10, 30, 'am')).toBe('ten thirty A M');
    expect(englishTime(7, 5)).toBe('seven oh five');
    expect(englishTime(9, 0)).toBe("nine o'clock");
  });
});
