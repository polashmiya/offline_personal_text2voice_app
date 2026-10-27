#!/usr/bin/env node
/**
 * Synthesizes the app's bundled background-music loops. Everything here is
 * generated from code (no samples, no third-party audio), so the output is
 * released as CC0 1.0 by this project. Deterministic: same output every run.
 *
 *   node tools/music/generate-music.mjs [outDir]
 *   (default outDir: mobile/android/app/src/main/assets/music)
 *
 * Each track is rendered three times back to back, the reverb runs over the
 * whole thing and the middle copy is kept, so note tails and reverb wrap
 * around and the file loops without a seam.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 32000;
const TAU = Math.PI * 2;
const midiHz = m => 440 * 2 ** ((m - 69) / 12);

// Chord tones as MIDI notes (root octave 3).
const CH = {
  Cmaj7: [48, 52, 55, 59],
  Am7: [45, 48, 52, 55],
  Fmaj7: [41, 45, 48, 52],
  G6: [43, 47, 50, 52],
  Am: [45, 48, 52],
  F: [41, 45, 48],
  C: [48, 52, 55],
  G: [43, 47, 50],
  Dmaj7: [50, 54, 57, 61],
  Bm7: [47, 50, 54, 57],
  Gmaj7: [43, 47, 50, 54],
  A: [45, 49, 52],
  Em: [40, 43, 47],
  D: [50, 54, 57],
  Bm: [47, 50, 54],
};

// Deterministic PRNG (mulberry32) for noise.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds a note into buf at time t (s), wrapping inside [0, buf.length). */
function addNote(buf, t, dur, voice) {
  const start = Math.round(t * SR);
  const len = Math.round((dur + voice.release) * SR);
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= buf.length) continue;
    const time = i / SR;
    buf[idx] += voice.sample(time, dur);
  }
}

// ------------------------------------------------------------------ voices

function pad(freq, gain) {
  const attack = 1.4;
  const release = 1.8;
  return {
    release,
    sample(t, dur) {
      let env = Math.min(1, t / attack);
      if (t > dur) env *= Math.max(0, 1 - (t - dur) / release);
      env = env * env * (3 - 2 * env); // smoothstep
      const s =
        Math.sin(TAU * freq * t) +
        Math.sin(TAU * freq * 1.0025 * t + 1.3) * 0.8 +
        Math.sin(TAU * freq * 0.9975 * t + 2.1) * 0.8 +
        Math.sin(TAU * freq * 2 * t) * 0.18;
      return s * env * gain;
    },
  };
}

function pluck(freq, gain, decay = 0.45) {
  return {
    release: decay * 3,
    sample(t) {
      const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
      const s = Math.sin(TAU * freq * t) + Math.sin(TAU * freq * 2 * t) * 0.25 * Math.exp(-t / 0.08) +
        Math.sin(TAU * freq * 3 * t) * 0.12 * Math.exp(-t / 0.05);
      return s * env * gain;
    },
  };
}

function keys(freq, gain) {
  // Simple electric-piano-ish tone: partials that decay faster the higher they are.
  return {
    release: 1.6,
    sample(t) {
      const env = Math.min(1, t / 0.006);
      let s = 0;
      for (let k = 1; k <= 5; k++) {
        s += (Math.sin(TAU * freq * k * t + k) / (k * k)) * Math.exp(-t * (0.9 + k * 0.9));
      }
      return s * env * gain;
    },
  };
}

function bass(freq, gain) {
  return {
    release: 0.25,
    sample(t, dur) {
      let env = Math.min(1, t / 0.01);
      if (t > dur) env *= Math.max(0, 1 - (t - dur) / 0.25);
      const s = Math.sin(TAU * freq * t) + Math.sin(TAU * freq * 2 * t) * 0.15;
      return s * env * gain;
    },
  };
}

function kick(gain) {
  return {
    release: 0.3,
    sample(t) {
      // Pitch sweeps 120 → 45 Hz; phase is the integral of that frequency.
      const phase = TAU * (45 * t + 75 * 0.04 * (1 - Math.exp(-t / 0.04)));
      return Math.sin(phase) * Math.exp(-t / 0.18) * gain;
    },
  };
}

function hat(gain, rand) {
  let lp = 0;
  return {
    release: 0.06,
    sample(t) {
      const n = rand() * 2 - 1;
      lp += 0.6 * (n - lp);
      return (n - lp) * Math.exp(-t / 0.025) * gain; // high-passed noise
    },
  };
}

// ------------------------------------------------------------------ effects

function lowpass(buf, cutoffHz) {
  const a = 1 - Math.exp((-TAU * cutoffHz) / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += a * (buf[i] - y);
    buf[i] = y;
  }
}

/** Small Schroeder reverb (4 combs + 2 allpasses), returns wet signal. */
function reverb(input, roomScale = 1) {
  const combs = [1557, 1617, 1491, 1422].map(d => ({ buf: new Float32Array(Math.round(d * roomScale)), i: 0, store: 0 }));
  const alls = [225, 556].map(d => ({ buf: new Float32Array(d), i: 0 }));
  const out = new Float32Array(input.length);
  const feedback = 0.8;
  const damp = 0.3;
  for (let n = 0; n < input.length; n++) {
    const x = input[n] * 0.25;
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * feedback;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    for (const a of alls) {
      const b = a.buf[a.i];
      const y = -acc + b;
      a.buf[a.i] = acc + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      acc = y;
    }
    out[n] = acc;
  }
  return out;
}

// ------------------------------------------------------------------ tracks

