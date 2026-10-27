import type { Scalar } from '@op-engineering/op-sqlite';
import { parseTimeline, type TimedSpan } from '../../domain/timeline/timeline';
import { nowIso, query, run } from './database';
import type { PronunciationEntry } from '../../domain/text/pronunciation';
import type { GenerationStatus, LanguageMode, VoiceProfile } from '../../domain/types';
import { parseManifest, toVoiceProfile, type VoicePackManifest } from '../../domain/voicepack/manifest';
import { logger } from '../logging/logger';

// ------------------------------------------------------------------ settings

export const settingsRepo = {
  async getAll(): Promise<Record<string, string>> {
    const rows = await query<{ key: string; value: string }>('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
  async set(key: string, value: string) {
    await run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  },
};

// ------------------------------------------------------------------ voices

type VoiceRow = {
  id: string;
  manifest_json: string;
  install_path: string;
  size_bytes: number;
  installed_at: string;
};

export const voicesRepo = {
  async list(): Promise<VoiceProfile[]> {
    const rows = await query<VoiceRow>('SELECT * FROM voices ORDER BY is_personal DESC, name COLLATE NOCASE');
    const voices: VoiceProfile[] = [];
    for (const row of rows) {
      const parsed = parseManifest(row.manifest_json);
      if (parsed.ok) {
        voices.push(toVoiceProfile(parsed.manifest, row.install_path, Number(row.size_bytes), row.installed_at));
      } else {
        logger.warn('voice.manifest_invalid', { voiceId: row.id });
      }
    }
    return voices;
  },
  async manifest(id: string): Promise<VoicePackManifest | null> {
    const rows = await query<VoiceRow>('SELECT manifest_json FROM voices WHERE id = ?', [id]);
    if (!rows.length) {
      return null;
    }
    const parsed = parseManifest(rows[0].manifest_json);
    return parsed.ok ? parsed.manifest : null;
  },
  async upsert(manifest: VoicePackManifest, installPath: string, sizeBytes: number) {
    await run(
      `INSERT INTO voices (id, name, manifest_json, install_path, size_bytes, is_personal, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, manifest_json = excluded.manifest_json,
         install_path = excluded.install_path, size_bytes = excluded.size_bytes,
         is_personal = excluded.is_personal, installed_at = excluded.installed_at`,
      [manifest.id, manifest.name, JSON.stringify(manifest), installPath, sizeBytes, manifest.personal ? 1 : 0, nowIso()],
    );
  },
  async remove(id: string) {
    await run('DELETE FROM voices WHERE id = ?', [id]);
  },
};

// ------------------------------------------------------------------ projects

export type ProjectSettings = {
  voiceId: string | null;
  language: LanguageMode;
  styleKey: string | null;
  speed: number;
};

export type Project = {
  id: string;
  title: string;
  text: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
};

type ProjectRow = { id: string; title: string; text: string; settings_json: string; created_at: string; updated_at: string };

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  title: r.title,
  text: r.text,
  settings: JSON.parse(r.settings_json) as ProjectSettings,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const projectsRepo = {
  async list(search = ''): Promise<Project[]> {
    const like = `%${search.trim()}%`;
    const rows = await query<ProjectRow>(
      `SELECT * FROM projects WHERE title LIKE ? OR text LIKE ? ORDER BY updated_at DESC LIMIT 500`,
      [like, like],
    );
    return rows.map(toProject);
  },
  async get(id: string): Promise<Project | null> {
    const rows = await query<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
    return rows.length ? toProject(rows[0]) : null;
  },
  async save(project: Omit<Project, 'createdAt' | 'updatedAt'>) {
    const now = nowIso();
    await run(
      `INSERT INTO projects (id, title, text, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, text = excluded.text,
         settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
      [project.id, project.title, project.text, JSON.stringify(project.settings), now, now],
    );
  },
  async rename(id: string, title: string) {
    await run('UPDATE projects SET title = ?, updated_at = ? WHERE id = ?', [title, nowIso(), id]);
  },
  async remove(id: string) {
    await run('DELETE FROM projects WHERE id = ?', [id]);
    await run('UPDATE generations SET project_id = NULL WHERE project_id = ?', [id]);
    await run('DELETE FROM pronunciations WHERE project_id = ?', [id]);
  },
};

// ------------------------------------------------------------------ generations (jobs + history)

export type Generation = {
  id: string;
  projectId: string | null;
  title: string;
  text: string;
  voiceId: string;
  voiceName: string;
  language: LanguageMode;
  styleKey: string | null;
  speed: number;
  audioPath: string | null;
  durationMs: number | null;
  sampleRate: number | null;
  status: GenerationStatus;
  progress: number;
  totalChunks: number;
  errorCode: string | null;
  metrics: GenerationMetrics | null;
  /** Sentence timing in the generated audio; empty for older generations. */
  timeline: TimedSpan[];
  createdAt: string;
  completedAt: string | null;
};

export type GenerationMetrics = {
  loadMs: number;
  firstAudioMs: number;
  synthesisMs: number;
  mergeMs: number;
  audioMs: number;
  realTimeFactor: number;
};

type GenerationRow = Record<string, Scalar>;

const toGeneration = (r: GenerationRow): Generation => ({
  id: String(r.id),
  projectId: (r.project_id as string) ?? null,
  title: String(r.title),
  text: String(r.text),
  voiceId: String(r.voice_id),
  voiceName: String(r.voice_name),
  language: r.language as LanguageMode,
  styleKey: (r.style as string) ?? null,
  speed: Number(r.speed),
  audioPath: (r.audio_path as string) ?? null,
  durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
  sampleRate: r.sample_rate == null ? null : Number(r.sample_rate),
  status: r.status as GenerationStatus,
  progress: Number(r.progress),
  totalChunks: Number(r.total_chunks),
  errorCode: (r.error_code as string) ?? null,
  metrics: r.metrics_json ? (JSON.parse(String(r.metrics_json)) as GenerationMetrics) : null,
  timeline: parseTimeline(r.timeline_json),
  createdAt: String(r.created_at),
  completedAt: (r.completed_at as string) ?? null,
});

export const generationsRepo = {
  async create(g: Pick<Generation, 'id' | 'projectId' | 'title' | 'text' | 'voiceId' | 'voiceName' | 'language' | 'styleKey' | 'speed' | 'totalChunks'>) {
    await run(
      `INSERT INTO generations (id, project_id, title, text, voice_id, voice_name, language, style, speed,
         status, progress, total_chunks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing', 0, ?, ?)`,
      [g.id, g.projectId, g.title, g.text, g.voiceId, g.voiceName, g.language, g.styleKey, g.speed, g.totalChunks, nowIso()],
    );
  },
  async updateProgress(id: string, status: GenerationStatus, progress: number) {
    await run('UPDATE generations SET status = ?, progress = ? WHERE id = ?', [status, progress, id]);
  },
  async complete(
    id: string,
    audioPath: string,
    durationMs: number,
    sampleRate: number,
    metrics: GenerationMetrics,
    timeline: TimedSpan[],
  ) {
    await run(
      `UPDATE generations SET status = 'completed', progress = 1, audio_path = ?, duration_ms = ?,
         sample_rate = ?, metrics_json = ?, timeline_json = ?, completed_at = ? WHERE id = ?`,
      [audioPath, durationMs, sampleRate, JSON.stringify(metrics), JSON.stringify(timeline), nowIso(), id],
    );
  },
  async fail(id: string, status: 'failed' | 'cancelled' | 'interrupted', errorCode: string | null) {
    await run('UPDATE generations SET status = ?, error_code = ?, audio_path = NULL WHERE id = ?', [status, errorCode, id]);
  },
  async list(search = ''): Promise<Generation[]> {
    const like = `%${search.trim()}%`;
    const rows = await query(
      `SELECT * FROM generations WHERE status = 'completed' AND (title LIKE ? OR text LIKE ? OR voice_name LIKE ?)
       ORDER BY created_at DESC LIMIT 500`,
      [like, like, like],
    );
    return rows.map(toGeneration);
  },
  async get(id: string): Promise<Generation | null> {
    const rows = await query('SELECT * FROM generations WHERE id = ?', [id]);
    return rows.length ? toGeneration(rows[0]) : null;
  },
  async rename(id: string, title: string) {
    await run('UPDATE generations SET title = ? WHERE id = ?', [title, id]);
  },
  async remove(id: string) {
    await run('DELETE FROM generations WHERE id = ?', [id]);
    await run('DELETE FROM exports WHERE generation_id = ?', [id]);
  },
  /** Jobs that were running when the app died. */
  async unfinished(): Promise<Generation[]> {
    const rows = await query(
      `SELECT * FROM generations WHERE status IN ('queued', 'preparing', 'generating', 'mixing')`,
    );
    return rows.map(toGeneration);
  },
  async audioPaths(): Promise<string[]> {
    const rows = await query<{ audio_path: string }>('SELECT audio_path FROM generations WHERE audio_path IS NOT NULL');
    return rows.map(r => r.audio_path);
  },
};

// ------------------------------------------------------------------ exports

export const exportsRepo = {
  async add(e: { id: string; generationId: string; format: string; bitrate: number | null; fileName: string; filePath: string; sizeBytes: number }) {
    await run(
      `INSERT INTO exports (id, generation_id, format, bitrate, file_name, file_path, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.generationId, e.format, e.bitrate, e.fileName, e.filePath, e.sizeBytes, nowIso()],
    );
  },
  async forGeneration(generationId: string) {
    return query<{ id: string; format: string; file_name: string; created_at: string }>(
      'SELECT id, format, file_name, created_at FROM exports WHERE generation_id = ? ORDER BY created_at DESC',
      [generationId],
    );
  },
};

// ------------------------------------------------------------------ pronunciation dictionary

type PronunciationRow = {
  id: string;
  term: string;
  replacement: string;
  language: string;
  case_sensitive: number;
  enabled: number;
  project_id: string | null;
};

export const pronunciationsRepo = {
  async list(search = ''): Promise<PronunciationEntry[]> {
    const like = `%${search.trim()}%`;
    const rows = await query<PronunciationRow>(
      'SELECT * FROM pronunciations WHERE term LIKE ? OR replacement LIKE ? ORDER BY term COLLATE NOCASE',
      [like, like],
    );
    return rows.map(r => ({
      id: r.id,
      term: r.term,
      replacement: r.replacement,
      language: r.language as PronunciationEntry['language'],
      caseSensitive: !!r.case_sensitive,
      enabled: !!r.enabled,
      projectId: r.project_id,
    }));
  },
  async save(e: PronunciationEntry) {
    const now = nowIso();
    await run(
      `INSERT INTO pronunciations (id, term, replacement, language, case_sensitive, enabled, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET term = excluded.term, replacement = excluded.replacement,
         language = excluded.language, case_sensitive = excluded.case_sensitive,
         enabled = excluded.enabled, project_id = excluded.project_id, updated_at = excluded.updated_at`,
      [e.id, e.term.trim(), e.replacement.trim(), e.language, e.caseSensitive ? 1 : 0, e.enabled ? 1 : 0, e.projectId ?? null, now, now],
    );
  },
  async remove(id: string) {
    await run('DELETE FROM pronunciations WHERE id = ?', [id]);
  },
};

// ------------------------------------------------------------------ music library

export type MusicTrack = {
  id: string;
  name: string;
  filePath: string;
  durationMs: number;
  sampleRate: number;
  /** 'user' = imported by the user; 'bundled' = shipped with a redistributable license. */
  source: 'user' | 'bundled';
  license: string | null;
  attribution: string | null;
};

type MusicRow = {
  id: string;
  name: string;
  file_path: string;
  duration_ms: number;
  sample_rate: number;
  source: string;
  license: string | null;
  attribution: string | null;
};

const toTrack = (r: MusicRow): MusicTrack => ({
  id: r.id,
  name: r.name,
  filePath: r.file_path,
  durationMs: Number(r.duration_ms),
  sampleRate: Number(r.sample_rate),
  source: r.source === 'bundled' ? 'bundled' : 'user',
  license: r.license,
  attribution: r.attribution,
});

export const musicRepo = {
  async list(): Promise<MusicTrack[]> {
    const rows = await query<MusicRow>("SELECT * FROM music_tracks ORDER BY source = 'bundled' DESC, created_at DESC");
    return rows.map(toTrack);
  },
  async get(id: string): Promise<MusicTrack | null> {
    const rows = await query<MusicRow>('SELECT * FROM music_tracks WHERE id = ?', [id]);
    return rows.length ? toTrack(rows[0]) : null;
  },
  async add(t: MusicTrack) {
    await run(
      `INSERT INTO music_tracks (id, name, file_path, duration_ms, sample_rate, source, license, attribution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.id, t.name, t.filePath, t.durationMs, t.sampleRate, t.source, t.license, t.attribution, nowIso()],
    );
  },
  async upsert(t: MusicTrack) {
    await run(
      `INSERT INTO music_tracks (id, name, file_path, duration_ms, sample_rate, source, license, attribution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, file_path = excluded.file_path,
         duration_ms = excluded.duration_ms, sample_rate = excluded.sample_rate, source = excluded.source,
         license = excluded.license, attribution = excluded.attribution`,
      [t.id, t.name, t.filePath, t.durationMs, t.sampleRate, t.source, t.license, t.attribution, nowIso()],
    );
  },
  async remove(id: string) {
    await run('DELETE FROM music_tracks WHERE id = ?', [id]);
  },
};

// ------------------------------------------------------------------ privacy

export async function deleteAllUserData() {
  await run('DELETE FROM generations');
  await run('DELETE FROM exports');
  await run('DELETE FROM projects');
  await run('DELETE FROM pronunciations');
  await run("DELETE FROM music_tracks WHERE source = 'user'");
}
