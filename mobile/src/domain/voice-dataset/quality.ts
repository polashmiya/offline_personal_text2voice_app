/**
 * Plain-language quality verdict for one recorded take.
 *
 * Measurements come from the native analyzer (20 ms frames). Thresholds
 * are deliberately practical: a take is rejected only for problems that
 * clearly hurt training (clipping, heavy noise, cut-off words, silence);
 * smaller issues are warnings the speaker may accept.
 */

export type TakeMeasurements = {
  durationMs: number;
  speechMs: number;
  leadingSilenceMs: number;
  trailingSilenceMs: number;
  peakDb: number;
  speechRmsDb: number;
  noiseFloorDb: number;
  clippedSamples: number;
  sampleRate: number;
  autoStopped: boolean;
};

export type TakeIssue =
  | 'no_speech'
  | 'too_long'
  | 'clipping'
  | 'too_quiet'
  | 'quiet'
  | 'noisy'
  | 'some_noise'
  | 'cut_start'
  | 'cut_end'
  | 'too_fast'
  | 'slow'
  | 'long_silence';

export type TakeVerdict = 'good' | 'warn' | 'retry';

export type TakeReport = {
  verdict: TakeVerdict;
  issues: TakeIssue[];
  snrDb: number;
};

const REJECT: ReadonlySet<TakeIssue> = new Set<TakeIssue>([
  'no_speech',
  'too_long',
  'clipping',
  'too_quiet',
  'noisy',
  'cut_start',
  'cut_end',
  'too_fast',
]);

/** Letters only; spaces and punctuation don't take time to say. */
function spokenLength(text: string): number {
  return text.replace(/[\s.,!?।;:'"\-–—]/g, '').length;
}

export function assessTake(m: TakeMeasurements, promptText: string): TakeReport {
  const issues: TakeIssue[] = [];
  const snrDb = m.speechRmsDb - m.noiseFloorDb;

  if (m.speechMs < 400) {
    return { verdict: 'retry', issues: ['no_speech'], snrDb };
  }
  if (m.autoStopped) {
    issues.push('too_long');
  }

  const totalSamples = (m.durationMs / 1000) * m.sampleRate;
  if (m.clippedSamples > Math.max(3, totalSamples * 0.0002) || m.peakDb > -0.1) {
    issues.push('clipping');
  }

  if (m.speechRmsDb < -42) {
    issues.push('too_quiet');
  } else if (m.speechRmsDb < -34) {
    issues.push('quiet');
  }

  if (snrDb < 18 || m.noiseFloorDb > -40) {
    issues.push('noisy');
  } else if (snrDb < 28 || m.noiseFloorDb > -52) {
    issues.push('some_noise');
  }

  if (m.leadingSilenceMs < 60) {
    issues.push('cut_start');
  }
  if (m.trailingSilenceMs < 60 && !m.autoStopped) {
    issues.push('cut_end');
  }

  // Reading speed: catches skipped words / cut-offs and long hesitations.
  const charsPerSecond = spokenLength(promptText) / (m.speechMs / 1000);
  if (charsPerSecond > 28) {
    issues.push('too_fast');
  } else if (charsPerSecond < 4) {
    issues.push('slow');
  }

  if (m.leadingSilenceMs > 3000 || m.trailingSilenceMs > 3000) {
    issues.push('long_silence');
  }

  const verdict: TakeVerdict = issues.some(i => REJECT.has(i)) ? 'retry' : issues.length ? 'warn' : 'good';
  return { verdict, issues, snrDb };
}

export type RoomVerdict = 'quiet' | 'ok' | 'noisy';

/** Mic check before a session: background level of the room. */
export function assessRoom(noiseDb: number): RoomVerdict {
  if (noiseDb > -42) {
    return 'noisy';
  }
  if (noiseDb > -54) {
    return 'ok';
  }
  return 'quiet';
}
