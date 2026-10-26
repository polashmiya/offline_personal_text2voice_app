import { open, type DB, type Scalar } from '@op-engineering/op-sqlite';
import { logger } from '../logging/logger';

/**
 * Local SQLite database: structured metadata only. Audio and model files
 * live on disk (see services/storage/paths.ts).
 */

const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE voices (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       manifest_json TEXT NOT NULL,
       install_path TEXT NOT NULL,
       size_bytes INTEGER NOT NULL,
       is_personal INTEGER NOT NULL DEFAULT 0,
       installed_at TEXT NOT NULL
     )`,
    `CREATE TABLE projects (
       id TEXT PRIMARY KEY,
       title TEXT NOT NULL,
       text TEXT NOT NULL,
       settings_json TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE generations (
       id TEXT PRIMARY KEY,
       project_id TEXT,
       title TEXT NOT NULL,
       text TEXT NOT NULL,
       voice_id TEXT NOT NULL,
       voice_name TEXT NOT NULL,
       language TEXT NOT NULL,
       style TEXT,
       speed REAL NOT NULL,
       audio_path TEXT,
       duration_ms INTEGER,
       sample_rate INTEGER,
       status TEXT NOT NULL,
       progress REAL NOT NULL DEFAULT 0,
       total_chunks INTEGER NOT NULL DEFAULT 0,
       error_code TEXT,
       metrics_json TEXT,
       created_at TEXT NOT NULL,
       completed_at TEXT
     )`,
    `CREATE INDEX idx_generations_created ON generations(created_at DESC)`,
    `CREATE INDEX idx_generations_status ON generations(status)`,
    `CREATE TABLE exports (
       id TEXT PRIMARY KEY,
       generation_id TEXT NOT NULL,
       format TEXT NOT NULL,
       bitrate INTEGER,
       file_name TEXT NOT NULL,
       file_path TEXT NOT NULL,
       size_bytes INTEGER,
       created_at TEXT NOT NULL
     )`,
    `CREATE TABLE pronunciations (
       id TEXT PRIMARY KEY,
       term TEXT NOT NULL,
       replacement TEXT NOT NULL,
       language TEXT NOT NULL DEFAULT 'any',
       case_sensitive INTEGER NOT NULL DEFAULT 0,
       enabled INTEGER NOT NULL DEFAULT 1,
       project_id TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
  ],
  // v2 — Personal Voice Studio
  [
    `CREATE TABLE voice_projects (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       speaker_name TEXT NOT NULL,
       gender TEXT,
       accent TEXT,
       description TEXT,
       consent_text TEXT NOT NULL,
       consent_at TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE TABLE recordings (
       id TEXT PRIMARY KEY,
       voice_project_id TEXT NOT NULL,
       prompt_id TEXT NOT NULL,
       style TEXT NOT NULL,
       text TEXT NOT NULL,
       file_path TEXT NOT NULL,
       duration_ms INTEGER NOT NULL,
       speech_ms INTEGER NOT NULL,
       sample_rate INTEGER NOT NULL,
       verdict TEXT NOT NULL,
       analysis_json TEXT NOT NULL,
       created_at TEXT NOT NULL,
       UNIQUE (voice_project_id, prompt_id)
     )`,
    `CREATE INDEX idx_recordings_project ON recordings(voice_project_id)`,
  ],
];

let db: DB | null = null;
let ready: Promise<void> | null = null;

async function migrate(database: DB) {
  await database.execute('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const result = await database.execute('SELECT version FROM schema_version LIMIT 1');
  const current = result.rows.length ? Number(result.rows[0].version) : 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await database.transaction(async tx => {
      for (const statement of MIGRATIONS[v]) {
        await tx.execute(statement);
      }
      await tx.execute('DELETE FROM schema_version');
      await tx.execute('INSERT INTO schema_version (version) VALUES (?)', [v + 1]);
    });
    logger.info('db.migrated', { version: v + 1 });
  }
}

export function initDatabase(): Promise<void> {
  if (!ready) {
    db = open({ name: 'voicestudio.db' });
    ready = (async () => {
      await db!.execute('PRAGMA journal_mode = WAL');
      await db!.execute('PRAGMA foreign_keys = ON');
      await migrate(db!);
    })();
  }
  return ready;
}

function database(): DB {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export type Row = Record<string, Scalar>;

export async function query<T = Row>(sql: string, params: Scalar[] = []): Promise<T[]> {
  await initDatabase();
  const result = await database().execute(sql, params);
  return result.rows as unknown as T[];
}

export async function run(sql: string, params: Scalar[] = []): Promise<number> {
  await initDatabase();
  const result = await database().execute(sql, params);
  return result.rowsAffected;
}

export async function transaction(fn: (exec: (sql: string, params?: Scalar[]) => Promise<void>) => Promise<void>) {
  await initDatabase();
  await database().transaction(async tx => {
    await fn(async (sql, params) => {
      await tx.execute(sql, params);
    });
  });
}

export const nowIso = () => new Date().toISOString();
