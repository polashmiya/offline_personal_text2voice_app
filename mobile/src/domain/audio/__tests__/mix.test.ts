import {
  buildMixRequest,
  DEFAULT_MIX,
  mixedDurationMs,
  MUSIC_MIX_RATE,
  needsMix,
  parseMixSettings,
  trimTooLong,
} from '../mix';

describe('mix settings', () => {
  it('defaults need no mix', () => {
    expect(needsMix(DEFAULT_MIX)).toBe(false);
  });

  it('music, volume, trim or padding each need a mix', () => {
    expect(needsMix({ ...DEFAULT_MIX, musicTrackId: 'm1' })).toBe(true);
    expect(needsMix({ ...DEFAULT_MIX, voiceVolume: 0.85 })).toBe(true);
    expect(needsMix({ ...DEFAULT_MIX, trimStartMs: 100 })).toBe(true);
    expect(needsMix({ ...DEFAULT_MIX, padEndMs: 1000 })).toBe(true);
  });

  it('computes mixed duration', () => {
    const s = { ...DEFAULT_MIX, trimStartMs: 250, trimEndMs: 250, padStartMs: 2000, padEndMs: 4000 };
    expect(mixedDurationMs(10_000, s)).toBe(9_500 + 6_000);
    expect(mixedDurationMs(100, s)).toBe(6_000);
  });

  it('flags trims that remove almost all speech', () => {
    expect(trimTooLong(800, { ...DEFAULT_MIX, trimStartMs: 250, trimEndMs: 250 })).toBe(true);
    expect(trimTooLong(5000, { ...DEFAULT_MIX, trimStartMs: 250, trimEndMs: 250 })).toBe(false);
  });
});

describe('buildMixRequest', () => {
  const base = { voicePath: '/v.wav', outputPath: '/o.wav', normalize: true };

  it('voice-only keeps the voice rate and disables music + ducking', () => {
    const r = buildMixRequest({ ...base, settings: { ...DEFAULT_MIX, padEndMs: 1000 }, musicPath: null });
    expect(r.sampleRate).toBe(0);
    expect(r.musicGain).toBe(0);
    expect(r.duck).toBe(false);
    expect(r.padEndMs).toBe(1000);
  });

  it('with music renders at the music rate and ducks by default', () => {
    const r = buildMixRequest({ ...base, settings: { ...DEFAULT_MIX, musicTrackId: 'm' }, musicPath: '/m.wav' });
    expect(r.sampleRate).toBe(MUSIC_MIX_RATE);
    expect(r.musicGain).toBeCloseTo(0.12);
    expect(r.duck).toBe(true);
    expect(r.duckDb).toBe(10);
  });

  it('clamps out-of-range values', () => {
    const r = buildMixRequest({
      ...base,
      settings: { ...DEFAULT_MIX, voiceVolume: 9, musicVolume: -1, duckAttackMs: 0, trimStartMs: Number.NaN },
      musicPath: '/m.wav',
    });
    expect(r.voiceGain).toBe(2);
    expect(r.musicGain).toBe(0);
    expect(r.duckAttackMs).toBe(5);
    expect(r.trimStartMs).toBe(0);
  });
});

describe('parseMixSettings', () => {
  it('falls back to defaults for garbage', () => {
    expect(parseMixSettings(null)).toEqual(DEFAULT_MIX);
    expect(parseMixSettings('x')).toEqual(DEFAULT_MIX);
  });

  it('keeps valid fields and drops invalid ones', () => {
    const s = parseMixSettings({ musicTrackId: 'abc', musicVolume: 0.2, autoDuck: 'yes', padEndMs: -5, extra: 1 });
    expect(s.musicTrackId).toBe('abc');
    expect(s.musicVolume).toBe(0.2);
    expect(s.autoDuck).toBe(DEFAULT_MIX.autoDuck);
    expect(s.padEndMs).toBe(0);
    expect(s).not.toHaveProperty('extra');
  });
});
