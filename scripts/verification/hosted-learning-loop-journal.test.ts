import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';

const identity = { projectRef: 'mqxdjvsyckzocokuikmx', schoolId: '93000000-0000-4000-8000-000000000002', sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), ciRunId: '31', runId: '81', runAttempt: 2, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_Web' };
const command = { step: 'create-course', actorId: '93000000-0000-4000-8000-000000000001', role: 'teacher' as const, schoolId: identity.schoolId, path: '/v1/courses', operation: 'course.create', sourceIds: ['93000000-0000-4000-8000-000000000003'], sourceRevision: null, key: 'original-course-command', requestBodySha256: 'd'.repeat(64) };
const http = { status: 200 as const, receiptSha256: 'e'.repeat(64) };
const native = { receiptSha256: 'f'.repeat(64), provenance: 'INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF' as const };
const scope = (root: string) => join(root, '.local/cicd-release/hosted-learning-loop', 'scope-' + createHash('sha256').update(JSON.stringify([identity.projectRef, identity.schoolId])).digest('hex'));
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-learning-loop-journal.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.createHostedLearningLoopJournal, 'function', 'original command journal factory exists');
  return subject as typeof import('./hosted-learning-loop-journal');
}
async function fixture(context: TestContext, run: (root: string, flushes: string[]) => Promise<void>, nativeDirectories = false) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-learning-loop-journal-')), flushes: string[] = [];
  const probe = await open(join(root, 'flush-probe'), 'wx', 0o600), prototype = Object.getPrototypeOf(probe) as FileHandle;
  await probe.close(); await rm(join(root, 'flush-probe'));
  const originalSync = prototype.sync;
  // Windows refuses directory handles. Substitute only that platform primitive
  // for protocol fixtures; all file writes/flushes and readbacks remain native.
  const mocked = nativeDirectories ? null : context.mock.method(prototype, 'sync', async function(this: FileHandle) {
    const stat = await this.stat(); flushes.push(stat.isFile() ? 'file' : 'directory');
    if (stat.isFile() || process.platform !== 'win32' || nativeDirectories) await originalSync.call(this);
  });
  try { await writeFile(join(root, '.gitignore'), '.local/\n'); git(root, 'init', '--quiet'); await run(root, flushes); }
  finally { mocked?.mock.restore(); assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}

test('intent and forwarding are flushed and read back before the one original callback', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async (root, flushes) => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    const original = await journal.intent(command), originalBytes = await readFile(join(scope(root), '000001.record.json'), 'utf8');
    let forwarded = 0;
    await journal.startForwarding(original, async () => {
      forwarded++; assert(flushes.includes('file')); assert(flushes.includes('directory'));
      const records = await journal.read(); assert.equal(records.commands[0].state, 'FORWARDING_AUTHORIZED');
      assert.equal((await readdir(scope(root))).includes('writer.lock'), false);
    });
    assert.equal(forwarded, 1); await assert.rejects(journal.startForwarding(original, async () => { forwarded++; }));
    assert.equal(forwarded, 1); await journal.recordHttpReceipt(original, http); await journal.recordNativeConfirmation(original, native);
    const saved = await journal.read(); assert.equal(saved.commands[0].state, 'NATIVE_CONFIRMED'); assert.equal(saved.records.length, 4);
    assert.equal(saved.hostedAcceptance, false); assert.equal(saved.runnerLossRecoveryVerified, false);
    assert.equal(await readFile(join(scope(root), '000001.record.json'), 'utf8'), originalBytes);
    assert.equal(saved.records[1].previousRecordSha256, saved.records[0].recordSha256);
  });
});

test('failed record fsync forwards zero requests and retains original uncertainty', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    const probe = await open(join(scope(root), 'owner.json'), 'r'), prototype = Object.getPrototypeOf(probe) as FileHandle; await probe.close();
    const savedSync = prototype.sync, originalSize = Buffer.byteLength(await readFile(join(scope(root), '000001.record.json'), 'utf8'));
    const fault = context.mock.method(prototype, 'sync', async function(this: FileHandle) {
      const stat = await this.stat(); if (stat.isFile() && stat.size > originalSize) throw Error('private-fsync-canary'); await savedSync.call(this);
    });
    let forwarded = 0;
    try { await assert.rejects(journal.startForwarding(original, async () => { forwarded++; }), /requires review; contents withheld/); }
    finally { fault.mock.restore(); }
    assert.equal(forwarded, 0); assert((await readdir(scope(root))).includes('writer.lock'));
    await assert.rejects(createHostedLearningLoopJournal({ repoRoot: root, identity }));
  });
});

