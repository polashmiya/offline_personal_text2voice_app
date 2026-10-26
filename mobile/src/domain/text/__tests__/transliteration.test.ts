import { convertBanglish, looksLikeBanglish, romanWordToBengali } from '../banglish';
import { englishTextToBengali, englishWordToBengali } from '../englishToBengali';
import { nfc } from '../normalize';

describe('Roman Banglish → Bengali', () => {
  it('uses the dictionary for common words', () => {
    expect(convertBanglish('ami bhalo achi')).toBe('আমি ভালো আছি');
    expect(convertBanglish('tumi kemon acho?')).toBe('তুমি কেমন আছো?');
  });

  it('keeps known English words and acronyms', () => {
    expect(convertBanglish('ami React shikhchi, API ta valo')).toBe(
      'আমি React শিখছি, API তা ভালো',
    );
  });

  it('applies phonetic rules to unknown words', () => {
    expect(romanWordToBengali('kotha')).toBe('কথা');
    expect(romanWordToBengali('rong')).toBe('রং');
    expect(romanWordToBengali('bristi')).toBe('ব্রিস্তি');
  });

  it('detects Banglish only with clear evidence', () => {
    expect(looksLikeBanglish('ami tomake valobasi')).toBe(true);
    expect(looksLikeBanglish('ajke amra kaj korbo')).toBe(true);
    expect(looksLikeBanglish('I love this new app')).toBe(false);
    expect(looksLikeBanglish('The meeting is at nine')).toBe(false);
  });
});

describe('English → Bengali-script pronunciation', () => {
  it('uses the lexicon', () => {
    expect(englishWordToBengali('React')).toBe('রিয়্যাক্ট');
    expect(englishWordToBengali('offline')).toBe('অফলাইন');
  });

  it('spells acronyms with Bengali letter names', () => {
    expect(englishWordToBengali('API')).toBe('এ পি আই');
    expect(englishTextToBengali('A P I')).toBe('এ পি আই');
  });

  it.each([
    ['server', 'সার্ভার'],
    ['bug', 'বাগ'],
    ['hot', 'হট'],
    ['cat', 'ক্যাট'],
    ['station', 'স্টেশন'],
    ['simple', 'সিম্পল'],
    ['number', 'নাম্বার'],
  ])('%s → %s', (word, expected) => {
    expect(nfc(englishWordToBengali(word))).toBe(nfc(expected));
  });
});
