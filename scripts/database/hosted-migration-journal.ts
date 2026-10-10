import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import {parseHostedExecutionJournal,type HostedExecutionJournal, type HostedExecutionPorts} from './hosted-migration-journal-contracts';

const purpose = 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL';
const failure = () => new Error('Hosted migration journal ownership or durability requires review; contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const identitySchema = z.object({
  projectRef: z.string().regex(/^[a-z]{20}$/), sourceSha: sha, treeSha: sha,
  planSha256: digest, stageId: z.enum(['prefix', 'native', 'pre-observability', 'remaining']),
  stageSha256: digest, databaseUrl: z.string().max(400), approvalDigest: digest,
  ciRunId: z.string().regex(/^[1-9][0-9]*$/).max(30), certificateSha256: digest,
}).strict();
const payloadSchema = z.unknown().transform(value=>parseHostedExecutionJournal(value));
const recordSchema = z.object({
  version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(3),
  previousSha256: digest.nullable(), payload: payloadSchema, payloadSha256: digest,
}).strict();
const inputSchema = z.object({ repoRoot: z.string(), journalRoot: z.string(), identity: identitySchema }).strict();
type FileStat = Stats;
type OwnedFile = { bytes: string; stat: FileStat };
type Chain = { records: { payload: HostedExecutionJournal; payloadSha256: string; bytes: string }[] };
export type HostedMigrationJournal = Pick<HostedExecutionPorts, 'readJournal' | 'writeJournal'> & {readOriginalIntentAcknowledgement():Promise<{payload:HostedExecutionJournal;ownerSha256:string;record1Sha256:string}>};

