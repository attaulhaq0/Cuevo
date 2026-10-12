import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';

const identity = { projectRef: 'mqxdjvsyckzocokuikmx', schoolId: '93000000-0000-4000-8000-000000000002', sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), ciRunId: '31', runId: '81', runAttempt: 2, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_Web' };
const command = { step: 'create-group', actorId: '93000000-0000-4000-8000-000000000001', role: 'teacher' as const, schoolId: identity.schoolId, path: '/v1/community/rooms', operation: 'room.create', sourceIds: ['93000000-0000-4000-8000-000000000003'], sourceRevision: null, key: 'original-community-command', requestBodySha256: 'd'.repeat(64) };
const http = { status: 200 as const, receiptSha256: 'e'.repeat(64) };
const native = { receiptSha256: 'f'.repeat(64), provenance: 'INDEPENDENT_NATIVE_ORIGINAL_COMMAND_PROOF' as const };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const scope = (root: string, recipe = 'community') => join(root, '.local/cicd-release/hosted-' + recipe, 'scope-' + hash(JSON.stringify([identity.projectRef, identity.schoolId])));
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-community-journal.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.createHostedCommunityJournal, 'function', 'a purpose-confined community command journal exists');
  return subject as typeof import('./hosted-community-journal');
}
async function core() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-command-journal.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.createHostedCommandJournal, 'function', 'one closed command journal engine exists');
  return subject as typeof import('./hosted-command-journal');
}
async function fixture(context: TestContext, run: (root: string, flushes: string[]) => Promise<void>, nativeDirectories = false) {
  const root = await mkdtemp(join(tmpdir(), 'cuevo-community-journal-')), flushes: string[] = [];
  const probe = await open(join(root, 'flush-probe'), 'wx', 0o600), prototype = Object.getPrototypeOf(probe) as FileHandle;
  await probe.close(); await rm(join(root, 'flush-probe'));
  const originalSync = prototype.sync;
  // Substitute only the unsupported Windows directory primitive. File durability
  // remains native; these fixtures are local protocol evidence, not hosted proof.
  const mocked = nativeDirectories ? null : context.mock.method(prototype, 'sync', async function(this: FileHandle) {
    const stat = await this.stat(); flushes.push(stat.isFile() ? 'file' : 'directory');
    if (stat.isFile() || process.platform !== 'win32') await originalSync.call(this);
  });
  try { await writeFile(join(root, '.gitignore'), '.local/\n'); git(root, 'init', '--quiet'); await run(root, flushes); }
  finally { mocked?.mock.restore(); assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); }
}

test('community owns a different fixed root and purpose from the learning journal', async context => {
  const { createHostedCommunityJournal } = await api();
  const { createHostedLearningLoopJournal } = await import('./hosted-learning-loop-journal');
  await fixture(context, async root => {
    const community = await createHostedCommunityJournal({ repoRoot: root, identity });
    const learning = await createHostedLearningLoopJournal({ repoRoot: root, identity });
    const original = await community.intent(command);
    const owner = await readFile(join(scope(root), 'owner.json'), 'utf8');
    assert.equal(owner, '{"projectRef":"' + identity.projectRef + '","purpose":"CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL","schoolId":"' + identity.schoolId + '","version":1}\n');
    const saved = await community.read(); assert.equal(saved.records[0].purpose, 'CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL');
    assert.equal(saved.evidence, 'LOCAL_DURABLE_METADATA_ONLY'); assert.equal(saved.hostedAcceptance, false); assert.equal(saved.runnerLossRecoveryVerified, false);
    await assert.rejects(learning.intent(command)); await assert.rejects(learning.recordNativeConfirmation(original, native));
    await assert.rejects(community.intent({ ...command, operation: 'course.create' }));
    assert.equal((await learning.read()).records.length, 0);
    assert.notEqual(owner, await readFile(join(scope(root, 'learning-loop'), 'owner.json'), 'utf8'));
  });
});

test('the source-owned community recipe admits only its eleven normal and maintenance operations', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity });
    const operations = ['room.create', 'member.configure', 'post.create', 'reaction.configure', 'post.report', 'post.moderate', 'room.restrict', 'announcement.create', 'notification.read', 'group.lifecycle', 'announcement.withdraw'];
    for (const [index, operation] of operations.entries()) {
      const original = await journal.intent({ ...command, operation, step: 'community-' + index, key: 'original-community-' + index });
      assert.equal(original.command.operation, operation);
      // A stored caller attestation is metadata only, never a native validator.
      await journal.recordNativeConfirmation(original, native);
    }
    const saved = await journal.read(); assert.equal(saved.commands.length, 11); assert.equal(saved.records.length, 22); assert.equal(saved.hostedAcceptance, false);
    for (const operation of ['course.create', 'community.room.create', 'post.delete', 'policy.approve', 'attachment.create', 'notification.deliver']) await assert.rejects(journal.intent({ ...command, operation }));
  });
});

