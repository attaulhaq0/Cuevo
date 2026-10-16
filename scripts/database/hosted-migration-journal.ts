import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {parseHostedExecutionJournal,snapshotHostedMigrationMetadata,type HostedExecutionJournal, type HostedExecutionPorts} from './hosted-migration-journal-contracts';
import {canAppendStoredHostedMigrationJournal,parseInactiveCronDefinitionJournal,readPersistedInactiveCronAcknowledgementSelection,type HostedMigrationStoredJournal,type InactiveCronDefinitionJournal} from './hosted-inactive-cron-definition-contracts';

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
const inputSchema = z.object({ repoRoot: z.string(), journalRoot: z.string(), identity: identitySchema }).strict();
type FileStat = Stats;
type OwnedFile = { bytes: string; stat: FileStat };
type Chain = { records: { payload: HostedMigrationStoredJournal; payloadSha256: string; bytes: string }[] };
export type HostedMigrationJournal = Pick<HostedExecutionPorts, 'readJournal' | 'writeJournal'> & {readOriginalIntentAcknowledgement():Promise<{payload:HostedExecutionJournal;ownerSha256:string;record1Sha256:string}>};
export type HostedInactiveCronDefinitionJournal={
 readJournal():Promise<InactiveCronDefinitionJournal|null>;
 writeJournal(value:InactiveCronDefinitionJournal):Promise<{kind:'SYNCED';sha256:string}|{kind:'UNCONFIRMED'}>;
 readInactiveDefinitionAcknowledgement():Promise<{journal:InactiveCronDefinitionJournal&{state:'INACTIVE_DEFINITIONS_ACKNOWLEDGED'};payloadSha256:string;chainSha256:string}>;
};

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
function journalRecordSchema(decode:(value:unknown)=>HostedMigrationStoredJournal){return z.object({version:z.literal(1),purpose:z.literal(purpose),sequence:z.number().int().min(1).max(3),previousSha256:digest.nullable(),payload:z.unknown().transform(decode),payloadSha256:digest}).strict();}
/** Artifact transport changes modes, never journal data. Tighten only the
 * exact selected original ACK's held nodes after verifying all raw custody.
 * This local operation grants no source/native/configuration authority. */
