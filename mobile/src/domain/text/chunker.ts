/**
 * Splits a spoken sentence into inference-sized chunks. Prefers clause
 * boundaries, then word boundaries; never splits inside a word.
 */

const CLAUSE_BREAKS = [',', ';', ':', '—', '–', '،'];

export type TextChunk = { text: string; isClauseEnd: boolean };

function findSplit(text: string, maxChars: number): { index: number; clause: boolean } {
  const window = text.slice(0, maxChars + 1);
  let clauseAt = -1;
  for (const mark of CLAUSE_BREAKS) {
    clauseAt = Math.max(clauseAt, window.lastIndexOf(mark));
  }
  // Only use a clause break if it doesn't produce a tiny first chunk.
  if (clauseAt >= maxChars * 0.4) {
    return { index: clauseAt + 1, clause: true };
  }
  const spaceAt = window.lastIndexOf(' ');
  if (spaceAt > 0) {
    return { index: spaceAt + 1, clause: false };
  }
  // A single huge "word" (no spaces at all): hard split as a last resort.
  return { index: maxChars, clause: false };
}

export function chunkSentence(sentence: string, maxChars: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let rest = sentence.trim();
  while (rest.length > maxChars) {
    const { index, clause } = findSplit(rest, maxChars);
    const head = rest.slice(0, index).trim();
    if (head) {
      chunks.push({ text: head, isClauseEnd: clause });
    }
    rest = rest.slice(index).trim();
  }
  if (rest) {
    chunks.push({ text: rest, isClauseEnd: false });
  }
  return chunks;
}
