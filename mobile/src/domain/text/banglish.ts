/**
 * Roman-script Bengali ("Banglish": "ami bhalo achi") → Bengali script.
 *
 * Common words come from a curated dictionary for correct spelling; other
 * words go through Avro-style phonetic rules. Output is meant for speech, so
 * spelling only needs to produce the right pronunciation.
 */

import { lookupLexicon } from './lexicon';
import { isLatinLetter } from './script';

const WORDS: Record<string, string> = {
  ami: 'আমি', amra: 'আমরা', amar: 'আমার', amader: 'আমাদের', amake: 'আমাকে',
  tumi: 'তুমি', tomra: 'তোমরা', tomar: 'তোমার', tomader: 'তোমাদের', tomake: 'তোমাকে',
  apni: 'আপনি', apnar: 'আপনার', apnara: 'আপনারা', apnake: 'আপনাকে', apnader: 'আপনাদের',
  se: 'সে', tara: 'তারা', tar: 'তার', tader: 'তাদের', take: 'তাকে', ke: 'কে', ki: 'কি',
  keno: 'কেন', kothay: 'কোথায়', kobe: 'কবে', kemon: 'কেমন', kivabe: 'কিভাবে',
  kibhabe: 'কিভাবে', koto: 'কত', kon: 'কোন', kar: 'কার', ar: 'আর', o: 'ও', ebong: 'এবং',
  kintu: 'কিন্তু', tai: 'তাই', jodi: 'যদি', tahole: 'তাহলে', tobe: 'তবে', na: 'না',
  nai: 'নাই', nei: 'নেই', haa: 'হ্যাঁ', ha: 'হ্যাঁ', hya: 'হ্যাঁ', ji: 'জি', accha: 'আচ্ছা',
  achha: 'আচ্ছা', thik: 'ঠিক', ache: 'আছে', achi: 'আছি', acho: 'আছো', achen: 'আছেন',
  chilo: 'ছিল', chilam: 'ছিলাম', hobe: 'হবে', hoy: 'হয়', hoyeche: 'হয়েছে',
  hocche: 'হচ্ছে', kori: 'করি', koro: 'করো', koren: 'করেন', korbo: 'করবো', korbe: 'করবে',
  korchi: 'করছি', korchen: 'করছেন', korlam: 'করলাম', koreche: 'করেছে', kore: 'করে',
  korte: 'করতে', jabo: 'যাবো', jai: 'যাই', jao: 'যাও', jan: 'যান', jacchi: 'যাচ্ছি',
  gelam: 'গেলাম', geche: 'গেছে', asbo: 'আসবো', ashbo: 'আসবো', asho: 'আসো', aso: 'আসো',
  ashen: 'আসেন', eso: 'এসো', dekhbo: 'দেখবো', dekho: 'দেখো', dekhi: 'দেখি',
  bolbo: 'বলবো', bolo: 'বলো', bolen: 'বলেন', boli: 'বলি', bujhi: 'বুঝি',
  bujhte: 'বুঝতে', bujhlam: 'বুঝলাম', jani: 'জানি', jano: 'জানো', janen: 'জানেন',
  chai: 'চাই', chao: 'চাও', lagbe: 'লাগবে', lage: 'লাগে', valo: 'ভালো', bhalo: 'ভালো',
  valobasi: 'ভালোবাসি', bhalobashi: 'ভালোবাসি', bhalobasi: 'ভালোবাসি',
  bhalobasha: 'ভালোবাসা', valobasha: 'ভালোবাসা', kharap: 'খারাপ', sundor: 'সুন্দর',
  onek: 'অনেক', ektu: 'একটু', ekta: 'একটা', ekti: 'একটি', ek: 'এক', dui: 'দুই',
  tin: 'তিন', khub: 'খুব', besi: 'বেশি', beshi: 'বেশি', kom: 'কম', shob: 'সব', sob: 'সব',
  sobai: 'সবাই', shobai: 'সবাই', kaj: 'কাজ', kaaj: 'কাজ', din: 'দিন', rat: 'রাত',
  raat: 'রাত', aj: 'আজ', aaj: 'আজ', ajke: 'আজকে', aajke: 'আজকে', kal: 'কাল',
  kalke: 'কালকে', ekhon: 'এখন', akhon: 'এখন', tokhon: 'তখন', pore: 'পরে', age: 'আগে',
  sathe: 'সাথে', shathe: 'সাথে', songe: 'সঙ্গে', jonno: 'জন্য', jonyo: 'জন্য',
  theke: 'থেকে', dite: 'দিতে', diye: 'দিয়ে', niye: 'নিয়ে', nao: 'নাও', den: 'দেন',
  dao: 'দাও', dibo: 'দিবো', debo: 'দেবো', bhai: 'ভাই', vai: 'ভাই', apu: 'আপু', bon: 'বোন',
  ma: 'মা', baba: 'বাবা', bari: 'বাড়ি', basa: 'বাসা', basha: 'বাসা', ghor: 'ঘর',
  khabar: 'খাবার', khabo: 'খাবো', khai: 'খাই', kheyecho: 'খেয়েছো', pani: 'পানি',
  cha: 'চা', taka: 'টাকা', tk: 'টাকা', dhonnobad: 'ধন্যবাদ', dhonyobad: 'ধন্যবাদ',
  shuvo: 'শুভ', subho: 'শুভ', shubho: 'শুভ', sokal: 'সকাল', shokal: 'সকাল',
  bikal: 'বিকাল', bikel: 'বিকেল', shondha: 'সন্ধ্যা', sondha: 'সন্ধ্যা',
  bangla: 'বাংলা', bangladesh: 'বাংলাদেশ', dhaka: 'ঢাকা', manush: 'মানুষ',
  kotha: 'কথা', golpo: 'গল্প', notun: 'নতুন', puron: 'পুরান', purono: 'পুরনো',
  boro: 'বড়', choto: 'ছোট', shuru: 'শুরু', suru: 'শুরু', shesh: 'শেষ', sesh: 'শেষ',
  porjonto: 'পর্যন্ত', mone: 'মনে', hoyto: 'হয়তো', obossoi: 'অবশ্যই', abar: 'আবার',
  tobuo: 'তবুও', keu: 'কেউ', kichu: 'কিছু', kichui: 'কিছুই', ekhane: 'এখানে',
  okhane: 'ওখানে', sekhane: 'সেখানে', eta: 'এটা', ota: 'ওটা', oita: 'ওইটা', eita: 'এইটা',
  ei: 'এই', oi: 'ওই', shei: 'সেই', sei: 'সেই', toiri: 'তৈরি', tairi: 'তৈরি', shikhi: 'শিখি',
  shikhbo: 'শিখবো', shikhchi: 'শিখছি', porbo: 'পড়বো', pori: 'পড়ি', porchi: 'পড়ছি',
  likhbo: 'লিখবো', likhi: 'লিখি', bondhu: 'বন্ধু', bondhura: 'বন্ধুরা',
};