test('closed recipe selection rejects caller schemas paths purposes accessors and proxies before filesystem effects', async context => {
  const { createHostedCommandJournal } = await core(); const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    let hooks = 0;
    const proxy = new Proxy({}, { get() { hooks++; throw Error('private-recipe-canary'); } });
    for (const recipe of ['other', '', { kind: 'community', purpose: 'CUEVO_HOSTED_LEARNING_LOOP_COMMAND_JOURNAL' }, proxy]) await assert.rejects(createHostedCommandJournal(recipe as 'community', { repoRoot: root, identity }));
    const getter = Object.defineProperty({ repoRoot: root }, 'identity', { enumerable: true, get() { hooks++; return identity; } });
    for (const input of [getter, new Proxy({ repoRoot: root, identity }, { get() { hooks++; return identity; } }), { repoRoot: root, identity, purpose: 'other' }, { repoRoot: root, identity, path: scope(root, 'learning-loop') }, { repoRoot: root, identity, schema: {} }, { repoRoot: root, identity, recipe: 'learning-loop' }, { repoRoot: root + '/..', identity }]) await assert.rejects(createHostedCommunityJournal(input));
    assert.equal(hooks, 0); assert.equal((await readdir(root)).includes('.local'), false);
  });
});

test('mutating an independently returned recipe cannot broaden retained journal schemas or paths', async context => {
  const { createHostedCommunityJournal } = await api();
  const { hostedCommandJournalContracts } = await import('./hosted-command-journal-contracts');
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity });
    const retained = hostedCommandJournalContracts('community') as { purpose: string; folder: string; commandSchema: { parse(value: unknown): unknown } };
    retained.purpose = 'CUEVO_HOSTED_LEARNING_LOOP_COMMAND_JOURNAL'; retained.folder = 'hosted-learning-loop';
    retained.commandSchema = hostedCommandJournalContracts('learning-loop').commandSchema;
    assert.doesNotThrow(() => retained.commandSchema.parse({ ...command, operation: 'course.create' }));
    await assert.rejects(journal.intent({ ...command, operation: 'course.create' }));
    const reopened = await createHostedCommunityJournal({ repoRoot: root, identity });
    await assert.rejects(reopened.intent({ ...command, operation: 'course.create' }));
    assert.equal((await readdir(join(root, '.local/cicd-release'))).includes('hosted-learning-loop'), false);
    assert.equal((await journal.read()).records.length, 0);
  });
});

test('community metadata rejects raw content unknown fields sparse sources and secret-bearing paths without hooks', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }); let hooks = 0;
    const getter = Object.defineProperty({ ...command }, 'key', { enumerable: true, get() { hooks++; return command.key; } });
    const sparse = new Array(2); sparse[1] = command.sourceIds[0];
    for (const input of [getter, { ...command, body: 'private pupil message' }, { ...command, nativeFingerprint: command.requestBodySha256 }, { ...command, sourceIds: sparse }, { ...command, path: '/v1/community/rooms?token=private' }, { ...command, schoolId: command.sourceIds[0] }]) await assert.rejects(journal.intent(input));
    assert.equal(hooks, 0); assert.equal((await journal.read()).commands.length, 0);
  });
});

test('community flushes and reads original intent before forwarding exactly once', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async (root, flushes) => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    const originalBytes = await readFile(join(scope(root), '000001.record.json'), 'utf8'); let forwarded = 0;
    await journal.startForwarding(original, async () => {
      forwarded++; assert(flushes.includes('file')); assert(flushes.includes('directory'));
      assert.equal((await journal.read()).commands[0].state, 'FORWARDING_AUTHORIZED');
      assert.equal((await readdir(scope(root))).includes('writer.lock'), false);
    });
    await assert.rejects(journal.startForwarding(original, async () => { forwarded++; })); assert.equal(forwarded, 1);
    await journal.recordHttpReceipt(original, http); await journal.recordNativeConfirmation(original, native);
    const saved = await journal.read(); assert.equal(saved.records.length, 4); assert.equal(saved.commands[0].state, 'NATIVE_CONFIRMED'); assert.equal(saved.hostedAcceptance, false);
    assert.equal(await readFile(join(scope(root), '000001.record.json'), 'utf8'), originalBytes);
  });
});