/** Calls schedule(buf, offsetSeconds) for each of 3 copies; returns the seamless middle copy. */
function render(loopSeconds, schedule, { wet = 0.3, cutoff = 6000, room = 1 } = {}) {
  const L = Math.round(loopSeconds * SR);
  const buf = new Float32Array(L * 3);
  for (let copy = 0; copy < 3; copy++) schedule(buf, copy * (L / SR));
  lowpass(buf, cutoff);
  const rev = reverb(buf, room);
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) out[i] = buf[L + i] * (1 - wet) + rev[L + i] * wet * 2.2;
  return out;
}

const TRACKS = [
  {
    file: 'calm-ambient.wav',
    name: 'Calm Ambient',
    render() {
      const bpm = 60;
      const bar = (60 / bpm) * 4;
      const prog = ['Cmaj7', 'Am7', 'Fmaj7', 'G6'];
      return render(prog.length * bar * 2, (buf, off) => {
        prog.forEach((c, i) => {
          const t = off + i * bar * 2;
          for (const m of CH[c]) addNote(buf, t, bar * 2, pad(midiHz(m), 0.05));
          // high shimmer: chord tones two octaves up, sparse
          CH[c].slice(1, 3).forEach((m, k) => addNote(buf, t + bar * (0.5 + k), bar * 0.5, pluck(midiHz(m + 24), 0.025, 1.2)));
        });
      }, { wet: 0.45, cutoff: 4000, room: 1.2 });
    },
  },
  {
    file: 'light-electronic-ambient.wav',
    name: 'Light Electronic Ambient',
    render() {
      const bpm = 96;
      const beat = 60 / bpm;
      const bar = beat * 4;
      const prog = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
      return render(prog.length * bar, (buf, off) => {
        prog.forEach((c, i) => {
          const t = off + i * bar;
          for (const m of CH[c]) addNote(buf, t, bar, pad(midiHz(m + 12), 0.035));
          addNote(buf, t, bar * 0.9, bass(midiHz(CH[c][0] - 12), 0.12));
          const arp = [0, 1, 2, 1, 0, 2, 1, 2];
          arp.forEach((k, j) => addNote(buf, t + (j * beat) / 2, beat / 2, pluck(midiHz(CH[c][k] + 24), 0.05, 0.3)));
          addNote(buf, t, 0.3, kick(0.18));
          addNote(buf, t + beat * 2, 0.3, kick(0.18));
        });
      }, { wet: 0.3, cutoff: 5000 });
    },
  },
  {
    file: 'soft-keys.wav',
    name: 'Soft Keys',
    render() {
      const bpm = 72;
      const beat = 60 / bpm;
      const bar = beat * 4;
      const prog = ['Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Dmaj7', 'Bm7', 'Gmaj7', 'A'];
      return render(prog.length * bar, (buf, off) => {
        prog.forEach((c, i) => {
          const t = off + i * bar;
          const notes = CH[c];
          for (const m of notes) addNote(buf, t, bar, pad(midiHz(m - 12), 0.025));
          [0, 1, 2, 3].forEach(b => {
            const m = notes[(b + (i % 2)) % notes.length] + 12;
            addNote(buf, t + b * beat, beat, keys(midiHz(m), 0.09));
          });
        });
      }, { wet: 0.35, cutoff: 5000, room: 1.1 });
    },
  },
  {
    file: 'tech-focus.wav',
    name: 'Tech Focus',
    render() {
      const bpm = 110;
      const beat = 60 / bpm;
      const bar = beat * 4;
      const prog = ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'Bm'];
      const rand = rng(1234);
      return render(prog.length * bar, (buf, off) => {
        prog.forEach((c, i) => {
          const t = off + i * bar;
          for (const m of CH[c]) addNote(buf, t, bar, pad(midiHz(m + 12), 0.025));
          // 16th-note muted pulse on the root/fifth
          for (let s = 0; s < 16; s++) {
            const m = CH[c][s % 4 === 2 ? 2 : 0] + 12;
            addNote(buf, t + (s * beat) / 4, beat / 4, pluck(midiHz(m), s % 4 === 0 ? 0.05 : 0.03, 0.09));
          }
          for (let b = 0; b < 4; b += 2) addNote(buf, t + b * beat, beat, bass(midiHz(CH[c][0] - 12), 0.11));
          for (let b = 0; b < 4; b++) addNote(buf, t + b * beat, 0.3, kick(b % 2 === 0 ? 0.17 : 0.1));
          for (let h = 0; h < 8; h++) addNote(buf, t + (h * beat) / 2 + beat / 4, 0.05, hat(0.04, rand));
        });
      }, { wet: 0.22, cutoff: 7000 });
    },
  },
];

// ------------------------------------------------------------------ output

function normalize(x) {
  let sum = 0;
  let peak = 0;
  for (const v of x) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const rms = Math.sqrt(sum / x.length);
  let gain = 10 ** (-18 / 20) / Math.max(rms, 1e-9); // -18 dBFS RMS: consistent level between tracks
  gain = Math.min(gain, 10 ** (-1 / 20) / Math.max(peak, 1e-9)); // never above -1 dBFS
  for (let i = 0; i < x.length; i++) x[i] *= gain;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const outDir = process.argv[2] ?? join(import.meta.dirname, '../../mobile/android/app/src/main/assets/music');
mkdirSync(outDir, { recursive: true });
for (const track of TRACKS) {
  const samples = track.render();
  normalize(samples);
  writeFileSync(join(outDir, track.file), wav(samples));
  console.log(`${track.file}  ${track.name}  ${(samples.length / SR).toFixed(2)} s  ${((samples.length * 2) / 1048576).toFixed(1)} MB`);
}
