/**
 * English words commonly used inside Bangladeshi Bengali speech, with the
 * Bengali-script pronunciation a Bangladeshi speaker would use.
 *
 * Used when a Bengali voice has to read English (code-mixed text), and to
 * keep these words as English when converting Roman Banglish.
 * Users can override any of these through the pronunciation dictionary.
 */

export type LexiconEntry = {
  /** Bengali-script pronunciation. */
  bn: string;
  /** English spoken form, when it differs from the written word. */
  en?: string;
};

const RAW: Record<string, string | LexiconEntry> = {
  // Function words that appear in English sentences read by a Bengali voice
  the: 'দ্য', a: 'আ', an: 'অ্যান', is: 'ইজ', are: 'আর', was: 'ওয়াজ', were: 'ওয়্যার',
  be: 'বি', been: 'বিন', and: 'অ্যান্ড', or: 'অর', of: 'অফ', in: 'ইন', on: 'অন',
  at: 'অ্যাট', to: 'টু', for: 'ফর', from: 'ফ্রম', with: 'উইথ', by: 'বাই', as: 'অ্যাজ',
  this: 'দিস', that: 'দ্যাট', these: 'দিজ', it: 'ইট', its: 'ইটস', you: 'ইউ', i: 'আই',
  we: 'উই', they: 'দে', he: 'হি', she: 'শি', my: 'মাই', your: 'ইয়োর', our: 'আওয়ার',
  will: 'উইল', can: 'ক্যান', do: 'ডু', does: 'ডাজ', not: 'নট', have: 'হ্যাভ', has: 'হ্যাজ',
  how: 'হাউ', what: 'হোয়াট', why: 'হোয়াই', when: 'হোয়েন', where: 'হোয়্যার', who: 'হু',
  all: 'অল', more: 'মোর', most: 'মোস্ট', very: 'ভেরি', so: 'সো', but: 'বাট', if: 'ইফ',
  hello: 'হ্যালো', hi: 'হাই', thanks: 'থ্যাংকস', thank: 'থ্যাংক', please: 'প্লিজ',
  sorry: 'সরি', okay: 'ওকে', ok: 'ওকে', yes: 'ইয়েস', no: 'নো', good: 'গুড',
  morning: 'মর্নিং', night: 'নাইট', welcome: 'ওয়েলকাম', everyone: 'এভরিওয়ান',
  today: 'টুডে', new: 'নিউ', best: 'বেস্ট', first: 'ফার্স্ট', last: 'লাস্ট',
  // Technology
  react: 'রিয়্যাক্ট', native: 'নেটিভ', offline: 'অফলাইন', online: 'অনলাইন',
  application: 'অ্যাপ্লিকেশন', applications: 'অ্যাপ্লিকেশনস', app: 'অ্যাপ', apps: 'অ্যাপস',
  text: 'টেক্সট', speech: 'স্পিচ', voice: 'ভয়েস', voices: 'ভয়েসেস', android: 'অ্যান্ড্রয়েড',
  iphone: 'আইফোন', phone: 'ফোন', mobile: 'মোবাইল', computer: 'কম্পিউটার',
  software: 'সফটওয়্যার', hardware: 'হার্ডওয়্যার', website: 'ওয়েবসাইট', web: 'ওয়েব',
  internet: 'ইন্টারনেট', google: 'গুগল', facebook: 'ফেসবুক', youtube: 'ইউটিউব',
  whatsapp: 'হোয়াটসঅ্যাপ', messenger: 'মেসেঞ্জার', video: 'ভিডিও', videos: 'ভিডিওস',
  audio: 'অডিও', file: 'ফাইল', files: 'ফাইলস', download: 'ডাউনলোড', upload: 'আপলোড',
  server: 'সার্ভার', database: 'ডাটাবেস', data: 'ডাটা', code: 'কোড', coding: 'কোডিং',
  programming: 'প্রোগ্রামিং', programmer: 'প্রোগ্রামার', developer: 'ডেভেলপার',
  development: 'ডেভেলপমেন্ট', design: 'ডিজাইন', designer: 'ডিজাইনার', project: 'প্রজেক্ট',
  projects: 'প্রজেক্টস', model: 'মডেল', models: 'মডেলস', javascript: 'জাভাস্ক্রিপ্ট',
  typescript: 'টাইপস্ক্রিপ্ট', python: 'পাইথন', java: 'জাভা', kotlin: 'কটলিন',
  swift: 'সুইফট', node: 'নোড', backend: 'ব্যাকএন্ড', frontend: 'ফ্রন্টএন্ড',
  user: 'ইউজার', users: 'ইউজারস', account: 'অ্যাকাউন্ট', password: 'পাসওয়ার্ড',
  email: 'ইমেইল', button: 'বাটন', screen: 'স্ক্রিন', settings: 'সেটিংস',
  update: 'আপডেট', version: 'ভার্সন', feature: 'ফিচার', features: 'ফিচারস',
  system: 'সিস্টেম', network: 'নেটওয়ার্ক', cloud: 'ক্লাউড', privacy: 'প্রাইভেসি',
  security: 'সিকিউরিটি', github: 'গিটহাব', git: 'গিট', docker: 'ডকার', linux: 'লিনাক্স',
  windows: 'উইন্ডোজ', chrome: 'ক্রোম', browser: 'ব্রাউজার', framework: 'ফ্রেমওয়ার্ক',
  library: 'লাইব্রেরি', component: 'কম্পোনেন্ট', components: 'কম্পোনেন্টস',
  function: 'ফাংশন', variable: 'ভেরিয়েবল', string: 'স্ট্রিং', number: 'নাম্বার',
  array: 'অ্যারে', object: 'অবজেক্ট', error: 'এরর', bug: 'বাগ', test: 'টেস্ট',
  testing: 'টেস্টিং', deploy: 'ডিপ্লয়', machine: 'মেশিন', learning: 'লার্নিং',
  deep: 'ডিপ', neural: 'নিউরাল', training: 'ট্রেনিং', dataset: 'ডাটাসেট', open: 'ওপেন',
  source: 'সোর্স', startup: 'স্টার্টআপ', digital: 'ডিজিটাল', smart: 'স্মার্ট',
  technology: 'টেকনোলজি', tech: 'টেক', engineer: 'ইঞ্জিনিয়ার', engineering: 'ইঞ্জিনিয়ারিং',
  studio: 'স্টুডিও', podcast: 'পডকাস্ট', content: 'কন্টেন্ট', creator: 'ক্রিয়েটর',
  record: 'রেকর্ড', recording: 'রেকর্ডিং', microphone: 'মাইক্রোফোন', sound: 'সাউন্ড',
  play: 'প্লে', pause: 'পজ', stop: 'স্টপ', start: 'স্টার্ট', next: 'নেক্সট', back: 'ব্যাক',
  home: 'হোম', search: 'সার্চ', menu: 'মেনু', profile: 'প্রোফাইল', login: 'লগইন',
  logout: 'লগআউট', dashboard: 'ড্যাশবোর্ড', report: 'রিপোর্ট', chart: 'চার্ট',
  wifi: 'ওয়াইফাই', bluetooth: 'ব্লুটুথ', laptop: 'ল্যাপটপ', keyboard: 'কিবোর্ড',
  mouse: 'মাউস', battery: 'ব্যাটারি', charge: 'চার্জ', camera: 'ক্যামেরা', photo: 'ফটো',
  music: 'মিউজিক', background: 'ব্যাকগ্রাউন্ড', export: 'এক্সপোর্ট', import: 'ইমপোর্ট',
  format: 'ফরম্যাট', tutorial: 'টিউটোরিয়াল', course: 'কোর্স', class: 'ক্লাস',
  student: 'স্টুডেন্ট', students: 'স্টুডেন্টস', teacher: 'টিচার', school: 'স্কুল',
  college: 'কলেজ', university: 'ইউনিভার্সিটি', exam: 'এক্সাম', chapter: 'চ্যাপ্টার',
  page: 'পেজ', link: 'লিংক', share: 'শেয়ার', like: 'লাইক', comment: 'কমেন্ট',
  subscribe: 'সাবস্ক্রাইব', channel: 'চ্যানেল', post: 'পোস্ট', news: 'নিউজ', live: 'লাইভ',
  game: 'গেম', team: 'টিম', office: 'অফিস', meeting: 'মিটিং', company: 'কোম্পানি',
  business: 'বিজনেস', marketing: 'মার্কেটিং', manager: 'ম্যানেজার', customer: 'কাস্টমার',
  service: 'সার্ভিস', support: 'সাপোর্ট', problem: 'প্রবলেম', solution: 'সলিউশন',
  simple: 'সিম্পল', easy: 'ইজি', fast: 'ফাস্ট', free: 'ফ্রি', quality: 'কোয়ালিটি',
  product: 'প্রোডাক্ট', price: 'প্রাইস', order: 'অর্ডার', delivery: 'ডেলিভারি',
  payment: 'পেমেন্ট', bkash: 'বিকাশ', nagad: 'নগদ', bank: 'ব্যাংক', card: 'কার্ড',
  cash: 'ক্যাশ', use: 'ইউজ', using: 'ইউজিং', build: 'বিল্ড', create: 'ক্রিয়েট',
  make: 'মেক', work: 'ওয়ার্ক', ai: 'এআই',
  // Words produced by English normalization (numbers, symbols, months)
  dot: 'ডট', slash: 'স্ল্যাশ', dash: 'ড্যাশ', point: 'পয়েন্ট', percent: 'পার্সেন্ট',
  plus: 'প্লাস', minus: 'মাইনাস', equals: 'ইকুয়ালস', hashtag: 'হ্যাশট্যাগ',
  underscore: 'আন্ডারস্কোর', colon: 'কোলন', dollar: 'ডলার', dollars: 'ডলার', cent: 'সেন্ট',
  cents: 'সেন্ট', taka: 'টাকা', poisha: 'পয়সা', oh: 'ও', zero: 'জিরো', one: 'ওয়ান',
  two: 'টু', three: 'থ্রি', four: 'ফোর', five: 'ফাইভ', six: 'সিক্স', seven: 'সেভেন',
  eight: 'এইট', nine: 'নাইন', ten: 'টেন', eleven: 'ইলেভেন', twelve: 'টুয়েলভ',
  thirteen: 'থার্টিন', fourteen: 'ফোর্টিন', fifteen: 'ফিফটিন', sixteen: 'সিক্সটিন',
  seventeen: 'সেভেনটিন', eighteen: 'এইটিন', nineteen: 'নাইনটিন', twenty: 'টোয়েন্টি',
  thirty: 'থার্টি', forty: 'ফোর্টি', fifty: 'ফিফটি', sixty: 'সিক্সটি', seventy: 'সেভেনটি',
  eighty: 'এইটি', ninety: 'নাইনটি', hundred: 'হান্ড্রেড', thousand: 'থাউজ্যান্ড',
  million: 'মিলিয়ন', billion: 'বিলিয়ন', january: 'জানুয়ারি', february: 'ফেব্রুয়ারি',
  march: 'মার্চ', april: 'এপ্রিল', may: 'মে', june: 'জুন', july: 'জুলাই', august: 'আগস্ট',
  september: 'সেপ্টেম্বর', october: 'অক্টোবর', november: 'নভেম্বর', december: 'ডিসেম্বর',
  // Pronounced as words, not spelled out
  json: { bn: 'জেসন', en: 'Jason' },
  ram: { bn: 'র‍্যাম', en: 'ram' },
  sim: { bn: 'সিম', en: 'sim' },
  nasa: { bn: 'নাসা', en: 'nasa' },
  buet: { bn: 'বুয়েট', en: 'bu et' },
  gif: { bn: 'জিফ', en: 'jif' },
  pdf: { bn: 'পিডিএফ', en: 'P D F' },
  postgresql: { bn: 'পোস্টগ্রেস কিউ এল', en: 'postgres Q L' },
  postgres: { bn: 'পোস্টগ্রেস', en: 'postgres' },
  mysql: { bn: 'মাই এস কিউ এল', en: 'my S Q L' },
  sqlite: { bn: 'এস কিউ লাইট', en: 'S Q lite' },
  mongodb: { bn: 'মঙ্গো ডিবি', en: 'mongo D B' },
  ios: { bn: 'আইওএস', en: 'I O S' },
  macos: { bn: 'ম্যাক ওএস', en: 'mac O S' },
  onnx: { bn: 'অনিক্স', en: 'onyx' },
  sherpa: { bn: 'শেরপা', en: 'sherpa' },
  banglish: { bn: 'বাংলিশ', en: 'banglish' },
};

export const LEXICON: Record<string, LexiconEntry> = Object.fromEntries(
  Object.entries(RAW).map(([key, value]) => [
    key,
    typeof value === 'string' ? { bn: value } : value,
  ]),
);

export function lookupLexicon(word: string): LexiconEntry | undefined {
  return LEXICON[word.toLowerCase()];
}

export const LETTER_NAMES_BN: Record<string, string> = {
  A: 'এ', B: 'বি', C: 'সি', D: 'ডি', E: 'ই', F: 'এফ', G: 'জি', H: 'এইচ', I: 'আই',
  J: 'জে', K: 'কে', L: 'এল', M: 'এম', N: 'এন', O: 'ও', P: 'পি', Q: 'কিউ', R: 'আর',
  S: 'এস', T: 'টি', U: 'ইউ', V: 'ভি', W: 'ডাব্লিউ', X: 'এক্স', Y: 'ওয়াই', Z: 'জেড',
};

/** Short file-extension style suffixes that are spelled out: React.js → "React dot J S". */
export const SPELLED_SUFFIXES = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'io', 'ai', 'kt', 'md']);
