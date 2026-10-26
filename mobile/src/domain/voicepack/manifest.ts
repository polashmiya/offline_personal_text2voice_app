import { z } from 'zod';
import type { VoiceProfile } from '../types';

/**
 * .voicepack format v1 — a zip archive:
 *
 *   manifest.json        this schema
 *   model/…              ONNX model, tokens, optional lexicon / espeak-ng-data
 *   dictionary/…         optional pronunciation entries
 *   assets/preview.wav   optional
 *
 * Every file except manifest.json must be listed in `checksums` (SHA-256).
 * Packages contain data only; nothing inside is ever executed.
 */

export const MAX_PACKAGE_BYTES = 1.5 * 1024 * 1024 * 1024;
export const MAX_PACKAGE_ENTRIES = 5000;

const relativePath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    p => !p.startsWith('/') && !p.includes('..') && !p.includes('\\') && !p.includes(':'),
    'Unsafe path',
  );

const handling = z.enum(['native', 'transliterate']);

export const voicePackManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, 'Invalid voice id'),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500).optional(),
    version: z.string().min(1).max(32),
    engine: z.enum(['vits', 'kokoro', 'matcha']),
    languages: z.array(z.enum(['bn', 'en'])).min(1),
    languageHandling: z.object({ bn: handling.optional(), en: handling.optional() }),
    locale: z.string().max(16).optional(),
    accent: z.string().max(60).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    quality: z.enum(['fast', 'balanced', 'studio']),
    sampleRate: z.number().int().min(8000).max(48000),
    maxChunkChars: z.number().int().min(20).max(1000).default(200),
    personal: z.boolean().default(false),
    lang: z.string().max(16).optional(),
    files: z.object({
      model: relativePath,
      tokens: relativePath,
      lexicon: relativePath.optional(),
      dataDir: relativePath.optional(),
      dictDir: relativePath.optional(),
      voices: relativePath.optional(),
      vocoder: relativePath.optional(),
    }),
    speakers: z
      .array(
        z.object({
          id: z.number().int().min(0).max(10000),
          key: z.string().regex(/^[a-z0-9_-]{1,32}$/),
          label: z.string().min(1).max(40),
        }),
      )
      .min(1),
    defaults: z
      .object({
        noiseScale: z.number().min(0).max(2).default(0.667),
        noiseScaleW: z.number().min(0).max(2).default(0.8),
        lengthScale: z.number().min(0.5).max(2).default(1),
      })
      .default({ noiseScale: 0.667, noiseScaleW: 0.8, lengthScale: 1 }),
    supports: z.object({ speed: z.boolean(), pitch: z.boolean() }),
    license: z.object({
      name: z.string().min(1).max(200),
      url: z.string().max(300).optional(),
      commercialUse: z.boolean(),
      attribution: z.string().max(500).optional(),
    }),
    consent: z
      .object({ confirmed: z.literal(true), confirmedAt: z.string().max(40) })
      .optional(),
    checksums: z.record(relativePath, z.string().regex(/^[a-f0-9]{64}$/)),
    createdAt: z.string().max(40),
  })
  .refine(m => !m.personal || !!m.consent, {
    message: 'Personal voices must include a consent record',
    path: ['consent'],
  })
  .refine(m => m.languages.every(lang => m.languageHandling[lang] === 'native'), {
    message: 'Every declared language must be handled natively',
    path: ['languageHandling'],
  })
  .refine(m => m.engine !== 'kokoro' || !!m.files.voices, {
    message: 'Kokoro voices need a voices file',
    path: ['files', 'voices'],
  })
  .refine(m => m.engine !== 'matcha' || !!m.files.vocoder, {
    message: 'Matcha voices need a vocoder',
    path: ['files', 'vocoder'],
  });

export type VoicePackManifest = z.infer<typeof voicePackManifestSchema>;

export function parseManifest(json: string):
  | { ok: true; manifest: VoicePackManifest }
  | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'manifest.json is not valid JSON' };
  }
  const result = voicePackManifestSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, reason: `${issue.path.join('.') || 'manifest'}: ${issue.message}` };
  }
  return { ok: true, manifest: result.data };
}

/** Files the manifest references directly (directories are checked by prefix). */
export function referencedFiles(m: VoicePackManifest): string[] {
  return [m.files.model, m.files.tokens, m.files.lexicon, m.files.voices, m.files.vocoder].filter(
    (p): p is string => !!p,
  );
}

export function toVoiceProfile(
  m: VoicePackManifest,
  installPath: string,
  sizeBytes: number,
  installedAt: string,
): VoiceProfile {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    languages: m.languages,
    languageHandling: m.languageHandling,
    gender: m.gender,
    locale: m.locale,
    accent: m.accent,
    engine: m.engine,
    modelVersion: m.version,
    quality: m.quality,
    sampleRate: m.sampleRate,
    styles: m.speakers.map(s => ({ speakerId: s.id, key: s.key, label: s.label })),
    supportsSpeed: m.supports.speed,
    supportsPitch: m.supports.pitch,
    maxChunkChars: m.maxChunkChars,
    isPersonal: m.personal,
    installed: true,
    installPath,
    sizeBytes,
    license: m.license,
    installedAt,
  };
}
