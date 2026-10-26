/**
 * User pronunciation dictionary: whole-word replacements applied before
 * normalization, so the user's spelling always wins.
 */

import { isWordChar } from './script';

export type PronunciationScope = 'global' | { projectId: string };

export type PronunciationEntry = {
  id: string;
  term: string;
  replacement: string;
  /** Apply only when the voice/segment language matches; 'any' applies everywhere. */
  language: 'any' | 'bn' | 'en';
  caseSensitive: boolean;
  enabled: boolean;
  projectId?: string | null;
};

function matchesAt(
  text: string,
  index: number,
  term: string,
  caseSensitive: boolean,
): boolean {
  const slice = text.slice(index, index + term.length);
  const equal = caseSensitive ? slice === term : slice.toLowerCase() === term.toLowerCase();
  return equal && !isWordChar(text[index - 1]) && !isWordChar(text[index + term.length]);
}

/**
 * Applies enabled entries. Longer terms win over shorter ones that overlap
 * ("PostgreSQL" before "SQL"). A replaced region is never re-processed.
 */
export function applyPronunciations(
  text: string,
  entries: PronunciationEntry[],
  options: { projectId?: string; voiceLanguage?: 'bn' | 'en' } = {},
): string {
  const active = entries
    .filter(e => e.enabled && e.term.trim())
    .filter(e => !e.projectId || e.projectId === options.projectId)
    .filter(e => e.language === 'any' || e.language === options.voiceLanguage)
    .sort((a, b) => {
      // Project entries override global ones for the same term.
      if (b.term.length !== a.term.length) {
        return b.term.length - a.term.length;
      }
      return (b.projectId ? 1 : 0) - (a.projectId ? 1 : 0);
    });
  if (active.length === 0) {
    return text;
  }

  let out = '';
  let i = 0;
  while (i < text.length) {
    const atWordStart = !isWordChar(text[i - 1]);
    const entry = atWordStart
      ? active.find(e => matchesAt(text, i, e.term, e.caseSensitive))
      : undefined;
    if (entry) {
      out += entry.replacement;
      i += entry.term.length;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}
