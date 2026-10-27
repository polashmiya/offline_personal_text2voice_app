import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type AppPaths = {
  filesDir: string;
  cacheDir: string;
};

export type PickedFile = {
  name: string;
  sizeBytes: number;
  mimeType: string;
  /** Copy of the picked document inside the app cache. */
  cachedPath: string;
};

export type FileEntry = {
  name: string;
  path: string;
  sizeBytes: number;
  isDirectory: boolean;
  modifiedAt: number;
};

export type ExtractResult = {
  fileCount: number;
  totalBytes: number;
};

export type ZipEntry = {
  /** File inside app storage. */
  sourcePath: string;
  /** Path inside the archive (relative, forward slashes). */
  zipPath: string;
};

export type ZipResult = {
  fileCount: number;
  sizeBytes: number;
};

export type BuildInfo = {
  versionName: string;
  flavor: string;
  allowNetwork: boolean;
};

export interface Spec extends TurboModule {
  getPaths(): AppPaths;
  getBuildInfo(): BuildInfo;
  /** Opens the system picker. Resolves null when the user cancels. */
  pickFile(mimeTypes: Array<string>, maxBytes: number): Promise<PickedFile | null>;
  /** Lets the user choose where to save a copy. Resolves the document URI, or null when cancelled. */
  saveToUserLocation(sourcePath: string, suggestedName: string, mimeType: string): Promise<string | null>;
  shareFile(path: string, mimeType: string, title: string): Promise<void>;

  extractZipSafely(
    zipPath: string,
    destDir: string,
    maxTotalBytes: number,
    maxEntries: number,
  ): Promise<ExtractResult>;
  /** Writes a zip archive (WAV stored, text deflated) inside app storage. */
  createZip(entries: Array<ZipEntry>, outputPath: string): Promise<ZipResult>;
  sha256(path: string): Promise<string>;

  readText(path: string): Promise<string>;
  writeTextAtomic(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Copies a file bundled in the APK (assets/) into app storage. Resolves the byte count. */
  copyAsset(assetPath: string, destPath: string): Promise<number>;
  /** Text another app shared into this one since the last call, or null. */
  takeSharedText(): Promise<string | null>;
  mkdirs(path: string): Promise<void>;
  deletePath(path: string): Promise<void>;
  movePath(from: string, to: string): Promise<void>;
  listDir(path: string): Promise<Array<FileEntry>>;
  directorySize(path: string): Promise<number>;
  freeSpaceBytes(): Promise<number>;
  keepScreenOn(enabled: boolean): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('FileBridge');
