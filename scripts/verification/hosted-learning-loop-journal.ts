import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson, parseCanonicalReleaseReviewJson } from './release-review';

const purpose = 'CUEVO_HOSTED_LEARNING_LOOP_COMMAND_JOURNAL';
const failure = () => Error('Original learning-loop journal ownership or durability requires review; contents withheld.');
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/);
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const runId = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const identitySchema = z.object({
  projectRef: z.string().regex(/^[a-z]{20}$/), schoolId: uuid, sourceSha: sha, treeSha: sha,
  ciRunId: runId, runId, runAttempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  backendTransferSha256: digest, webDeploymentId: z.string().regex(/^dpl_[A-Za-z0-9]{1,100}$/),
}).strict();
const commandSchema = z.object({
  step: z.string().regex(/^[a-z][a-z0-9_.:-]{0,99}$/), actorId: uuid,
  role: z.enum(['admin', 'teacher', 'student', 'coordinator', 'parent']), schoolId: uuid,
  path: z.string().min(5).max(400).regex(/^\/v1\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/),
  operation: z.enum(['course.create', 'unit.create', 'lesson.create', 'activity.create', 'course.publish',
    'assessment.create', 'assessment.preparation', 'assessment.publish', 'activity.complete',
    'submission.draft', 'submission.create', 'assessment.reference', 'marking.create', 'result.release',
    'intelligence.analyze', 'improvement.decision', 'improvement.complete', 'improvement.reassessment',
    'improvement.measure', 'portfolio.create', 'portfolio.review', 'portfolio.revoke', 'intelligence.policy.approve']),
  sourceIds: z.array(uuid).max(16).refine(values => new Set(values).size === values.length),
  sourceRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  key: z.string().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/), requestBodySha256: digest,
}).strict();
const stateSchema = z.enum(['INTENT', 'FORWARDING_AUTHORIZED', 'HTTP_CONFIRMED', 'NATIVE_CONFIRMED', 'UNCERTAIN']);
const originalSchema = z.object({ identity: identitySchema, command: commandSchema, intentSequence: z.number().int().min(1).max(512), intentRecordSha256: digest }).strict();
const recordSchema = z.object({
  version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(512),
  previousRecordSha256: digest.nullable(), identity: identitySchema, command: commandSchema,
  state: stateSchema, intentSequence: z.number().int().min(1).max(512), intentRecordSha256: digest.nullable(),
  httpReceiptSha256: digest.nullable(), nativeReceiptSha256: digest.nullable(),
  nativeProof: z.literal('CALLER_ATTESTED_INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF').nullable(),
  localDurabilityOnly: z.literal(true), recordSha256: digest,
}).strict();
const headSchema = z.object({ version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(512), recordSha256: digest, previousRecordSha256: digest.nullable() }).strict();
const httpSchema = z.object({ status: z.literal(200), receiptSha256: digest }).strict();
const nativeSchema = z.object({ receiptSha256: digest, provenance: z.literal('INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF') }).strict();
const inputSchema = z.object({ repoRoot: z.string().min(1).max(2048), identity: identitySchema }).strict();
type RecordValue = z.infer<typeof recordSchema>;
type State = z.infer<typeof stateSchema>;
export type HostedLearningLoopJournalIdentity = z.infer<typeof identitySchema>;
export type HostedLearningLoopJournalCommand = z.infer<typeof commandSchema>;
export type HostedLearningLoopJournalOriginal = z.infer<typeof originalSchema>;
type CommandState = { original: HostedLearningLoopJournalOriginal; state: State; httpReceiptSha256: string | null; nativeReceiptSha256: string | null };
type Chain = { records: RecordValue[]; commands: CommandState[] };
export type HostedLearningLoopJournalRead = Chain & { lastRecordSha256: string | null; evidence: 'LOCAL_DURABLE_METADATA_ONLY'; hostedAcceptance: false; runnerLossRecoveryVerified: false };
export type HostedLearningLoopJournal = {
  intent(command: unknown): Promise<HostedLearningLoopJournalOriginal>;
  startForwarding<T>(original: unknown, forward: () => Promise<T>): Promise<T>;
  recordHttpReceipt(original: unknown, receipt: unknown): Promise<void>;
  recordNativeConfirmation(original: unknown, proof: unknown): Promise<void>;
  markUncertain(original: unknown): Promise<void>;
  read(): Promise<HostedLearningLoopJournalRead>;
};

