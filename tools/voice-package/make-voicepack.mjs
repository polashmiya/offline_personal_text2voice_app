#!/usr/bin/env node
/**
 * Builds a .voicepack (zip) from a sherpa-onnx compatible model folder and a
 * voice config. No dependencies — Node 22+ only.
 *
 *   node tools/voice-package/make-voicepack.mjs \
 *     --src  path/to/vits-mimic3-bn-multi_low \
 *     --config models/voices/bn-mimic3-multi-low.json \
 *     --out  dist/bn-mimic3-multi-low.voicepack
 *
 * The config is the manifest without `checksums`/`createdAt`, plus `include`:
 * a map of package paths → source paths (files or folders, relative to --src).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    out[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  for (const key of ['src', 'config', 'out']) {
    if (!out[key]) {
      console.error(`Missing --${key}`);
      process.exit(2);
    }
  }
  return out;
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function safeRel(path) {
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes(':')) {
    throw new Error(`Unsafe package path: ${path}`);
  }
  return path;
}

/** Minimal zip writer: STORE for already-compressed/large binaries, DEFLATE otherwise. */
class ZipWriter {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.fd = openSync(path, 'w');
    this.offset = 0;
    this.central = [];
  }
  write(buf) {
    writeSync(this.fd, buf);
    this.offset += buf.length;
  }
  add(name, data) {
    const nameBuf = Buffer.from(name, 'utf8');
    const store = data.length > 8 * 1024 * 1024 || name.endsWith('.onnx');
    const body = store ? data : deflateRawSync(data, { level: 9 });
    const method = store ? 0 : 8;
    const crc = crc32(data) >>> 0;
    if (data.length >= 0xffffffff || this.offset >= 0xffffffff) {
      throw new Error('Package too large for zip32');
    }
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0x21, 12); // date: 1980-01-01 (deterministic output)
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    const localOffset = this.offset;
    this.write(header);
    this.write(nameBuf);
    this.write(body);
    this.central.push({ nameBuf, method, crc, compressed: body.length, size: data.length, localOffset });
  }
  close() {
    const start = this.offset;
    for (const e of this.central) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(0, 12);
      c.writeUInt16LE(0x21, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.compressed, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.nameBuf.length, 28);
      c.writeUInt32LE(e.localOffset, 42);
      this.write(c);
      this.write(e.nameBuf);
    }
    const size = this.offset - start;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.central.length, 8);
    end.writeUInt16LE(this.central.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    this.write(end);
    closeSync(this.fd);
  }
}

const { src, config: configPath, out } = args();
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const { include, ...manifestBase } = config;
if (!include || typeof include !== 'object') {
  throw new Error('config.include is required');
}

// Resolve package path → source file list
const entries = [];
for (const [packagePath, sourcePath] of Object.entries(include)) {
  const full = join(src, sourcePath);
  if (statSync(full).isDirectory()) {
    for (const file of walk(full)) {
      const rel = relative(full, file).split(sep).join('/');
      entries.push({ name: safeRel(`${packagePath}/${rel}`), file });
    }
  } else {
    entries.push({ name: safeRel(packagePath), file: full });
  }
}
entries.sort((a, b) => a.name.localeCompare(b.name));

const checksums = {};
const data = new Map();
for (const entry of entries) {
  const buf = readFileSync(entry.file);
  data.set(entry.name, buf);
  checksums[entry.name] = createHash('sha256').update(buf).digest('hex');
}

const manifest = { ...manifestBase, checksums, createdAt: new Date().toISOString() };
for (const key of ['model', 'tokens', 'lexicon', 'voices', 'vocoder']) {
  const ref = manifest.files?.[key];
  if (ref && !checksums[ref]) {
    throw new Error(`files.${key} (${ref}) is not included in the package`);
  }
}

const zip = new ZipWriter(out);
zip.add('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
for (const entry of entries) {
  zip.add(entry.name, data.get(entry.name));
}
zip.close();

const total = [...data.values()].reduce((s, b) => s + b.length, 0);
console.log(`Wrote ${out}: ${entries.length} files, ${(total / 1024 / 1024).toFixed(1)} MB payload`);
