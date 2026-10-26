/**
 * Personal voice dataset: progress statistics and the export layout that
 * tools/voice-training/ consumes.
 *
 *   <name>.voicedataset.zip
 *     dataset.json     voice details, consent record, every take
 *     metadata.csv     file|style|transcript   (pipe-separated, no header)
 *     wavs/<id>.wav    16-bit mono PCM, original sample rate
 *
 * Transcripts are produced by the same text pipeline the app uses at
 * synthesis time for a Bangla voice (English words → Bengali-script
 * pronunciation), so training text and runtime text always match.
 */
import { prepareSentence } from '../text/pipeline';
import type { PromptCategory, StyleKey } from './types';
import type { TakeIssue, TakeVerdict } from './quality';

export const DATASET_FORMAT = 'voicestudio.dataset';
export const DATASET_VERSION = 1;

/** A style becomes its own speaker in the trained voice only with enough takes. */
export const STYLE_MIN_TAKES = 30;

export const TARGET_MINUTES = { minimum: 15, recommended: 30, great: 60 } as const;

export type Readiness = 'not_ready' | 'minimum' | 'recommended' | 'great';

export type DatasetTake = {
  promptId: string;
  style: StyleKey;
  category: PromptCategory;
  text: string;
  durationMs: number;
  speechMs: number;
  sampleRate: number;
  verdict: TakeVerdict;
  issues: TakeIssue[];
};

export type StyleProgress = { count: number; speechMs: number };

export type DatasetStats = {
  takeCount: number;
  speechMs: number;
  byStyle: Partial<Record<StyleKey, StyleProgress>>;
  /** Styles that will become speakers (natural is always first when present). */
  trainableStyles: StyleKey[];
  readiness: Readiness;
};

export function readinessFor(speechMs: number): Readiness {
  const minutes = speechMs / 60000;
  if (minutes >= TARGET_MINUTES.great) {
    return 'great';
  }
  if (minutes >= TARGET_MINUTES.recommended) {
    return 'recommended';
  }
  if (minutes >= TARGET_MINUTES.minimum) {
    return 'minimum';
  }
  return 'not_ready';
}

export function datasetStats(takes: DatasetTake[]): DatasetStats {
  const usable = takes.filter(t => t.verdict !== 'retry');
  const byStyle: Partial<Record<StyleKey, StyleProgress>> = {};
  let speechMs = 0;
  for (const take of usable) {
    const entry = (byStyle[take.style] ??= { count: 0, speechMs: 0 });
    entry.count += 1;
    entry.speechMs += take.speechMs;
    speechMs += take.speechMs;
  }
  const trainableStyles = (Object.keys(byStyle) as StyleKey[])
    .filter(style => style === 'natural' || (byStyle[style]?.count ?? 0) >= STYLE_MIN_TAKES)
    .sort((a, b) => (a === 'natural' ? -1 : b === 'natural' ? 1 : a.localeCompare(b)));
  return { takeCount: usable.length, speechMs, byStyle, trainableStyles, readiness: readinessFor(speechMs) };
}

/** The exact text a Bangla voice is given for this prompt at synthesis time. */
export function trainingTranscript(text: string): string {
  const { spoken } = prepareSentence(
    text,
    {
      mode: 'auto',
      voice: { primaryLanguage: 'bn', languageHandling: { bn: 'native', en: 'transliterate' }, maxChunkChars: 1000 },
    },
    'bn',
  );
  return spoken.replace(/[|\r\n]+/g, ' ').trim();
}

export const takeFileName = (promptId: string) => `${promptId}.wav`;

export type DatasetVoiceInfo = {
  name: string;
  speakerName: string;
  gender: string | null;
  accent: string | null;
  description: string | null;
  consentText: string;
  consentAt: string;
};

export function buildDatasetFiles(voice: DatasetVoiceInfo, takes: DatasetTake[], appVersion: string, createdAt: string) {
  const stats = datasetStats(takes);
  const usable = takes
    .filter(t => t.verdict !== 'retry')
    .sort((a, b) => a.promptId.localeCompare(b.promptId));
  const rows = usable.map(take => ({ take, transcript: trainingTranscript(take.text) }));

  const metadataCsv = rows
    .filter(r => r.transcript.length > 0)
    .map(r => `${takeFileName(r.take.promptId)}|${r.take.style}|${r.transcript}`)
    .join('\n');

  const datasetJson = {
    format: DATASET_FORMAT,
    version: DATASET_VERSION,
    createdAt,
    app: { name: 'VoiceStudio', version: appVersion },
    voice: {
      name: voice.name,
      speakerName: voice.speakerName,
      gender: voice.gender,
      accent: voice.accent,
      description: voice.description,
      primaryLanguage: 'bn',
    },
    consent: { confirmed: true, text: voice.consentText, confirmedAt: voice.consentAt },
    audio: { format: 'wav', encoding: 'pcm_s16le', channels: 1 },
    styles: stats.trainableStyles,
    styleMinTakes: STYLE_MIN_TAKES,
    totals: { takes: rows.length, speechMs: stats.speechMs },
    takes: rows.map(({ take, transcript }) => ({
      file: `wavs/${takeFileName(take.promptId)}`,
      promptId: take.promptId,
      style: take.style,
      category: take.category,
      text: take.text,
      transcript,
      durationMs: take.durationMs,
      speechMs: take.speechMs,
      sampleRate: take.sampleRate,
      verdict: take.verdict,
      issues: take.issues,
    })),
  };

  return { metadataCsv, datasetJson, stats };
}
