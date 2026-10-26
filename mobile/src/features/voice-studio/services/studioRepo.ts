import { nowIso, query, run } from '../../../services/db/database';
import type { DatasetTake } from '../../../domain/voice-dataset/dataset';
import type { TakeIssue, TakeVerdict } from '../../../domain/voice-dataset/quality';
import type { PromptCategory, StyleKey } from '../prompts/types';

export type VoiceProject = {
  id: string;
  name: string;
  speakerName: string;
  gender: 'male' | 'female' | 'other' | null;
  accent: string | null;
  description: string | null;
  consentText: string;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Recording = DatasetTake & {
  id: string;
  projectId: string;
  filePath: string;
  createdAt: string;
};

type ProjectRow = {
  id: string;
  name: string;
  speaker_name: string;
  gender: string | null;
  accent: string | null;
  description: string | null;
  consent_text: string;
  consent_at: string;
  created_at: string;
  updated_at: string;
};

type RecordingRow = {
  id: string;
  voice_project_id: string;
  prompt_id: string;
  style: string;
  text: string;
  file_path: string;
  duration_ms: number;
  speech_ms: number;
  sample_rate: number;
  verdict: string;
  analysis_json: string;
  created_at: string;
};

const toProject = (r: ProjectRow): VoiceProject => ({
  id: r.id,
  name: r.name,
  speakerName: r.speaker_name,
  gender: (r.gender as VoiceProject['gender']) ?? null,
  accent: r.accent ?? null,
  description: r.description ?? null,
  consentText: r.consent_text,
  consentAt: r.consent_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

type StoredAnalysis = { category: PromptCategory; issues: TakeIssue[] };

const toRecording = (r: RecordingRow): Recording => {
  const extra = JSON.parse(r.analysis_json) as StoredAnalysis;
  return {
    id: r.id,
    projectId: r.voice_project_id,
    promptId: r.prompt_id,
    style: r.style as StyleKey,
    category: extra.category,
    text: r.text,
    filePath: r.file_path,
    durationMs: Number(r.duration_ms),
    speechMs: Number(r.speech_ms),
    sampleRate: Number(r.sample_rate),
    verdict: r.verdict as TakeVerdict,
    issues: extra.issues ?? [],
    createdAt: r.created_at,
  };
};

export const studioRepo = {
  async listProjects(): Promise<VoiceProject[]> {
    const rows = await query<ProjectRow>('SELECT * FROM voice_projects ORDER BY updated_at DESC');
    return rows.map(toProject);
  },
  async getProject(id: string): Promise<VoiceProject | null> {
    const rows = await query<ProjectRow>('SELECT * FROM voice_projects WHERE id = ?', [id]);
    return rows.length ? toProject(rows[0]) : null;
  },
  async createProject(p: Omit<VoiceProject, 'createdAt' | 'updatedAt'>) {
    const now = nowIso();
    await run(
      `INSERT INTO voice_projects (id, name, speaker_name, gender, accent, description, consent_text, consent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.name, p.speakerName, p.gender, p.accent, p.description, p.consentText, p.consentAt, now, now],
    );
  },
  async deleteProject(id: string) {
    await run('DELETE FROM recordings WHERE voice_project_id = ?', [id]);
    await run('DELETE FROM voice_projects WHERE id = ?', [id]);
  },
  async recordings(projectId: string): Promise<Recording[]> {
    const rows = await query<RecordingRow>('SELECT * FROM recordings WHERE voice_project_id = ? ORDER BY prompt_id', [
      projectId,
    ]);
    return rows.map(toRecording);
  },
  /** One take per prompt: a new take replaces the previous one. Returns the replaced file, if any. */
  async saveRecording(rec: Omit<Recording, 'createdAt'>): Promise<string | null> {
    const previous = await query<{ file_path: string }>(
      'SELECT file_path FROM recordings WHERE voice_project_id = ? AND prompt_id = ?',
      [rec.projectId, rec.promptId],
    );
    const analysis: StoredAnalysis = { category: rec.category, issues: rec.issues };
    await run(
      `INSERT INTO recordings (id, voice_project_id, prompt_id, style, text, file_path, duration_ms, speech_ms,
         sample_rate, verdict, analysis_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(voice_project_id, prompt_id) DO UPDATE SET id = excluded.id, style = excluded.style,
         text = excluded.text, file_path = excluded.file_path, duration_ms = excluded.duration_ms,
         speech_ms = excluded.speech_ms, sample_rate = excluded.sample_rate, verdict = excluded.verdict,
         analysis_json = excluded.analysis_json, created_at = excluded.created_at`,
      [
        rec.id,
        rec.projectId,
        rec.promptId,
        rec.style,
        rec.text,
        rec.filePath,
        rec.durationMs,
        rec.speechMs,
        rec.sampleRate,
        rec.verdict,
        JSON.stringify(analysis),
        nowIso(),
      ],
    );
    await run('UPDATE voice_projects SET updated_at = ? WHERE id = ?', [nowIso(), rec.projectId]);
    const old = previous[0]?.file_path;
    return old && old !== rec.filePath ? old : null;
  },
  async deleteRecording(projectId: string, promptId: string) {
    await run('DELETE FROM recordings WHERE voice_project_id = ? AND prompt_id = ?', [projectId, promptId]);
  },
  async deleteAll() {
    await run('DELETE FROM recordings');
    await run('DELETE FROM voice_projects');
  },
};
