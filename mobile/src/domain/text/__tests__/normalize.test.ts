import { expandSemiotics, normalizeBengaliSegment, normalizeEnglishSegment } from '../normalize';

describe('expandSemiotics — Bengali context', () => {
  it.each([
    ['দাম ৳1,250', 'দাম এক হাজার দুইশো পঞ্চাশ টাকা'],
    ['দাম ৳১২.৫০', 'দাম বারো টাকা পঞ্চাশ পয়সা'],
    ['আমি 10:30 AM এ আসবো', 'আমি সকাল দশটা ত্রিশ মিনিট এ আসবো'],
    ['২৫% ছাড়', 'পঁচিশ শতাংশ ছাড়'],
    ['তারিখ 2026-10-26', 'তারিখ ছাব্বিশ অক্টোবর দুই হাজার ছাব্বিশ'],
    ['তারিখ ২৬/১০/২০২৬', 'তারিখ ছাব্বিশ অক্টোবর দুই হাজার ছাব্বিশ'],
    ['দূরত্ব 5 km', 'দূরত্ব পাঁচ কিলোমিটার'],
    ['আমি ১ম হয়েছি', 'আমি প্রথম হয়েছি'],
    ['ফোন 01712-345678', 'ফোন শূন্য এক সাত এক দুই, তিন চার পাঁচ ছয় সাত আট'],
    ['মোট ১০০০ জন', 'মোট এক হাজার জন'],
    ['মান 3.14', 'মান তিন দশমিক এক চার'],
  ])('%s', (input, expected) => {
    expect(expandSemiotics(input, 'bn').trim()).toBe(expected);
  });
});

describe('expandSemiotics — English context', () => {
  it.each([
    ['It costs $1,250.50', 'It costs one thousand two hundred fifty dollars and fifty cents'],
    ['Price is 500 BDT', 'Price is five hundred taka'],
    ['Meet at 10:30 AM', 'Meet at ten thirty A M'],
    ['Growth was 25%', 'Growth was twenty-five percent'],
    ['Released on 2026-10-26', 'Released on October twenty-sixth, twenty twenty-six'],
    ['Mail me at polash@example.com', 'Mail me at polash at example dot com'],
    ['Visit https://example.com/docs', 'Visit example dot com slash docs'],
    ['I have 16 GB RAM', 'I have sixteen gigabytes RAM'],
    ['He came 2nd', 'He came second'],
    ['Call 007 now', 'Call zero zero seven now'],
  ])('%s', (input, expected) => {
    expect(expandSemiotics(input, 'en').trim()).toBe(expected);
  });
});

describe('normalizeEnglishSegment', () => {
  it('spells acronyms', () => {
    expect(normalizeEnglishSegment('API and SQL')).toBe('A P I and S Q L');
  });
  it('reads dotted names', () => {
    expect(normalizeEnglishSegment('React.js')).toBe('React dot J S');
  });
  it('uses lexicon spoken forms', () => {
    expect(normalizeEnglishSegment('PostgreSQL and JSON')).toBe('postgres Q L and Jason');
  });
  it('expands abbreviations', () => {
    expect(normalizeEnglishSegment('Dr. Rahman vs. Mr. Karim')).toBe(
      'Doctor Rahman versus Mister Karim',
    );
  });
  it('does not spell out an all-caps sentence', () => {
    expect(normalizeEnglishSegment('THIS IS GREAT NEWS')).toBe('THIS IS GREAT NEWS');
  });
  it('splits CamelCase', () => {
    expect(normalizeEnglishSegment('TanStack')).toBe('Tan Stack');
  });
});

describe('normalizeBengaliSegment', () => {
  it('expands Bangladeshi abbreviations at word start only', () => {
    expect(normalizeBengaliSegment('ডা. করিম এবং মোঃ রহিম')).toBe('ডাক্তার করিম এবং মোহাম্মদ রহিম');
  });
});