test('community does not accept HTTP before delayed original completion or after uncertainty', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    let started!: () => void, complete!: () => void; const invoked = new Promise<void>(done => { started = done; }), pending = new Promise<void>(done => { complete = done; });
    const forwarding = journal.startForwarding(original, async () => { started(); await pending; }); await invoked;
    await assert.rejects(journal.recordHttpReceipt(original, http)); await journal.markUncertain(original);
    complete(); await forwarding; await assert.rejects(journal.recordHttpReceipt(original, http));
    assert.equal((await journal.read()).commands[0].state, 'UNCERTAIN'); assert.equal(original.command.key, command.key);
  });
});

test('community changed original body key actor source revision identity and purpose cannot receive outcomes', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await journal.startForwarding(original, async () => undefined);
    for (const changed of [
      { ...original, command: { ...original.command, key: 'foreign-community-key' } },
      { ...original, command: { ...original.command, requestBodySha256: '0'.repeat(64) } },
      { ...original, command: { ...original.command, actorId: command.sourceIds[0] } },
      { ...original, command: { ...original.command, sourceIds: [command.actorId] } },
      { ...original, command: { ...original.command, sourceRevision: 2 } },
      { ...original, command: { ...original.command, operation: 'post.create' } },
      { ...original, identity: { ...identity, sourceSha: '0'.repeat(40) } },
      { ...original, identity: { ...identity, treeSha: '0'.repeat(40) } },
      { ...original, identity: { ...identity, runId: '82' } },
      { ...original, identity: { ...identity, runAttempt: 3 } },
      { ...original, identity: { ...identity, backendTransferSha256: '0'.repeat(64) } },
    ]) { await assert.rejects(journal.recordHttpReceipt(changed, http)); await assert.rejects(journal.recordNativeConfirmation(changed, native)); }
    await assert.rejects(journal.recordNativeConfirmation(original, { ...native, provenance: 'JOURNAL_IS_NATIVE_PROOF' }));
    assert.equal((await journal.read()).commands[0].state, 'FORWARDING_AUTHORIZED');
  });
});

test('community uncertain original blocks replacements reopened forwarding and foreign runs', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await assert.rejects(journal.startForwarding(original, async () => { throw Error('private-network-canary'); }), /requires review; contents withheld/);
    const reopened = await createHostedCommunityJournal({ repoRoot: root, identity }); let forwarded = 0;
    assert.equal((await reopened.read()).commands[0].state, 'UNCERTAIN');
    await assert.rejects(reopened.startForwarding(original, async () => { forwarded++; }));
    await assert.rejects(reopened.intent({ ...command, key: 'replacement-original-key' }));
    await assert.rejects(createHostedCommunityJournal({ repoRoot: root, identity: { ...identity, runId: '82' } }));
    assert.equal(forwarded, 0); assert.equal((await reopened.read()).commands[0].original.command.key, command.key);
    await reopened.recordNativeConfirmation(original, native);
    const nextRun = await createHostedCommunityJournal({ repoRoot: root, identity: { ...identity, runId: '82' } });
    const retained = await nextRun.read(); assert.equal(retained.commands[0].state, 'NATIVE_CONFIRMED'); assert.equal(retained.commands[0].original.command.key, command.key);
  });
});

test('community predecessor uncertainty during next admission blocks forwarding until original reconciliation', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    await journal.startForwarding(original, async () => undefined); await journal.recordHttpReceipt(original, http);
    const reopened = await createHostedCommunityJournal({ repoRoot: root, identity }); await assert.rejects(reopened.intent({ ...command, key: 'reopened-next-key' }));
    const next = await journal.intent({ ...command, operation: 'post.create', key: 'next-community-key' }); await journal.markUncertain(original);
    let forwarded = 0; await assert.rejects(journal.startForwarding(next, async () => { forwarded++; })); assert.equal(forwarded, 0);
    await journal.recordNativeConfirmation(original, native); await journal.startForwarding(next, async () => { forwarded++; }); assert.equal(forwarded, 1);
  });
});

test('community failed fsync retains writer reservation and forwards zero requests', async context => {
  const { createHostedCommunityJournal } = await api();
  await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command);
    const probe = await open(join(scope(root), 'owner.json'), 'r'), prototype = Object.getPrototypeOf(probe) as FileHandle; await probe.close();
    const originalSync = prototype.sync, intentSize = Buffer.byteLength(await readFile(join(scope(root), '000001.record.json'), 'utf8'));
    const fault = context.mock.method(prototype, 'sync', async function(this: FileHandle) {
      const stat = await this.stat(); if (stat.isFile() && stat.size > intentSize) throw Error('private-community-fsync-canary'); await originalSync.call(this);
    });
    let forwarded = 0; try { await assert.rejects(journal.startForwarding(original, async () => { forwarded++; }), /requires review; contents withheld/); } finally { fault.mock.restore(); }
    assert.equal(forwarded, 0); assert((await readdir(scope(root))).includes('writer.lock'));
    await assert.rejects(createHostedCommunityJournal({ repoRoot: root, identity }));
  });
});