/**
 * Words that are clearly Roman Bengali and almost never English. Used by
 * auto-detection. Ambiguous words (to, take, age, den, pore, bon…) are excluded.
 */
const MARKERS = new Set([
  'ami', 'amra', 'amar', 'amader', 'tumi', 'tomar', 'apni', 'apnar', 'ki', 'keno',
  'kothay', 'kemon', 'kivabe', 'kibhabe', 'koto', 'ebong', 'kintu', 'jodi', 'tahole',
  'nai', 'nei', 'achi', 'ache', 'acho', 'achen', 'chilo', 'hobe', 'hoy', 'kori',
  'korbo', 'korchi', 'kore', 'jabo', 'jacchi', 'valo', 'bhalo', 'onek', 'ektu', 'ekta',
  'ekti', 'khub', 'beshi', 'besi', 'aj', 'ajke', 'aajke', 'kalke', 'ekhon', 'theke',
  'jonno', 'sathe', 'diye', 'niye', 'bhai', 'vai', 'dhonnobad', 'kichu', 'eta', 'ei',
  'toiri', 'shikhchi', 'valobasi', 'bhalobashi', 'tomake', 'amake', 'bolo', 'dekho',
]);

export function isBanglishMarker(word: string): boolean {
  return MARKERS.has(word.toLowerCase());
}

