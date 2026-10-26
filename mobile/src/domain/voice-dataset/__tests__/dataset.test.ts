import { assessRoom, assessTake, TakeMeasurements } from '../quality';
import { buildDatasetFiles, datasetStats, DatasetTake, readinessFor, STYLE_MIN_TAKES, trainingTranscript } from '../dataset';
import { containsLatin } from '../../text/script';

const clean: TakeMeasurements = {
  durationMs: 4200,
  speechMs: 3400,
  leadingSilenceMs: 400,
  trailingSilenceMs: 400,
  peakDb: -6,
  speechRmsDb: -22,
  noiseFloorDb: -62,
  clippedSamples: 0,
  sampleRate: 48000,
  autoStopped: false,
};
const prompt = 'আজ সকালে হালকা বৃষ্টি হয়েছে, তাই রাস্তা একটু ভেজা।';

describe('assessTake', () => {
  it('accepts a clean take', () => {
    expect(assessTake(clean, prompt)).toMatchObject({ verdict: 'good', issues: [] });
  });

  it('rejects silence', () => {
    expect(assessTake({ ...clean, speechMs: 100 }, prompt).verdict).toBe('retry');
  });

  it('rejects clipping', () => {
    const r = assessTake({ ...clean, clippedSamples: 500, peakDb: 0 }, prompt);
    expect(r.verdict).toBe('retry');
    expect(r.issues).toContain('clipping');
  });

  it('rejects heavy noise and warns on moderate noise', () => {
    expect(assessTake({ ...clean, noiseFloorDb: -35 }, prompt).issues).toContain('noisy');
    const moderate = assessTake({ ...clean, noiseFloorDb: -46 }, prompt);
    expect(moderate.verdict).toBe('warn');
    expect(moderate.issues).toContain('some_noise');
  });

  it('rejects words cut at the start or end', () => {
    expect(assessTake({ ...clean, leadingSilenceMs: 20 }, prompt).issues).toContain('cut_start');
    expect(assessTake({ ...clean, trailingSilenceMs: 0 }, prompt).issues).toContain('cut_end');
  });

  it('flags a reading that is far too fast for the text (skipped words)', () => {
    expect(assessTake({ ...clean, speechMs: 900 }, prompt).issues).toContain('too_fast');
  });

  it('warns on quiet takes and rejects very quiet ones', () => {
    expect(assessTake({ ...clean, speechRmsDb: -38 }, prompt).verdict).toBe('warn');
    expect(assessTake({ ...clean, speechRmsDb: -50, noiseFloorDb: -90 }, prompt).issues).toContain('too_quiet');
  });

  it('rejects takes that hit the length limit', () => {
    expect(assessTake({ ...clean, autoStopped: true }, prompt).issues).toContain('too_long');
  });
});

describe('assessRoom', () => {
  it('grades background noise', () => {
    expect(assessRoom(-65)).toBe('quiet');
    expect(assessRoom(-48)).toBe('ok');
    expect(assessRoom(-35)).toBe('noisy');
  });
});

const take = (i: number, style: DatasetTake['style'], speechMs = 5000): DatasetTake => ({
  promptId: `${style}-${String(i).padStart(3, '0')}`,
  style,
  category: 'bn',
  text: prompt,
  durationMs: speechMs + 800,
  speechMs,
  sampleRate: 48000,
  verdict: 'good',
  issues: [],
});

describe('datasetStats', () => {
  it('counts only usable takes and picks trainable styles', () => {
    const takes = [
      ...Array.from({ length: 50 }, (_, i) => take(i, 'natural')),
      ...Array.from({ length: STYLE_MIN_TAKES }, (_, i) => take(i, 'calm')),
      ...Array.from({ length: 5 }, (_, i) => take(i, 'energetic')),
      { ...take(99, 'natural'), verdict: 'retry' as const },
    ];
    const stats = datasetStats(takes);
    expect(stats.takeCount).toBe(50 + STYLE_MIN_TAKES + 5);
    expect(stats.trainableStyles).toEqual(['natural', 'calm']);
    expect(stats.byStyle.natural?.count).toBe(50);
  });

  it('maps total speech to readiness', () => {
    expect(readinessFor(10 * 60000)).toBe('not_ready');
    expect(readinessFor(15 * 60000)).toBe('minimum');
    expect(readinessFor(35 * 60000)).toBe('recommended');
    expect(readinessFor(61 * 60000)).toBe('great');
  });
});

describe('trainingTranscript', () => {
  it('keeps Bangla as written', () => {
    expect(trainingTranscript('আমি ভাত খাই।')).toBe('আমি ভাত খাই।');
  });

  it('turns English words into the Bengali-script pronunciation the voice receives', () => {
    const t = trainingTranscript('আমার laptop টা আবার hang করছে।');
    expect(containsLatin(t)).toBe(false);
    expect(t).toContain('ল্যাপটপ');
  });
});

describe('buildDatasetFiles', () => {
  it('writes pipe-separated metadata and a consent record', () => {
    const takes = [take(1, 'natural'), take(2, 'natural'), { ...take(3, 'natural'), verdict: 'retry' as const }];
    const { metadataCsv, datasetJson } = buildDatasetFiles(
      {
        name: 'My voice',
        speakerName: 'Speaker',
        gender: null,
        accent: 'Dhaka',
        description: null,
        consentText: 'I confirm this is my voice.',
        consentAt: '2026-10-26T00:00:00.000Z',
      },
      takes,
      '0.1.0',
      '2026-10-26T00:00:00.000Z',
    );
    const lines = metadataCsv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^natural-001\.wav\|natural\|.+/);
    expect(datasetJson.consent.confirmed).toBe(true);
    expect(datasetJson.takes.map(t => t.file)).toEqual(['wavs/natural-001.wav', 'wavs/natural-002.wav']);
  });
});
