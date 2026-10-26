import { PROMPTS } from './data';
import type { RecordingPrompt, StyleKey } from './types';

export type { RecordingPrompt, StyleKey } from './types';

export const STYLE_ORDER: StyleKey[] = ['natural', 'friendly', 'energetic', 'professional', 'calm', 'storytelling'];

const byStyle = new Map<StyleKey, RecordingPrompt[]>();
for (const prompt of PROMPTS) {
  const list = byStyle.get(prompt.style) ?? [];
  list.push(prompt);
  byStyle.set(prompt.style, list);
}

export function promptsFor(style: StyleKey): RecordingPrompt[] {
  return byStyle.get(style) ?? [];
}

const byId = new Map(PROMPTS.map(p => [p.id, p]));

export function promptById(id: string): RecordingPrompt | undefined {
  return byId.get(id);
}