type Rule = { pattern: string; out: string };

// Order matters: longer patterns first.
const CONSONANTS: Rule[] = [
  { pattern: 'kkh', out: 'ক্ষ' }, { pattern: 'chh', out: 'ছ' }, { pattern: 'kh', out: 'খ' },
  { pattern: 'gh', out: 'ঘ' }, { pattern: 'ch', out: 'চ' }, { pattern: 'jh', out: 'ঝ' },
  { pattern: 'Th', out: 'ঠ' }, { pattern: 'Dh', out: 'ঢ' }, { pattern: 'Rh', out: 'ঢ়' },
  { pattern: 'Sh', out: 'ষ' }, { pattern: 'th', out: 'থ' }, { pattern: 'dh', out: 'ধ' },
  { pattern: 'ph', out: 'ফ' }, { pattern: 'bh', out: 'ভ' }, { pattern: 'sh', out: 'শ' },
  { pattern: 'k', out: 'ক' }, { pattern: 'g', out: 'গ' }, { pattern: 'c', out: 'চ' },
  { pattern: 'j', out: 'জ' }, { pattern: 'T', out: 'ট' }, { pattern: 'D', out: 'ড' },
  { pattern: 'N', out: 'ণ' }, { pattern: 't', out: 'ত' }, { pattern: 'd', out: 'দ' },
  { pattern: 'n', out: 'ন' }, { pattern: 'p', out: 'প' }, { pattern: 'f', out: 'ফ' },
  { pattern: 'b', out: 'ব' }, { pattern: 'v', out: 'ভ' }, { pattern: 'm', out: 'ম' },
  { pattern: 'z', out: 'য' }, { pattern: 'R', out: 'ড়' }, { pattern: 'r', out: 'র' },
  { pattern: 'l', out: 'ল' }, { pattern: 's', out: 'স' }, { pattern: 'h', out: 'হ' },
  { pattern: 'q', out: 'ক' }, { pattern: 'x', out: 'ক্স' },
];

// [independent form, dependent sign (kar)]
const VOWELS: Array<{ pattern: string; independent: string; sign: string }> = [
  { pattern: 'aa', independent: 'আ', sign: 'া' }, { pattern: 'oi', independent: 'ঐ', sign: 'ৈ' },
  { pattern: 'ou', independent: 'ঔ', sign: 'ৌ' }, { pattern: 'ee', independent: 'ঈ', sign: 'ী' },
  { pattern: 'oo', independent: 'ঊ', sign: 'ূ' }, { pattern: 'rri', independent: 'ঋ', sign: 'ৃ' },
  { pattern: 'a', independent: 'আ', sign: 'া' }, { pattern: 'i', independent: 'ই', sign: 'ি' },
  { pattern: 'I', independent: 'ঈ', sign: 'ী' }, { pattern: 'u', independent: 'উ', sign: 'ু' },
  { pattern: 'U', independent: 'ঊ', sign: 'ূ' }, { pattern: 'e', independent: 'এ', sign: 'ে' },
  { pattern: 'O', independent: 'ও', sign: 'ো' }, { pattern: 'o', independent: 'অ', sign: '' },
];

const HASANTA = '্';
const CASE_SENSITIVE = new Set(['T', 'D', 'N', 'R', 'I', 'U', 'O']);

function normalizeCase(word: string): string {
  // Keep Avro's meaningful capitals only when the word is not ALL CAPS.
  if (word === word.toUpperCase()) {
    return word.toLowerCase();
  }
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const two = word.slice(i, i + 2);
    if (two === 'Sh' || two === 'Th' || two === 'Dh' || two === 'Rh') {
      out += two;
      i++;
    } else {
      out += CASE_SENSITIVE.has(ch) && i > 0 ? ch : ch.toLowerCase();
    }
  }
  return out;
}

