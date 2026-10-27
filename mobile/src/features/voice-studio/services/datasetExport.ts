import { FileBridge } from '../../../services/native';
import { AppException } from '../../../services/native/errors';
import { paths } from '../../../services/storage/paths';
import { logger } from '../../../services/logging/logger';
import { nowIso } from '../../../services/db/database';
import { newId } from '../../../utils/id';
import { buildDatasetFiles } from '../../../domain/voice-dataset/dataset';
import { studioRepo, type VoiceProject } from './studioRepo';

export type DatasetExportResult = {
  path: string;
  fileName: string;
  sizeBytes: number;
  takeCount: number;
  speechMs: number;
};

const README = `VoiceStudio personal voice dataset
==================================

This archive contains recordings of one speaker, made with the VoiceStudio app,
and the consent the speaker confirmed in the app (see dataset.json).

  dataset.json   voice details, consent record, every take with its transcript
  metadata.csv   file|style|transcript  (pipe-separated, UTF-8, no header)
  wavs/          16-bit mono PCM WAV recordings

Train it with tools/voice-training in the VoiceStudio project:

  python prepare_dataset.py --dataset <this zip> --out work/my-voice
  python train.py --data work/my-voice

Only train voices of people who have given their permission.
`;

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'my-voice';
}

/**
 * Builds <name>.voicedataset.zip in cache/share/ (temporary: it holds the
 * speaker's recordings and consent, so it is never kept with normal exports).
 * The caller saves or shares it.
 */
export async function exportDataset(project: VoiceProject): Promise<DatasetExportResult> {
  const recordings = await studioRepo.recordings(project.id);
  const build = FileBridge.getBuildInfo();
  const { metadataCsv, datasetJson, stats } = buildDatasetFiles(
    project,
    recordings,
    build.versionName,
    nowIso(),
  );
  if (datasetJson.takes.length === 0) {
    throw new AppException('export_failed', 'No usable recordings');
  }

  const byPrompt = new Map(recordings.map(r => [r.promptId, r]));
  const audioBytes = recordings.length * 48000 * 2 * 6; // rough upper bound
  if ((await FileBridge.freeSpaceBytes()) < audioBytes * 1.2 + 50 * 1024 * 1024) {
    throw new AppException('insufficient_storage');
  }

  const work = `${paths().cacheDir}/dataset_${newId()}`;
  const fileName = `${slug(project.name)}.voicedataset.zip`;
  const out = `${paths().share}/${newId('ds_')}_${fileName}`;
  try {
    await FileBridge.mkdirs(work);
    await FileBridge.writeTextAtomic(`${work}/dataset.json`, JSON.stringify(datasetJson, null, 2));
    await FileBridge.writeTextAtomic(`${work}/metadata.csv`, `${metadataCsv}\n`);
    await FileBridge.writeTextAtomic(`${work}/README.txt`, README);
    const entries = [
      { sourcePath: `${work}/README.txt`, zipPath: 'README.txt' },
      { sourcePath: `${work}/dataset.json`, zipPath: 'dataset.json' },
      { sourcePath: `${work}/metadata.csv`, zipPath: 'metadata.csv' },
      ...datasetJson.takes.map(take => {
        const rec = byPrompt.get(take.promptId);
        if (!rec) {
          throw new AppException('export_failed', `Missing recording ${take.promptId}`);
        }
        return { sourcePath: rec.filePath, zipPath: take.file };
      }),
    ];
    await FileBridge.mkdirs(paths().share);
    const zip = await FileBridge.createZip(entries, out);
    logger.info('studio.dataset_exported', { takes: datasetJson.takes.length, bytes: zip.sizeBytes });
    return {
      path: out,
      fileName,
      sizeBytes: zip.sizeBytes,
      takeCount: datasetJson.takes.length,
      speechMs: stats.speechMs,
    };
  } finally {
    FileBridge.deletePath(work).catch(() => undefined);
  }
}