export async function restorePersistedInactiveCronJournalPermissions(value:unknown){
 const handles:Awaited<ReturnType<typeof open>>[]=[];let permissionStage='INPUT',refusal:Error|undefined,outcome:{purpose:'CUEVO_RESTORED_INACTIVE_ACK_JOURNAL_PERMISSIONS';journalRoot:string;files:{name:string;sha256:string}[];journalPayloadSha256:string;journalChainSha256:string;modeEvidence:'WINDOWS_MODE_NOT_VERIFIED'|'POSIX_MODE_VERIFIED';effectAuthority:false}|undefined;
 try{
  const input=z.object({repoRoot:z.string(),persistedAcknowledgement:z.unknown()}).strict().parse(snapshotHostedMigrationMetadata(value)),root=input.repoRoot,selection=readPersistedInactiveCronAcknowledgementSelection(input.persistedAcknowledgement),identity=checkedIdentity(selection.context.identity);
  permissionStage='PATHS';if(!isAbsolute(root)||resolve(root)!==root)throw failure();const journalRoot=join(root,'.local','hosted-release','journal-'+hash(JSON.stringify(identity))),nodes=[...await ancestors(root),{path:join(root,'.local'),stat:await directory(join(root,'.local'))},{path:join(root,'.local','hosted-release'),stat:await directory(join(root,'.local','hosted-release'))},{path:journalRoot,stat:await directory(journalRoot)}],names=['000001.record.json','000002.record.json','owner.json'];
  const gitEnv=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','LANG','LC_ALL'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']])),git=(args:string[],stdin?:string)=>execFileSync('git',['-C',root,...args],{env:gitEnv,encoding:'utf8',input:stdin,windowsHide:true,timeout:15000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}),probe='.local/hosted-release/'+basename(journalRoot)+'/owner.json';if(resolve(git(['rev-parse','--show-toplevel']).trim())!==root||git(['check-ignore','--no-index','--stdin'],probe+'\n').trim()!==probe||git(['ls-files','--cached','--','.local/hosted-release']).length)throw failure();
  const lineage=async()=>{for(const node of nodes){const current=await directory(node.path);if(!sameNode(node.stat,current)||node.stat.uid!==current.uid||node.stat.gid!==current.gid)throw failure();}if(JSON.stringify((await readdir(journalRoot)).sort())!==JSON.stringify(names))throw failure();};await lineage();
  const directoryNode=nodes.at(-1)!.stat;let directoryHandle:Awaited<ReturnType<typeof open>>|undefined;if(process.platform!=='win32'){if(directoryNode.uid!==process.geteuid?.()||![0o700,0o755].includes(directoryNode.mode&0o777)||(directoryNode.mode&0o7000)!==0)throw failure();directoryHandle=await open(journalRoot,constants.O_RDONLY|(constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0));handles.push(directoryHandle);if(!stable(directoryNode,await directoryHandle.stat()))throw failure();}
  permissionStage='FILES';const files:{name:string;path:string;stat:FileStat;bytes:Buffer;handle:Awaited<ReturnType<typeof open>>}[]=[];
  for(const name of names){await lineage();const path=join(journalRoot,name),before=await lstat(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>32768||await realpath(path)!==path)throw failure();if(process.platform!=='win32'&&(before.uid!==process.geteuid?.()||![0o600,0o644].includes(before.mode&0o777)||(before.mode&0o7000)!==0))throw failure();const handle=await open(path,constants.O_RDWR|(constants.O_NOFOLLOW??0));handles.push(handle);if(!stable(before,await handle.stat()))throw failure();const bytes=await handle.readFile();if(!stable(before,await handle.stat())||!stable(before,await lstat(path))||bytes.length!==before.size||!bytes.equals(Buffer.from(bytes.toString('utf8'),'utf8')))throw failure();files.push({name,path,stat:before,bytes,handle});}
  permissionStage='OWNER';const byName=new Map(files.map(file=>[file.name,file])),owner=byName.get('owner.json')!;if(owner.bytes.toString('utf8')!==json({version:1,purpose,identity}))throw failure();permissionStage='PARSE';const schema=journalRecordSchema(value=>parseInactiveCronDefinitionJournal(value)),first=byName.get('000001.record.json')!,second=byName.get('000002.record.json')!,a=schema.parse(parse(first.bytes.toString('utf8'))),b=schema.parse(parse(second.bytes.toString('utf8')));
  permissionStage='CHAIN';if(a.sequence!==1||a.previousSha256!==null||b.sequence!==2||b.previousSha256!==hash(first.bytes)||a.payload.version!==3||a.payload.state!=='INTENT'||b.payload.version!==3||b.payload.state!=='INACTIVE_DEFINITIONS_ACKNOWLEDGED')throw failure();
  permissionStage='CONTEXT';if(canonicalReleaseExecutionJson(a.payload.identity)!==canonicalReleaseExecutionJson(identity)||canonicalReleaseExecutionJson(b.payload.identity)!==canonicalReleaseExecutionJson(identity)||canonicalReleaseExecutionJson(a.payload.context)!==canonicalReleaseExecutionJson(selection.context)||canonicalReleaseExecutionJson(b.payload.context)!==canonicalReleaseExecutionJson(selection.context))throw failure();
  permissionStage='DIGEST';if(a.payloadSha256!==hash(JSON.stringify((parse(first.bytes.toString('utf8')) as{payload:unknown}).payload))||b.payloadSha256!==hash(JSON.stringify((parse(second.bytes.toString('utf8')) as{payload:unknown}).payload))||b.payloadSha256!==selection.journalPayloadSha256||hash(Buffer.concat([owner.bytes,first.bytes,second.bytes]))!==selection.journalChainSha256)throw failure();
  permissionStage='TRANSITION';if(!canAppendStoredHostedMigrationJournal(a.payload,b.payload))throw failure();
  permissionStage='MODES';const currentFiles=async()=>{await lineage();for(const file of files){const current=await lstat(file.path),held=await file.handle.stat();if(!sameNode(file.stat,current)||!sameNode(file.stat,held)||current.nlink!==1||held.nlink!==1||current.uid!==file.stat.uid||held.uid!==file.stat.uid||current.gid!==file.stat.gid||held.gid!==file.stat.gid||current.size!==file.stat.size||held.size!==file.stat.size||current.mtimeMs!==file.stat.mtimeMs||held.mtimeMs!==file.stat.mtimeMs)throw failure();const bytes=await readFileThroughHandle(file.handle);if(!bytes.equals(file.bytes))throw failure();}};await currentFiles();if(directoryHandle){await lineage();if(!sameNode(directoryNode,await directoryHandle.stat()))throw failure();await directoryHandle.chmod(0o700);}
  for(const file of files){await currentFiles();if(process.platform!=='win32')await file.handle.chmod(0o600);await file.handle.sync();}await currentFiles();if(process.platform!=='win32'){privateMode(await lstat(journalRoot),0o700);for(const file of files)privateMode(await file.handle.stat(),0o600);}
  outcome={purpose:'CUEVO_RESTORED_INACTIVE_ACK_JOURNAL_PERMISSIONS' as const,journalRoot,files:files.map(file=>({name:file.name,sha256:hash(file.bytes)})),journalPayloadSha256:selection.journalPayloadSha256,journalChainSha256:selection.journalChainSha256,modeEvidence:process.platform==='win32'?'WINDOWS_MODE_NOT_VERIFIED' as const:'POSIX_MODE_VERIFIED' as const,effectAuthority:false as const};
 }catch{refusal=Error(failure().message+' Permission stage: '+permissionStage+'.');}
 const closed=await Promise.allSettled(handles.map(handle=>handle.close()));if(refusal)throw refusal;if(!outcome||closed.some(result=>result.status==='rejected'))throw failure();return outcome;
}
async function readFileThroughHandle(handle:Awaited<ReturnType<typeof open>>){const size=(await handle.stat()).size;if(size<1||size>32768)throw failure();const bytes=Buffer.alloc(size);let position=0;while(position<size){const result=await handle.read(bytes,position,size-position,position);if(!result.bytesRead)throw failure();position+=result.bytesRead;}return bytes;}
/** Native local journal only. No source admission, TLS, provider write or deployment-lock authority. */
async function createJournal(input: { repoRoot: string; journalRoot: string; identity: HostedExecutionJournal['identity'] },inactive:boolean) {
  try {
    const decode=(value:unknown):HostedMigrationStoredJournal=>inactive?parseInactiveCronDefinitionJournal(value):parseHostedExecutionJournal(value);
    const payloadSchema=z.unknown().transform(decode);
    const recordSchema=journalRecordSchema(decode);
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
        if (record.sequence !== index + 1 || record.previousSha256 !== previousSha256 || JSON.stringify(checkedIdentity(record.payload.identity)) !== JSON.stringify(identity) || record.payloadSha256 !== hash(JSON.stringify((decoded as { payload: unknown }).payload)) || !canAppendStoredHostedMigrationJournal(records.at(-1)?.payload??null, record.payload)) throw failure();
        if(record.payload.version===2&&record.payload.originalIntentExecution.originalIntentSha256!==records[0]?.payloadSha256)throw failure();
        records.push({ payload: (decoded as { payload: HostedMigrationStoredJournal }).payload, payloadSha256: record.payloadSha256, bytes: saved.bytes });
        previousSha256 = hash(saved.bytes);
      }
      await check();
      return { records };
    };
    await readChain();
    return {
      readInactiveDefinitionAcknowledgement:async()=>{
        try{if(!inactive)throw failure();const first=await readChain(),last=first.records.at(-1);if(first.records.length!==2||first.records[0].payload.version!==3||first.records[0].payload.state!=='INTENT'||last?.payload.version!==3||last.payload.state!=='INACTIVE_DEFINITIONS_ACKNOWLEDGED')throw failure();await syncDirectories();const second=await readChain();if(JSON.stringify(first)!==JSON.stringify(second))throw failure();return{journal:structuredClone(last.payload),payloadSha256:last.payloadSha256,chainSha256:hash(ownerBytes+first.records.map(row=>row.bytes).join(''))};}catch{throw failure();}
      },
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
      writeJournal: async (value:HostedMigrationStoredJournal) => {
        let reservation: OwnedFile | undefined;
        try {
          const safe = inactive?snapshotHostedMigrationMetadata(value):snapshot(value);
          payloadSchema.parse(safe);
          const payload = JSON.parse(JSON.stringify(safe)) as HostedMigrationStoredJournal;
          if (JSON.stringify(checkedIdentity(payload.identity)) !== JSON.stringify(identity)) throw failure();
          const payloadSha256 = hash(JSON.stringify(payload));
          const prior = await readChain();
          if(payload.version===2&&payload.originalIntentExecution.originalIntentSha256!==prior.records[0]?.payloadSha256)throw failure();
          if (prior.records.at(-1)?.payloadSha256 !== payloadSha256 && !canAppendStoredHostedMigrationJournal(prior.records.at(-1)?.payload??null, payload)) throw failure();
          const lockPath = join(journalRoot, 'writer.lock');
          const handle = await open(lockPath, 'wx', 0o600);
          try { await handle.writeFile(json({ version: 1, purpose, ownerSha256: hash(ownerBytes), reservation: randomUUID() })); await handle.sync(); } finally { await handle.close(); }
          reservation = await ownedFile(lockPath);
          const chain = await readChain(reservation);
          if (JSON.stringify(chain) !== JSON.stringify(prior)) throw failure();
          const latest = chain.records.at(-1);
          if (latest?.payloadSha256 !== payloadSha256) {
            if (!canAppendStoredHostedMigrationJournal(latest?.payload??null, payload)) throw failure();
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
/** Legacy own-operation decoding remains V1/V2 only. */
export function createHostedMigrationJournal(input: { repoRoot: string; journalRoot: string; identity: HostedExecutionJournal['identity'] }):Promise<HostedMigrationJournal>{return createJournal(input,false) as Promise<HostedMigrationJournal>;}
/** Explicit inactive-definition storage, using the same original envelope and
 * filesystem writer. This adapter grants no native/configuration authority. */
export function createHostedInactiveCronDefinitionJournal(input: { repoRoot: string; journalRoot: string; identity: HostedExecutionJournal['identity'] }):Promise<HostedInactiveCronDefinitionJournal>{return createJournal(input,true) as Promise<HostedInactiveCronDefinitionJournal>;}