/** Phonetic rule-based conversion of one Roman Bengali word. */
export function romanWordToBengali(input: string): string {
  const word = normalizeCase(input);
  let out = '';
  let prevConsonant = false;
  let i = 0;
  while (i < word.length) {
    const rest = word.slice(i);

    // 'ng' → anusvara (ং): rong → রং
    if (rest.startsWith('ng') && (i + 2 === word.length || !isVowelStart(word.slice(i + 2)))) {
      out += 'ং';
      prevConsonant = false;
      i += 2;
      continue;
    }

    // y / w after a consonant become phala signs
    if (prevConsonant && (rest[0] === 'y' || rest[0] === 'w')) {
      out += rest[0] === 'y' ? '্য' : '্ব';
      i += 1;
      continue;
    }
    if (rest[0] === 'y' || rest[0] === 'w') {
      out += rest[0] === 'y' ? 'য়' : 'ও';
      prevConsonant = rest[0] === 'y';
      i += 1;
      continue;
    }

    const consonant = CONSONANTS.find(r => rest.startsWith(r.pattern));
    if (consonant) {
      if (prevConsonant) {
        out += HASANTA;
      }
      out += consonant.out;
      prevConsonant = true;
      i += consonant.pattern.length;
      continue;
    }

    const vowel = VOWELS.find(v => rest.startsWith(v.pattern));
    if (vowel) {
      if (prevConsonant) {
        // Word-final 'o' after a consonant is usually ো in casual Banglish (bhalo → ভালো).
        const isFinalO = vowel.pattern === 'o' && i + 1 === word.length;
        out += isFinalO ? 'ো' : vowel.sign;
      } else {
        out += vowel.independent;
      }
      prevConsonant = false;
      i += vowel.pattern.length;
      continue;
    }

    out += word[i];
    prevConsonant = false;
    i += 1;
  }
  return out;
}

function isVowelStart(text: string): boolean {
  return /^[aeiouAEIOU]/.test(text);
}

/** Dictionary first, then phonetic rules. */
export function banglishWordToBengali(word: string): string {
  return WORDS[word.toLowerCase()] ?? romanWordToBengali(word);
}

export function isKnownBanglishWord(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORDS, word.toLowerCase());
}

/** Splits a string into Latin-letter words and everything else. */
export function splitLatinWords(text: string): Array<{ text: string; isWord: boolean }> {
  const parts: Array<{ text: string; isWord: boolean }> = [];
  let current = '';
  let currentIsWord = false;
  for (const ch of text) {
    const isWord = isLatinLetter(ch);
    if (current && isWord !== currentIsWord) {
      parts.push({ text: current, isWord: currentIsWord });
      current = '';
    }
    current += ch;
    currentIsWord = isWord;
  }
  if (current) {
    parts.push({ text: current, isWord: currentIsWord });
  }
  return parts;
}

/**
 * Should this Latin-script text be read as Roman Bengali?
 * Needs clear evidence so that ordinary English is never converted.
 */
export function looksLikeBanglish(text: string): boolean {
  const words = splitLatinWords(text).filter(p => p.isWord).map(p => p.text);
  if (words.length === 0) {
    return false;
  }
  const markers = words.filter(isBanglishMarker).length;
  if (words.length <= 2) {
    return markers >= 1 && markers === words.length;
  }
  return markers >= 2 && markers / words.length >= 0.25;
}

/**
 * Converts the Latin words in `text` from Roman Bengali to Bengali script.
 * Words that are known English terms (React, app, online…) are kept as-is
 * so they can be read as English. Acronyms (ALL CAPS) are kept as-is.
 */
export function convertBanglish(text: string): string {
  return splitLatinWords(text)
    .map(part => {
      if (!part.isWord) {
        return part.text;
      }
      const isAcronym = part.text.length > 1 && part.text === part.text.toUpperCase();
      if (isAcronym) {
        return part.text;
      }
      if (!isKnownBanglishWord(part.text) && lookupLexicon(part.text)) {
        return part.text;
      }
      return banglishWordToBengali(part.text);
    })
    .join('');
}