test('same writer advances after its own confirmed HTTP while another run cannot bypass native proof', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), first = await journal.intent(command);
    await journal.startForwarding(first, async () => undefined); await journal.recordHttpReceipt(first, http);
    const second = await journal.intent({ ...command, step: 'create-unit', operation: 'unit.create', path: '/v1/courses/' + command.sourceIds[0] + '/units', key: 'original-unit-command' });
    assert.equal((await journal.read()).commands.length, 2);
    await assert.rejects(createHostedLearningLoopJournal({ repoRoot: root, identity: { ...identity, runId: '82' } }));
    await journal.markUncertain(second); await journal.recordNativeConfirmation(second, native); await journal.recordNativeConfirmation(first, native);
    const newRun = await createHostedLearningLoopJournal({ repoRoot: root, identity: { ...identity, runId: '82' } });
    assert.equal((await newRun.read()).commands.length, 2);
  });
});

test('uncertainty on a predecessor after the next intent blocks forwarding until original native reconciliation', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), first = await journal.intent(command);
    await journal.startForwarding(first, async () => undefined); await journal.recordHttpReceipt(first, http);
    const second = await journal.intent({ ...command, key: 'dependent-original-command' }); await journal.markUncertain(first);
    let forwarded = 0; await assert.rejects(journal.startForwarding(second, async () => { forwarded++; })); assert.equal(forwarded, 0);
    await journal.recordNativeConfirmation(first, native); await journal.startForwarding(second, async () => { forwarded++; }); assert.equal(forwarded, 1);
  });
});

test('reopened exact identity reads original metadata but cannot reconstruct or forward a body', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const writer = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await writer.intent(command);
    const reopened = await createHostedLearningLoopJournal({ repoRoot: root, identity }); let forwarded = 0;
    assert.equal((await reopened.read()).commands[0].state, 'INTENT');
    await assert.rejects(reopened.startForwarding(original, async () => { forwarded++; }));
    await assert.rejects(reopened.intent({ ...command, key: 'new-command-after-crash' })); assert.equal(forwarded, 0);
    await reopened.recordNativeConfirmation(original, native); assert.equal((await reopened.read()).commands[0].state, 'NATIVE_CONFIRMED');
  });
});

test('reopened HTTP-only evidence cannot continue a run until original native reconciliation', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const writer = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await writer.intent(command);
    await writer.startForwarding(original, async () => undefined); await writer.recordHttpReceipt(original, http);
    const reopened = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    await assert.rejects(reopened.intent({ ...command, key: 'new-command-after-http' }));
    await reopened.recordNativeConfirmation(original, native); const next = await reopened.intent({ ...command, key: 'new-command-after-native' });
    assert.equal(next.command.key, 'new-command-after-native');
  });
});

test('concurrent intents serialize scope and keep the first original command unresolved', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const first = await createHostedLearningLoopJournal({ repoRoot: root, identity }), second = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    const results = await Promise.allSettled([first.intent(command), second.intent({ ...command, key: 'second-concurrent-command' })]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); const saved = await first.read();
    assert.equal(saved.commands.length, 1); assert.equal(saved.commands[0].state, 'INTENT');
  });
});

test('a callback failure after possible forwarding retains UNCERTAIN and rejects late HTTP acknowledgement', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await assert.rejects(journal.startForwarding(original, async () => { throw Error('private-network-canary'); }), /requires review; contents withheld/);
    assert.equal((await journal.read()).commands[0].state, 'UNCERTAIN'); await assert.rejects(journal.recordHttpReceipt(original, http));
    await assert.rejects(journal.intent({ ...command, key: 'replacement-after-unknown' })); await journal.recordNativeConfirmation(original, native);
    assert.equal((await journal.read()).commands[0].state, 'NATIVE_CONFIRMED');
  });
});

