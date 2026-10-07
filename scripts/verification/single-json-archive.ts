import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { canonicalReleaseExecutionJson, parseReleaseExecutionJson } from './release-review';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fail = () => Error('Single JSON artifact is invalid or unavailable; contents withheld.');
type ZipEntry = { fileName: string; uncompressedSize: number; compressedSize: number; generalPurposeBitFlag: number; compressionMethod: number; externalFileAttributes: number };
type Zip = { entryCount: number; on(name: 'error' | 'entry' | 'end', listener: (...args: never[]) => void): void; readEntry(): void; close(): void; openReadStream(entry: ZipEntry, callback: (error: Error | null, stream?: Readable) => void): void };
const { yauzl } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle') as { yauzl: { fromBuffer(bytes: Buffer, options: object, callback: (error: Error | null, zip?: Zip) => void): void } };

/** Exactly one plain canonical JSON entry, bounded in memory; never extracted or executed. */
export async function readSingleJsonArchive(bytes: Uint8Array, options: { archiveSha256: string; fileName: string; maximumJsonBytes: number; jsonSha256?: string }): Promise<{ value: unknown; jsonSha256: string }> {
  try {
    if (!digest.safeParse(options.archiveSha256).success || options.jsonSha256 !== undefined && !digest.safeParse(options.jsonSha256).success
      || !/^[a-z][a-z0-9-]*\.json$/.test(options.fileName) || !Number.isSafeInteger(options.maximumJsonBytes) || options.maximumJsonBytes < 1 || options.maximumJsonBytes > 1024 * 1024
      || bytes.byteLength > 2 * 1024 * 1024 || hash(bytes) !== options.archiveSha256) throw fail();
    const file = await new Promise<Buffer>((done, reject) => {
      let opened: Zip | undefined, reader: Readable | undefined, settled = false, count = 0, body: Buffer | undefined;
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); reader?.destroy(); opened?.close(); if (error || !body) reject(fail()); else done(body); };
      const timer = setTimeout(() => finish(fail()), 10000);
      yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
        if (settled) { zip?.close(); return; } if (error || !zip) return finish(fail()); opened = zip;
        if (zip.entryCount !== 1) return finish(fail());
        zip.on('error', (() => finish(fail())) as (...args: never[]) => void);
        zip.on('end', (() => count === 1 ? finish() : finish(fail())) as (...args: never[]) => void);
        zip.on('entry', ((entry: ZipEntry) => {
          const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (++count !== 1 || entry.fileName !== options.fileName || entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod)
            || ![0, 0x8000].includes(kind) || entry.externalFileAttributes & 0x10 || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 1
            || entry.uncompressedSize > options.maximumJsonBytes || entry.compressedSize > 2 * 1024 * 1024) return finish(fail());
          zip.openReadStream(entry, (readError, stream) => {
            if (readError || !stream || settled) { stream?.destroy(); return finish(fail()); } reader = stream;
            const parts: Buffer[] = []; let size = 0;
            stream.on('error', () => finish(fail()));
            stream.on('data', (chunk: Buffer) => { size += chunk.length; if (size > options.maximumJsonBytes || size > entry.uncompressedSize) return finish(fail()); parts.push(chunk); });
            stream.on('end', () => { if (settled || size !== entry.uncompressedSize) return finish(fail()); body = Buffer.concat(parts); zip.readEntry(); });
          });
        }) as (...args: never[]) => void);
        zip.readEntry();
      });
    });
    const jsonSha256 = hash(file); if (options.jsonSha256 !== undefined && jsonSha256 !== options.jsonSha256) throw fail();
    const text = new TextDecoder('utf8', { fatal: true }).decode(file), value = parseReleaseExecutionJson(text);
    if (canonicalReleaseExecutionJson(value) !== text) throw fail();
    return { value, jsonSha256 };
  } catch { throw fail(); }
}