function snapshot(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure();
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure();
    Object.defineProperty(copy, key, { value: snapshot(field.value, depth + 1), enumerable: true });
  }
  return copy;
}
function checkedIdentity(value: unknown): HostedExecutionJournal['identity'] {
  const identity = identitySchema.parse(snapshot(value));
  const url = new URL(identity.databaseUrl);
  const direct = url.hostname === `db.${identity.projectRef}.supabase.co` && url.username === 'postgres';
  const pooler = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${identity.projectRef}`;
  if (url.protocol !== 'postgresql:' || url.password || url.port !== '5432' || url.pathname !== '/postgres' || url.search !== '?sslmode=verify-full' || url.hash || !(direct || pooler) || url.toString() !== identity.databaseUrl) throw failure();
  return identity;
}
function sameNode(left: FileStat, right: FileStat): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
}
function stable(left: FileStat, right: FileStat): boolean {
  return sameNode(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode && left.nlink === right.nlink;
}
function privateMode(stat: FileStat, mode: number) {
  if (process.platform !== 'win32' && ((stat.mode & 0o777) !== mode || typeof process.geteuid === 'function' && stat.uid !== process.geteuid())) throw failure();
}
async function directory(path: string, create = false, privateOwned = false): Promise<FileStat> {
  let stat: FileStat;
  try { stat = await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw failure();
    await mkdir(path, { mode: 0o700 });
    stat = await lstat(path);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw failure();
  if (privateOwned) privateMode(stat, 0o700);
  return stat;
}
async function ancestors(path: string): Promise<{ path: string; stat: FileStat }[]> {
  const paths = [path];
  while (dirname(paths[0]) !== paths[0]) paths.unshift(dirname(paths[0]));
  const result: { path: string; stat: FileStat }[] = [];
  for (const current of paths) result.push({ path: current, stat: await directory(current) });
  return result;
}
async function ownedFile(path: string): Promise<OwnedFile> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > 32768 || await realpath(path) !== path) throw failure();
  privateMode(before, 0o600);
  // Windows requires a writable handle for FlushFileBuffers; no bytes are written during this bounded read.
  const handle = await open(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!stable(before, await handle.stat())) throw failure();
    const bytes = await handle.readFile();
    await handle.sync();
    if (!stable(before, await handle.stat()) || !stable(before, await lstat(path)) || bytes.length !== before.size || !bytes.equals(Buffer.from(bytes.toString('utf8'), 'utf8'))) throw failure();
    return { bytes: bytes.toString('utf8'), stat: before };
  } finally { await handle.close(); }
}
function json(value: unknown): string { return JSON.stringify(value) + '\n'; }
function parse(bytes: string): unknown {
  const value: unknown = JSON.parse(bytes);
  if (json(value) !== bytes) throw failure();
  return value;
}
function transition(previous: HostedExecutionJournal['state'] | undefined, next: HostedExecutionJournal['state']): boolean {
  return previous === undefined ? next === 'INTENT' : previous === 'INTENT' ? next === 'COMMITTED' || next === 'REQUIRES_REVIEW' : previous === 'COMMITTED' && next === 'REQUIRES_REVIEW';
}

/** Native local journal only. No source admission, TLS, provider write or deployment-lock authority. */
export async function createHostedMigrationJournal(input: { repoRoot: string; journalRoot: string; identity: HostedExecutionJournal['identity'] }): Promise<HostedMigrationJournal> {
  try {
    const parsed = inputSchema.parse(snapshot(input));
    const identity = checkedIdentity(parsed.identity);
    const { repoRoot, journalRoot } = parsed;
    const releaseRoot = join(repoRoot, '.local', 'hosted-release');
    if (!isAbsolute(repoRoot) || resolve(repoRoot) !== repoRoot || !isAbsolute(journalRoot) || resolve(journalRoot) !== journalRoot || dirname(journalRoot) !== releaseRoot || !/^journal-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(basename(journalRoot)) || basename(journalRoot).length > 100) throw failure();
    const ancestorNodes = await ancestors(repoRoot);
    const environment = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([
      ['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    ]));
    const ignored = () => {
      const git = (args: string[], stdin?: string) => execFileSync('git', ['-C', repoRoot, ...args], {
        encoding: 'utf8', input: stdin, env: environment, windowsHide: true, timeout: 15000,
        maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const probe = '.local/hosted-release/' + basename(journalRoot) + '/owner.json';
      if (resolve(git(['rev-parse', '--show-toplevel']).trim()) !== repoRoot || git(['check-ignore', '--no-index', '--stdin'], probe + '\n').trim() !== probe || git(['ls-files', '--cached', '--', '.local/hosted-release']).length) throw failure();
    };
    ignored();
    const localRoot = join(repoRoot, '.local');
    const localNode = await directory(localRoot, true);
    const releaseNode = await directory(releaseRoot, true);
    let rootNode: FileStat;
    let created = false;
    try { rootNode = await lstat(journalRoot); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure();
      await mkdir(journalRoot, { mode: 0o700 });
      rootNode = await directory(journalRoot, false, true); created = true;
    }
    rootNode = await directory(journalRoot, false, true);
    const ownerBytes = json({ version: 1, purpose, identity });
    if (created) {
      const handle = await open(join(journalRoot, 'owner.json'), 'wx', 0o600);
      try { await handle.writeFile(ownerBytes); await handle.sync(); } finally { await handle.close(); }
    }
    const owner = await ownedFile(join(journalRoot, 'owner.json'));
    if (owner.bytes !== ownerBytes) throw failure();
    const check = async () => {
      ignored();
      for (const node of [...ancestorNodes, { path: localRoot, stat: localNode }, { path: releaseRoot, stat: releaseNode }, { path: journalRoot, stat: rootNode }]) {
        if (!sameNode(node.stat, await directory(node.path, false, node.path === journalRoot))) throw failure();
      }
      const current = await ownedFile(join(journalRoot, 'owner.json'));
      if (!stable(owner.stat, current.stat) || current.bytes !== ownerBytes) throw failure();
    };
    const syncDirectories = async () => {
      for (const path of [journalRoot, releaseRoot, localRoot, repoRoot]) {
        await check();
        const handle = await open(path, 'r');
        try { await handle.sync(); } finally { await handle.close(); }
      }
      await check();
    };
    const readChain = async (reservation?: OwnedFile): Promise<Chain> => {
      await check();
      const names = (await readdir(journalRoot)).sort();
      const recordNames = names.filter(name => /^00000[1-3]\.record\.json$/.test(name));
      const expectedNames = ['owner.json', ...recordNames, ...(reservation ? ['writer.lock'] : [])].sort();
      if (JSON.stringify(names) !== JSON.stringify(expectedNames)) throw failure();
      if (reservation) {
        const current = await ownedFile(join(journalRoot, 'writer.lock'));
        if (!stable(current.stat, reservation.stat) || current.bytes !== reservation.bytes) throw failure();
      }
      const records: Chain['records'] = [];
      let previousSha256: string | null = null;
      for (const [index, name] of recordNames.entries()) {
        if (name !== String(index + 1).padStart(6, '0') + '.record.json') throw failure();
        const saved = await ownedFile(join(journalRoot, name));
        const decoded = parse(saved.bytes);
        const record = recordSchema.parse(decoded);
        if (record.sequence !== index + 1 || record.previousSha256 !== previousSha256 || JSON.stringify(checkedIdentity(record.payload.identity)) !== JSON.stringify(identity) || record.payloadSha256 !== hash(JSON.stringify((decoded as { payload: unknown }).payload)) || !transition(records.at(-1)?.payload.state, record.payload.state)) throw failure();
        if(record.payload.version===2&&record.payload.originalIntentExecution.originalIntentSha256!==records[0]?.payloadSha256)throw failure();
        records.push({ payload: (decoded as { payload: HostedExecutionJournal }).payload, payloadSha256: record.payloadSha256, bytes: saved.bytes });
        previousSha256 = hash(saved.bytes);
      }
      await check();
      return { records };
    };
    await readChain();
    return {
      readOriginalIntentAcknowledgement:async()=>{
        try{const first=await readChain();if(first.records.length!==1||first.records[0].payload.version!==1||first.records[0].payload.state!=='INTENT')throw failure();await syncDirectories();const second=await readChain();if(JSON.stringify(first)!==JSON.stringify(second))throw failure();return{payload:structuredClone(first.records[0].payload),ownerSha256:hash(ownerBytes),record1Sha256:hash(first.records[0].bytes)};}catch{throw failure();}
      },
      readJournal: async () => {
        try {
          const chain = await readChain();
          if (!chain.records.length) return null;
          await syncDirectories();
          if (JSON.stringify(await readChain()) !== JSON.stringify(chain)) throw failure();
          return structuredClone(chain.records.at(-1)!.payload);
        } catch { throw failure(); }
      },
      writeJournal: async value => {
        let reservation: OwnedFile | undefined;
        try {
          const safe = snapshot(value);
          payloadSchema.parse(safe);
          const payload = JSON.parse(JSON.stringify(safe)) as HostedExecutionJournal;
          if (JSON.stringify(checkedIdentity(payload.identity)) !== JSON.stringify(identity)) throw failure();
          const payloadSha256 = hash(JSON.stringify(payload));
          const prior = await readChain();
          if(payload.version===2&&payload.originalIntentExecution.originalIntentSha256!==prior.records[0]?.payloadSha256)throw failure();
          if (prior.records.at(-1)?.payloadSha256 !== payloadSha256 && !transition(prior.records.at(-1)?.payload.state, payload.state)) throw failure();
          const lockPath = join(journalRoot, 'writer.lock');
          const handle = await open(lockPath, 'wx', 0o600);
          try { await handle.writeFile(json({ version: 1, purpose, ownerSha256: hash(ownerBytes), reservation: randomUUID() })); await handle.sync(); } finally { await handle.close(); }
          reservation = await ownedFile(lockPath);
          const chain = await readChain(reservation);
          if (JSON.stringify(chain) !== JSON.stringify(prior)) throw failure();
          const latest = chain.records.at(-1);
          if (latest?.payloadSha256 !== payloadSha256) {
            if (!transition(latest?.payload.state, payload.state)) throw failure();
            const sequence = chain.records.length + 1;
            const bytes = json({ version: 1, purpose, sequence, previousSha256: latest ? hash(latest.bytes) : null, payload, payloadSha256 });
            const temporary = join(journalRoot, '.' + randomUUID() + '.tmp');
            const final = join(journalRoot, String(sequence).padStart(6, '0') + '.record.json');
            const file = await open(temporary, 'wx', 0o600);
            try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
            await check();
            if ((await ownedFile(temporary)).bytes !== bytes || (await readdir(journalRoot)).includes(basename(final))) throw failure();
            await rename(temporary, final);
            if ((await ownedFile(final)).bytes !== bytes) throw failure();
          }
          await syncDirectories();
          const confirmed = await readChain(reservation);
          if (confirmed.records.at(-1)?.payloadSha256 !== payloadSha256) throw failure();
          await check();
          if (!stable(reservation.stat, (await ownedFile(lockPath)).stat)) throw failure();
          await unlink(lockPath);
          await syncDirectories();
          if (JSON.stringify(await readChain()) !== JSON.stringify(confirmed)) throw failure();
          return { kind: 'SYNCED', sha256: payloadSha256 };
        } catch {
          // Keep an incomplete reservation and every original byte for explicit review; never retry or clean up uncertain publication.
          return { kind: 'UNCONFIRMED' };
        }
      },
    };
  } catch { throw failure(); }
}