test('foreign original key body source revision actor and run cannot receive an outcome', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await journal.startForwarding(original, async () => undefined);
    for (const changed of [{ ...original, command: { ...command, key: 'foreign-command-key' } }, { ...original, command: { ...command, requestBodySha256: '0'.repeat(64) } }, { ...original, command: { ...command, sourceIds: [command.actorId] } }, { ...original, command: { ...command, sourceRevision: 4 } }, { ...original, command: { ...command, actorId: command.sourceIds[0] } }, { ...original, identity: { ...identity, runAttempt: 3 } }, { ...original, identity: { ...identity, sourceSha: '0'.repeat(40) } }, { ...original, identity: { ...identity, backendTransferSha256: '0'.repeat(64) } }]) await assert.rejects(journal.recordHttpReceipt(changed, http));
    assert.equal((await journal.read()).commands[0].state, 'FORWARDING_AUTHORIZED');
    await assert.rejects(journal.recordNativeConfirmation(original, { ...native, provenance: 'BODY_HASH_IS_NATIVE_PROOF' }));
  });
});

test('HTTP receipt cannot precede the original asynchronous forwarding completion', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    let started!: () => void, complete!: () => void;
    const invoked = new Promise<void>(done => { started = done; }), pending = new Promise<void>(done => { complete = done; });
    const forwarding = journal.startForwarding(original, async () => { started(); await pending; }); await invoked;
    await assert.rejects(journal.recordHttpReceipt(original, http)); assert.equal((await journal.read()).commands[0].state, 'FORWARDING_AUTHORIZED');
    complete(); await forwarding; await journal.recordHttpReceipt(original, http); assert.equal((await journal.read()).commands[0].state, 'HTTP_CONFIRMED');
  });
});

test('plain exact inputs reject secrets accessors proxies sparse sources and external paths before hooks', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    let hooks = 0; const getter = Object.defineProperty({}, 'identity', { enumerable: true, get() { hooks++; return identity; } });
    const proxy = new Proxy({ repoRoot: root, identity }, { get() { hooks++; throw Error('private-hook-canary'); } });
    Object.defineProperty(getter, 'repoRoot', { value: root, enumerable: true });
    for (const value of [{ repoRoot: root, identity, token: 'secret-token' }, getter, proxy, { repoRoot: root + '/..', identity }, { repoRoot: root, identity: { ...identity, pupilName: 'Private learner' } }]) await assert.rejects(createHostedLearningLoopJournal(value));
    assert.equal(hooks, 0);
    assert.equal((await readdir(root)).includes('.local'), false);
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    const sparse = new Array(2); sparse[1] = command.sourceIds[0];
    const commandGetter = Object.defineProperty({ ...command }, 'key', { enumerable: true, get() { hooks++; return command.key; } });
    for (const value of [{ ...command, body: { feedback: 'pupil content' } }, { ...command, nativeFingerprint: command.requestBodySha256 }, { ...command, sourceIds: sparse }, { ...command, path: '/v1/courses?token=private' }, { ...command, schoolId: command.sourceIds[0] }, commandGetter]) await assert.rejects(journal.intent(value));
    assert.equal(hooks, 0); assert.equal((await journal.read()).commands.length, 0);
  });
});

test('tamper sequence gaps hardlinks oversized bytes and unexpected files never replace history', async context => {
  const { createHostedLearningLoopJournal } = await api();
  for (const mode of ['tamper', 'gap', 'hardlink', 'oversize', 'unexpected', 'head-tamper', 'head-missing'] as const) await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }); await journal.intent(command);
    const path = join(scope(root), '000001.record.json');
    if (mode === 'tamper') await writeFile(path, (await readFile(path, 'utf8')).replace(command.key, 'altered-original-command'), { mode: 0o600 });
    if (mode === 'gap') await rename(path, join(scope(root), '000002.record.json'));
    if (mode === 'hardlink') await link(path, join(root, 'outside-linked-record'));
    if (mode === 'oversize') await writeFile(path, 'x'.repeat(16385), { mode: 0o600 });
    if (mode === 'unexpected') await writeFile(join(scope(root), '.abandoned.tmp'), 'original publication', { mode: 0o600 });
    if (mode === 'head-tamper') { const head = join(scope(root), '000001.head.json'); await writeFile(head, (await readFile(head, 'utf8')).replace(/"recordSha256":"[a-f0-9]{64}"/, '"recordSha256":"' + '0'.repeat(64) + '"'), { mode: 0o600 }); }
    if (mode === 'head-missing') await rm(join(scope(root), '000001.head.json'));
    await assert.rejects(journal.read()); await assert.rejects(createHostedLearningLoopJournal({ repoRoot: root, identity }));
  });
});