// Cross-instance operations in this process serialize before filesystem locks.
// A retained lock is never stolen; cross-process/runner uncertainty needs review.
const queues = new Map<string, Promise<void>>();
async function serialized<T>(path: string, work: () => Promise<T>): Promise<T> {
  const prior = queues.get(path) ?? Promise.resolve();
  let release!: () => void; const next = new Promise<void>(done => { release = done; }); queues.set(path, next);
  await prior;
  try { return await work(); }
  finally { release(); if (queues.get(path) === next) queues.delete(path); }
}
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  // Canonical serialization rejects getters/proxies/sparse arrays before Zod.
  const raw: unknown = JSON.parse(canonicalReleaseReviewJson(value));
  return schema.parse(raw);
}
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
const sameNode = (left: Stats, right: Stats) => left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
const stable = (left: Stats, right: Stats) => sameNode(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode && left.nlink === right.nlink;
function privateMode(stat: Stats, mode: number) {
  if (process.platform !== 'win32' && ((stat.mode & 0o777) !== mode || typeof process.geteuid === 'function' && stat.uid !== process.geteuid())) throw failure();
}
async function directory(path: string, create = false, privateOwned = false): Promise<Stats> {
  let stat: Stats;
  try { stat = await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw failure();
    await mkdir(path, { mode: 0o700 }); stat = await lstat(path);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw failure();
  if (privateOwned) privateMode(stat, 0o700); return stat;
}
async function ownedFile(path: string) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > 16384 || await realpath(path) !== path) throw failure();
  privateMode(before, 0o600);
  // Windows FlushFileBuffers requires a writable handle; this read writes no bytes.
  const file = await open(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!stable(before, await file.stat())) throw failure();
    const bytes = await file.readFile(); await file.sync();
    if (!stable(before, await file.stat()) || !stable(before, await lstat(path)) || bytes.length !== before.size
      || !bytes.equals(Buffer.from(bytes.toString('utf8'), 'utf8'))) throw failure();
    return { bytes: bytes.toString('utf8'), stat: before };
  } finally { await file.close(); }
}
const bytesFor = (value: unknown) => canonicalReleaseReviewJson(value) + '\n';
const recordDigest = (record: RecordValue) => { const payload: Partial<RecordValue> = { ...record }; delete payload.recordSha256; return hash(canonicalReleaseReviewJson(payload)); };
const reference = (record: RecordValue): HostedLearningLoopJournalOriginal => ({ identity: record.identity, command: record.command, intentSequence: record.sequence, intentRecordSha256: record.recordSha256 });
function allowed(previous: State, next: State) {
  return previous !== 'NATIVE_CONFIRMED' && (next === 'UNCERTAIN' && previous !== 'UNCERTAIN' || next === 'NATIVE_CONFIRMED'
    || previous === 'INTENT' && next === 'FORWARDING_AUTHORIZED' || previous === 'FORWARDING_AUTHORIZED' && next === 'HTTP_CONFIRMED');
}

/** Local verification metadata only. Digests cannot rehydrate payloads or confer
 * product, request, runner-loss recovery or independent native-proof authority.
 * Paired heads are consistency receipts, not atomic publication or protection
 * against removal of an entire local scope. Reopened recovery needs a separately
 * trusted external manifest/head; this adapter does not establish that gate. */
