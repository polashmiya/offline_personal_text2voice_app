import { classifyChar } from './script';

// Average speaking rates at 1.0x, in characters per second (letters + spaces).
const BN_CHARS_PER_SECOND = 13;
const EN_CHARS_PER_SECOND = 15;
const SENTENCE_PAUSE_SECONDS = 0.35;

export type TextStats = { characters: number; words: number; estimatedSeconds: number };

/** Rough duration estimate shown in the editor. Labelled "≈" in the UI. */
export function textStats(text: string, speed = 1): TextStats {
  let bn = 0;
  let en = 0;
  let other = 0;
  for (const ch of text) {
    const cls = classifyChar(ch);
    if (cls === 'bengali') {
      bn++;
    } else if (cls === 'latin') {
      en++;
    } else if (!/\s/.test(ch)) {
      other++;
    }
  }
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sentences = (text.match(/[.!?।]+(\s|$)/g) ?? []).length;
  const speaking = bn / BN_CHARS_PER_SECOND + (en + other) / EN_CHARS_PER_SECOND + words * 0.06;
  const estimatedSeconds = words === 0 ? 0 : (speaking + sentences * SENTENCE_PAUSE_SECONDS) / speed;
  return { characters: text.length, words, estimatedSeconds };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const head = h > 0 ? `${h}:${mm}` : mm;
  return `${head}:${String(sec).padStart(2, '0')}`;
}