test('community rejects mutable chains paired-head loss rollback and cross-purpose owner replacement', async context => {
  const { createHostedCommunityJournal } = await api();
  for (const mode of ['changed-body', 'changed-purpose', 'gap', 'head-loss', 'tail-rollback', 'owner-purpose', 'hardlink', 'oversize', 'unexpected'] as const) await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity }), original = await journal.intent(command), record = join(scope(root), '000001.record.json');
    if (mode === 'changed-body') await writeFile(record, (await readFile(record, 'utf8')).replace(command.key, 'altered-community-key'), { mode: 0o600 });
    if (mode === 'changed-purpose') await writeFile(record, (await readFile(record, 'utf8')).replace('CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL', 'CUEVO_HOSTED_LEARNING_LOOP_COMMAND_JOURNAL'), { mode: 0o600 });
    if (mode === 'gap') await rename(record, join(scope(root), '000002.record.json'));
    if (mode === 'head-loss') await rm(join(scope(root), '000001.head.json'));
    if (mode === 'tail-rollback') { await journal.startForwarding(original, async () => undefined); await journal.read(); await rm(join(scope(root), '000002.record.json')); await rm(join(scope(root), '000002.head.json')); }
    if (mode === 'owner-purpose') { const owner = join(scope(root), 'owner.json'); await writeFile(owner, (await readFile(owner, 'utf8')).replace('CUEVO_HOSTED_COMMUNITY_COMMAND_JOURNAL', 'CUEVO_HOSTED_LEARNING_LOOP_COMMAND_JOURNAL'), { mode: 0o600 }); }
    if (mode === 'hardlink') await link(record, join(root, 'linked-record'));
    if (mode === 'oversize') await writeFile(record, 'x'.repeat(16385), { mode: 0o600 });
    if (mode === 'unexpected') await writeFile(join(scope(root), 'unexpected.json'), '{}', { mode: 0o600 });
    await assert.rejects(journal.read()); if (mode !== 'tail-rollback') await assert.rejects(createHostedCommunityJournal({ repoRoot: root, identity }));
  });
});

test('community refuses current tracked ignored or redirected ownership before publishing', async context => {
  const { createHostedCommunityJournal } = await api();
  for (const mode of ['nonignored', 'tracked', 'owner-link', 'redirected'] as const) await fixture(context, async root => {
    const journal = await createHostedCommunityJournal({ repoRoot: root, identity });
    const outside = await mkdtemp(join(tmpdir(), 'cuevo-community-outside-'));
    try {
      if (mode === 'nonignored') await writeFile(join(root, '.gitignore'), '');
      if (mode === 'tracked') git(root, 'add', '--force', join(scope(root), 'owner.json'));
      if (mode === 'owner-link') await link(join(scope(root), 'owner.json'), join(root, 'linked-owner'));
      if (mode === 'redirected') { const target = join(root, '.local/cicd-release/hosted-community'); await rename(target, target + '-original'); await symlink(outside, target, process.platform === 'win32' ? 'junction' : 'dir'); }
      await assert.rejects(journal.intent(command)); assert.deepEqual(await readdir(outside), []);
    } finally { assert.equal(dirname(outside), resolve(tmpdir())); await rm(outside, { recursive: true, force: true }); }
  });
});

test('community unsupported native directory durability remains unavailable', async context => {
  const { createHostedCommunityJournal } = await api(); assert.equal(typeof createHostedCommunityJournal, 'function');
  if (process.platform !== 'win32') return;
  await fixture(context, async root => {
    const code = "const {createHostedCommunityJournal}=await import(process.argv[1]);try{await createHostedCommunityJournal({repoRoot:process.argv[2],identity:JSON.parse(process.argv[3])});console.log('ADMITTED')}catch{console.log('UNAVAILABLE')}";
    const result = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, pathToFileURL(resolve(import.meta.dirname, 'hosted-community-journal.ts')).href, root, JSON.stringify(identity)], { cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.trim(), 'UNAVAILABLE'); assert.equal((await readdir(scope(root))).includes('owner.json'), true);
  }, true);
});