test('the current writer refuses paired tail rollback against its previously observed head', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await journal.startForwarding(original, async () => undefined); const saved = await journal.read(); assert.equal(saved.lastRecordSha256, saved.records[1].recordSha256);
    await rm(join(scope(root), '000002.record.json')); await rm(join(scope(root), '000002.head.json'));
    await assert.rejects(journal.read());
    // Local-only reconstruction cannot detect coherent removal of the pair;
    // its read remains qualified and never permits hash-based retransmission.
    const reopened = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    const prior = await reopened.read(); assert.equal(prior.runnerLossRecoveryVerified, false);
    await assert.rejects(reopened.startForwarding(original, async () => undefined));
  });
});

test('symlinked or replaced local ancestors cannot redirect original journal writes', async context => {
  const { createHostedLearningLoopJournal } = await api();
  for (const mode of ['local', 'release', 'journal', 'replacement'] as const) await fixture(context, async root => {
    const outside = await mkdtemp(join(tmpdir(), 'cuevo-learning-loop-outside-'));
    try {
      const target = mode === 'local' ? join(root, '.local') : mode === 'release' ? join(root, '.local/cicd-release') : join(root, '.local/cicd-release/hosted-learning-loop');
      if (mode === 'replacement') {
        const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }); await rename(target, target + '-original'); await symlink(outside, target, process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(journal.intent(command));
      } else { await mkdir(dirname(target), { recursive: true }); await symlink(outside, target, process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(createHostedLearningLoopJournal({ repoRoot: root, identity })); }
      assert.deepEqual(await readdir(outside), []);
    } finally { assert.equal(dirname(outside), resolve(tmpdir())); await rm(outside, { recursive: true, force: true }); }
  });
});

test('current ignored ownership and original owner links are rechecked before publication', async context => {
  const { createHostedLearningLoopJournal } = await api();
  for (const mode of ['nonignored', 'tracked', 'owner-link'] as const) await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    if (mode === 'nonignored') await writeFile(join(root, '.gitignore'), '');
    if (mode === 'tracked') git(root, 'add', '--force', join(scope(root), 'owner.json'));
    if (mode === 'owner-link') await link(join(scope(root), 'owner.json'), join(root, 'linked-owner'));
    await assert.rejects(journal.intent(command)); assert.equal((await readdir(scope(root))).some(name => name.endsWith('.record.json')), false);
  });
});

test('deleting an original tail record cannot make its retained head look like an earlier valid command state', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await journal.startForwarding(original, async () => undefined);
    await rm(join(scope(root), '000002.record.json'));
    await assert.rejects(journal.read()); await assert.rejects(createHostedLearningLoopJournal({ repoRoot: root, identity }));
  });
});

test('unsupported native directory durability never grants forwarding or cached confirmation', async context => {
  if (process.platform !== 'win32') return;
  const { createHostedLearningLoopJournal } = await api();
  assert.equal(typeof createHostedLearningLoopJournal, 'function');
  await fixture(context, async root => {
    // Fresh subprocess prevents a directory primitive substitute from any
    // protocol fixture from establishing unsupported native confirmation.
    const code = "const {createHostedLearningLoopJournal}=await import(process.argv[1]);try{await createHostedLearningLoopJournal({repoRoot:process.argv[2],identity:JSON.parse(process.argv[3])});console.log('ADMITTED')}catch{console.log('UNAVAILABLE')}";
    const result = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, pathToFileURL(resolve(import.meta.dirname, 'hosted-learning-loop-journal.ts')).href, root, JSON.stringify(identity)], { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.trim(), 'UNAVAILABLE');
    assert.equal((await readdir(scope(root))).includes('owner.json'), true);
  }, true);
});

test('the multi-command learning loop retains every original metadata transition beyond one review-package size', async context => {
  const { createHostedLearningLoopJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    const originals = [];
    for (let index = 1; index <= 12; index++) {
      const original = await journal.intent({ ...command, step: 'course-' + index, key: 'original-loop-command-' + index }); originals.push(original);
      await journal.startForwarding(original, async () => undefined); await journal.recordHttpReceipt(original, http);
    }
    const saved = await journal.read(); assert.equal(saved.commands.length, 12); assert.equal(saved.records.length, 36);
    assert(Buffer.byteLength(JSON.stringify(saved)) > 48 * 1024);
    for (const original of originals) await journal.recordNativeConfirmation(original, native);
    assert.equal((await journal.read()).commands.filter(row => row.state === 'NATIVE_CONFIRMED').length, 12);
  });
});
