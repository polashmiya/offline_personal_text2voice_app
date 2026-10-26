import { FileBridge } from '../native';

/**
 * App-private storage layout. Large binaries live on disk; only metadata
 * goes into SQLite.
 *
 *   files/voices/<voiceId>/      installed voice packages
 *   files/generated/<id>.wav     final generated audio (history)
 *   files/exports/               exported files (shareable via FileProvider)
 *   files/drafts/                editor auto-save
 *   files/studio/<projectId>/    personal voice recordings (WAV)
 *   cache/jobs/<jobId>/          per-generation chunk audio (temporary)
 *   cache/imports/               copies of picked files (temporary)
 *   cache/staging/               voice packages being validated
 */
let cached: ReturnType<typeof build> | null = null;

function build() {
  const { filesDir, cacheDir } = FileBridge.getPaths();
  return {
    filesDir,
    cacheDir,
    voices: `${filesDir}/voices`,
    generated: `${filesDir}/generated`,
    exports: `${filesDir}/exports`,
    drafts: `${filesDir}/drafts`,
    jobs: `${cacheDir}/jobs`,
    imports: `${cacheDir}/imports`,
    staging: `${cacheDir}/staging`,
    studio: `${filesDir}/studio`,
    studioDir: (projectId: string) => `${filesDir}/studio/${projectId}`,
    voiceDir: (voiceId: string) => `${filesDir}/voices/${voiceId}`,
    jobDir: (jobId: string) => `${cacheDir}/jobs/${jobId}`,
    generatedAudio: (id: string) => `${filesDir}/generated/${id}.wav`,
  };
}

export function paths() {
  if (!cached) {
    cached = build();
  }
  return cached;
}

/** Resolves a package-relative path safely (no "..", no absolute paths). */
export function joinInside(root: string, relative: string): string {
  if (!relative || relative.startsWith('/') || relative.includes('..') || relative.includes('\\')) {
    throw new Error(`Unsafe relative path: ${relative}`);
  }
  return `${root}/${relative}`;
}