export async function createHostedLearningLoopJournal(value: unknown): Promise<HostedLearningLoopJournal> {
  try {
    const input = checked(inputSchema, value), { repoRoot, identity } = input;
    if (!isAbsolute(repoRoot) || resolve(repoRoot) !== repoRoot) throw failure();
    const local = join(repoRoot, '.local'), release = join(local, 'cicd-release'), root = join(release, 'hosted-learning-loop');
    const scopeRoot = join(root, 'scope-' + hash(JSON.stringify([identity.projectRef, identity.schoolId])));
    return await serialized(root, async () => {
      const ancestorPaths = [repoRoot]; while (dirname(ancestorPaths[0]) !== ancestorPaths[0]) ancestorPaths.unshift(dirname(ancestorPaths[0]));
      const nodes = await Promise.all(ancestorPaths.map(async path => ({ path, stat: await directory(path), privateOwned: false })));
      const gitEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined)
        .map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
      const ignored = () => {
        const git = (args: string[], stdin?: string) => execFileSync('git', ['-C', repoRoot, ...args], { env: gitEnv, input: stdin, encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'] });
        const probe = '.local/cicd-release/hosted-learning-loop/owner.json';
        if (resolve(git(['rev-parse', '--show-toplevel']).trim()) !== repoRoot || git(['check-ignore', '--no-index', '--stdin'], probe + '\n').trim() !== probe
          || git(['ls-files', '--cached', '--', '.local/cicd-release/hosted-learning-loop']).length) throw failure();
      };
      ignored();
      for (const path of [local, release, root, scopeRoot]) nodes.push({ path, stat: await directory(path, true, path === root || path === scopeRoot), privateOwned: path === root || path === scopeRoot });
      const ownerPath = join(scopeRoot, 'owner.json'), ownerBytes = bytesFor({ version: 1, purpose, projectRef: identity.projectRef, schoolId: identity.schoolId });
      try { await lstat(ownerPath); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || (await readdir(scopeRoot)).length) throw failure();
        const file = await open(ownerPath, 'wx', 0o600); try { await file.writeFile(ownerBytes); await file.sync(); } finally { await file.close(); }
      }
      const owner = await ownedFile(ownerPath); if (owner.bytes !== ownerBytes) throw failure();
      const check = async () => {
        for (const node of nodes) if (!sameNode(node.stat, await directory(node.path, false, node.privateOwned))) throw failure();
        const current = await ownedFile(ownerPath); if (!stable(owner.stat, current.stat) || current.bytes !== ownerBytes) throw failure();
      };
      const syncDirectories = async () => {
        for (const path of [scopeRoot, root, release, local, repoRoot]) {
          await check(); const file = await open(path, 'r'); try { await file.sync(); } finally { await file.close(); }
        }
        await check();
      };
      let lastSeen: { sequence: number; recordSha256: string } | null = null;
      const readChain = async (reservation?: Awaited<ReturnType<typeof ownedFile>>): Promise<Chain> => {
        await check(); const names = (await readdir(scopeRoot)).sort(); if (names.length > 1026) throw failure();
        const files = names.filter(name => /^\d{6}\.record\.json$/.test(name));
        const heads = files.map(name => name.replace('.record.json', '.head.json'));
        if (!same(names, ['owner.json', ...files, ...heads, ...(reservation ? ['writer.lock'] : [])].sort())) throw failure();
        if (reservation) { const current = await ownedFile(join(scopeRoot, 'writer.lock')); if (!stable(reservation.stat, current.stat) || current.bytes !== reservation.bytes) throw failure(); }
        const records: RecordValue[] = [], commands: CommandState[] = []; let previous: string | null = null;
        for (const [index, name] of files.entries()) {
          if (name !== String(index + 1).padStart(6, '0') + '.record.json') throw failure();
          const saved = await ownedFile(join(scopeRoot, name)); if (!saved.bytes.endsWith('\n')) throw failure();
          const record = recordSchema.parse(parseCanonicalReleaseReviewJson(saved.bytes.slice(0, -1)));
          if (record.sequence !== index + 1 || record.previousRecordSha256 !== previous || record.recordSha256 !== recordDigest(record)
            || record.identity.projectRef !== identity.projectRef || record.identity.schoolId !== identity.schoolId || record.command.schoolId !== identity.schoolId) throw failure();
          const savedHead = await ownedFile(join(scopeRoot, heads[index])); if (!savedHead.bytes.endsWith('\n')) throw failure();
          const head = headSchema.parse(parseCanonicalReleaseReviewJson(savedHead.bytes.slice(0, -1)));
          if (head.sequence !== record.sequence || head.recordSha256 !== record.recordSha256 || head.previousRecordSha256 !== record.previousRecordSha256) throw failure();
          if (record.state === 'INTENT') {
            if (record.intentSequence !== record.sequence || record.intentRecordSha256 !== null || record.httpReceiptSha256 !== null || record.nativeReceiptSha256 !== null || record.nativeProof !== null
              || commands.some(row => row.original.command.key === record.command.key)
              || commands.some(row => row.state !== 'NATIVE_CONFIRMED' && (!same(row.original.identity, record.identity) || row.state !== 'HTTP_CONFIRMED'))) throw failure();
            commands.push({ original: reference(record), state: 'INTENT', httpReceiptSha256: null, nativeReceiptSha256: null });
          } else {
            const current = commands.find(row => row.original.intentRecordSha256 === record.intentRecordSha256);
            if (!current || current.original.intentSequence !== record.intentSequence || !same(current.original.identity, record.identity) || !same(current.original.command, record.command)
              || !allowed(current.state, record.state)) throw failure();
            const expectedHttp = record.state === 'HTTP_CONFIRMED' ? record.httpReceiptSha256 : current.httpReceiptSha256;
            if (record.httpReceiptSha256 !== expectedHttp || record.state === 'HTTP_CONFIRMED' && record.httpReceiptSha256 === null
              || (record.state === 'NATIVE_CONFIRMED' ? record.nativeReceiptSha256 === null || record.nativeProof !== 'CALLER_ATTESTED_INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF'
                : record.nativeReceiptSha256 !== null || record.nativeProof !== null)) throw failure();
            Object.assign(current, { state: record.state, httpReceiptSha256: record.httpReceiptSha256, nativeReceiptSha256: record.nativeReceiptSha256 });
          }
          records.push(record); previous = record.recordSha256;
        }
        if (lastSeen && (records.length < lastSeen.sequence || records[lastSeen.sequence - 1].recordSha256 !== lastSeen.recordSha256)) throw failure();
        const latest = records.at(-1); if (latest) lastSeen = { sequence: latest.sequence, recordSha256: latest.recordSha256 };
        await check(); return { records, commands };
      };
      const durableRead = async () => { ignored(); const chain = await readChain(); await syncDirectories(); if (!same(chain, await readChain())) throw failure(); ignored(); return chain; };
      await syncDirectories(); const initial = await readChain(); ignored();
      if (initial.commands.some(row => row.state !== 'NATIVE_CONFIRMED' && !same(row.original.identity, identity))) throw failure();
      const ownedIntents = new Set<string>(), completedForwards = new Set<string>(), ownHttp = new Set<string>();
      const append = async (chain: Chain, command: HostedLearningLoopJournalCommand, state: State, original?: HostedLearningLoopJournalOriginal, receipt?: string): Promise<RecordValue> => {
        if (chain.records.length >= 512) throw failure(); const sequence = chain.records.length + 1;
        const current = original ? chain.commands.find(row => same(row.original, original)) : undefined;
        const body = { version: 1 as const, purpose, sequence, previousRecordSha256: chain.records.at(-1)?.recordSha256 ?? null, identity, command, state,
          intentSequence: original?.intentSequence ?? sequence, intentRecordSha256: original?.intentRecordSha256 ?? null,
          httpReceiptSha256: state === 'HTTP_CONFIRMED' ? receipt! : current?.httpReceiptSha256 ?? null,
          nativeReceiptSha256: state === 'NATIVE_CONFIRMED' ? receipt! : null,
          nativeProof: state === 'NATIVE_CONFIRMED' ? 'CALLER_ATTESTED_INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF' as const : null, localDurabilityOnly: true as const };
        const record = recordSchema.parse({ ...body, recordSha256: hash(canonicalReleaseReviewJson(body)) }), bytes = bytesFor(record);
        ignored(); const lockPath = join(scopeRoot, 'writer.lock');
        // On any uncertain write/flush/readback, retain the reservation and all
        // original bytes. Nothing retries publication or steals this lock.
        const lock = await open(lockPath, 'wx', 0o600);
        try { await lock.writeFile(bytesFor({ version: 1, purpose, ownerSha256: hash(ownerBytes), reservation: randomUUID() })); await lock.sync(); } finally { await lock.close(); }
        const reservation = await ownedFile(lockPath); if (!same(chain, await readChain(reservation))) throw failure();
        const path = join(scopeRoot, String(sequence).padStart(6, '0') + '.record.json');
        const file = await open(path, 'wx', 0o600); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
        if ((await ownedFile(path)).bytes !== bytes) throw failure();
        const headPath = join(scopeRoot, String(sequence).padStart(6, '0') + '.head.json');
        const headBytes = bytesFor({ version: 1, purpose, sequence, recordSha256: record.recordSha256, previousRecordSha256: record.previousRecordSha256 });
        const headFile = await open(headPath, 'wx', 0o600); try { await headFile.writeFile(headBytes); await headFile.sync(); } finally { await headFile.close(); }
        if ((await ownedFile(headPath)).bytes !== headBytes) throw failure(); await syncDirectories();
        const confirmed = await readChain(reservation); if (!same(confirmed.records.at(-1), record)) throw failure();
        const currentLock = await ownedFile(lockPath); if (!stable(reservation.stat, currentLock.stat) || reservation.bytes !== currentLock.bytes) throw failure();
        await unlink(lockPath); await syncDirectories(); if (!same(confirmed, await readChain())) throw failure(); ignored(); return record;
      };
      const originalState = (chain: Chain, raw: unknown) => {
        const original = checked(originalSchema, raw); if (!same(original.identity, identity)) throw failure();
        const current = chain.commands.find(row => same(row.original, original)); if (!current) throw failure(); return current;
      };
      const run = <T>(work: () => Promise<T>) => serialized(scopeRoot, async () => { try { return await work(); } catch { throw failure(); } });
      const journal: HostedLearningLoopJournal = {
        read: () => run(async () => { const chain = await durableRead(); return { ...chain, lastRecordSha256: chain.records.at(-1)?.recordSha256 ?? null, evidence: 'LOCAL_DURABLE_METADATA_ONLY', hostedAcceptance: false, runnerLossRecoveryVerified: false }; }),
        intent: raw => run(async () => {
          const command = checked(commandSchema, raw); if (command.schoolId !== identity.schoolId) throw failure(); const chain = await durableRead();
          if (chain.commands.some(row => row.original.command.key === command.key)
            || chain.commands.some(row => row.state !== 'NATIVE_CONFIRMED' && (!same(row.original.identity, identity) || row.state !== 'HTTP_CONFIRMED' || !ownHttp.has(row.original.intentRecordSha256)))) throw failure();
          const record = await append(chain, command, 'INTENT'), original = reference(record); ownedIntents.add(original.intentRecordSha256); return structuredClone(original);
        }),
        startForwarding: async (raw, forward) => {
          if (typeof forward !== 'function' || types.isProxy(forward)) throw failure();
          const started = await run(async () => {
            const chain = await durableRead(), current = originalState(chain, raw);
            if (current.state !== 'INTENT' || !ownedIntents.has(current.original.intentRecordSha256)) throw failure();
            if (chain.commands.some(row => row.original.intentRecordSha256 !== current.original.intentRecordSha256 && row.state !== 'NATIVE_CONFIRMED'
              && (!same(row.original.identity, identity) || row.state !== 'HTTP_CONFIRMED' || !ownHttp.has(row.original.intentRecordSha256)))) throw failure();
            await append(chain, current.original.command, 'FORWARDING_AUTHORIZED', current.original); ownedIntents.delete(current.original.intentRecordSha256);
            // Invoke under this serialized admission, then release the queue so
            // the caller can observe/journal the actual asynchronous request.
            let forwarded: Promise<unknown>;
            try { forwarded = Promise.resolve(forward()); } catch { forwarded = Promise.reject(failure()); }
            // Attach rejection before releasing the queue; the final consumer
            // below retains its uncertainty rather than leaking raw errors.
            void forwarded.catch(() => undefined);
            return { original: current.original, forwarded };
          });
          try { const result = await started.forwarded; completedForwards.add(started.original.intentRecordSha256); return result as Awaited<ReturnType<typeof forward>>; }
          catch { try { await journal.markUncertain(started.original); } catch { /* Original reservation/bytes remain for review. */ } throw failure(); }
        },
        recordHttpReceipt: (raw, value) => run(async () => {
          const receipt = checked(httpSchema, value), chain = await durableRead(), current = originalState(chain, raw);
          if (current.state !== 'FORWARDING_AUTHORIZED' || !completedForwards.has(current.original.intentRecordSha256)) throw failure();
          await append(chain, current.original.command, 'HTTP_CONFIRMED', current.original, receipt.receiptSha256); ownHttp.add(current.original.intentRecordSha256);
        }),
        recordNativeConfirmation: (raw, value) => run(async () => {
          const proof = checked(nativeSchema, value), chain = await durableRead(), current = originalState(chain, raw);
          if (!allowed(current.state, 'NATIVE_CONFIRMED')) throw failure();
          await append(chain, current.original.command, 'NATIVE_CONFIRMED', current.original, proof.receiptSha256);
        }),
        markUncertain: raw => run(async () => {
          const chain = await durableRead(), current = originalState(chain, raw); if (!allowed(current.state, 'UNCERTAIN')) throw failure();
          await append(chain, current.original.command, 'UNCERTAIN', current.original); ownedIntents.delete(current.original.intentRecordSha256); completedForwards.delete(current.original.intentRecordSha256); ownHttp.delete(current.original.intentRecordSha256);
        }),
      };
      return journal;
    });
  } catch { throw failure(); }
}
