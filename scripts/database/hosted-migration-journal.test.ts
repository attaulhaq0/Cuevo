import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, link, mkdtemp, mkdir, open, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import type { FileHandle } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { HostedExecutionJournal } from './hosted-migration-execution';

const ref = 'mqxdjvsyckzocokuikmx';
const identity: HostedExecutionJournal['identity'] = {
  projectRef: ref, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40),
  planSha256: 'c'.repeat(64), stageId: 'prefix', stageSha256: 'd'.repeat(64),
  databaseUrl: `postgresql://postgres@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,
  approvalDigest: 'e'.repeat(64), ciRunId: '42', certificateSha256: 'f'.repeat(64),
};
const payload = (state: HostedExecutionJournal['state']): HostedExecutionJournal => ({
  version: 1, identity: structuredClone(identity), state,
  schemaHistoryAtomic: false, evidence: 'SUPPLIED_PORT_EXECUTION_ONLY',
});
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
}).trim();
async function api() {
  let module: Record<string, unknown> = {};
  try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-migration-journal.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.createHostedMigrationJournal, 'function', 'native journal factory exists');
  return module as typeof import('./hosted-migration-journal');
}
type Input = { repoRoot: string; journalRoot: string; identity: HostedExecutionJournal['identity'] };
async function fixture(run: (input: Input) => Promise<void>) {
  const repoRoot = await mkdtemp(join(tmpdir(), 'cuevo-hosted-journal-'));
  try {
    await writeFile(join(repoRoot, '.gitignore'), '.local/\n');
    git(repoRoot, 'init', '--quiet');
    await run({ repoRoot, journalRoot: join(repoRoot, '.local', 'hosted-release', 'journal-original-operation'), identity: structuredClone(identity) });
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
}
async function supportsDirectorySync(path: string) {
  try { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } return true; }
  catch { return false; }
}

test('original intent acknowledgement returns exact owner and record1 hashes after current durable reads',async()=>{
 const{createHostedMigrationJournal}=await api();await fixture(async input=>{const adapter=await createHostedMigrationJournal(input),intent=payload('INTENT'),bytes=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:intent,payloadSha256:hash(intent)})+'\n';await writeFile(join(input.journalRoot,'000001.record.json'),bytes,{mode:0o600});const owner=await readFile(join(input.journalRoot,'owner.json'));
  if(await supportsDirectorySync(input.repoRoot)){assert.deepEqual(await adapter.readOriginalIntentAcknowledgement(),{payload:intent,ownerSha256:createHash('sha256').update(owner).digest('hex'),record1Sha256:createHash('sha256').update(bytes).digest('hex')});}else await assert.rejects(adapter.readOriginalIntentAcknowledgement());assert.equal(await readFile(join(input.journalRoot,'000001.record.json'),'utf8'),bytes);
 });
});

test('original intent acknowledgement refuses absent terminal additional and changed first-record chains',async()=>{
 const{createHostedMigrationJournal}=await api();for(const mode of['absent','terminal','extra','digest']as const)await fixture(async input=>{const adapter=await createHostedMigrationJournal(input),intent=payload('INTENT'),bytes=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:intent,payloadSha256:mode==='digest'?'0'.repeat(64):hash(intent)})+'\n';if(mode!=='absent')await writeFile(join(input.journalRoot,'000001.record.json'),bytes,{mode:0o600});if(mode==='terminal'){const committed=payload('COMMITTED');await writeFile(join(input.journalRoot,'000002.record.json'),JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:2,previousSha256:createHash('sha256').update(bytes).digest('hex'),payload:committed,payloadSha256:hash(committed)})+'\n',{mode:0o600});}if(mode==='extra')await writeFile(join(input.journalRoot,'unrecognized.json'),'{}\n',{mode:0o600});await assert.rejects(adapter.readOriginalIntentAcknowledgement());assert.equal((await readdir(input.journalRoot)).includes('writer.lock'),false);
 });
});

test('original intent acknowledgement with a failed file flush returns only the fixed review error',async context=>{
 const{createHostedMigrationJournal}=await api();await fixture(async input=>{const adapter=await createHostedMigrationJournal(input),intent=payload('INTENT'),bytes=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:intent,payloadSha256:hash(intent)})+'\n';await writeFile(join(input.journalRoot,'000001.record.json'),bytes,{mode:0o600});const probe=await open(join(input.journalRoot,'000001.record.json'),'r'),prototype=Object.getPrototypeOf(probe) as FileHandle;await probe.close();const mocked=context.mock.method(prototype,'sync',async function(this:FileHandle){if((await this.stat()).isFile())throw Error('private-original-intent-flush-canary');});try{await assert.rejects(adapter.readOriginalIntentAcknowledgement(),error=>error instanceof Error&&/requires review; contents withheld/.test(error.message)&&!error.message.includes('canary'));}finally{mocked.mock.restore();}assert.equal(await readFile(join(input.journalRoot,'000001.record.json'),'utf8'),bytes);
 });
});

test('linked native terminal remains in the original local record chain with exact v1 owner and intent bytes',async()=>{
 const{createHostedMigrationJournal}=await api();await fixture(async input=>{const original={...identity,stageId:'native' as const},adapter=await createHostedMigrationJournal({...input,identity:original}),intent={...payload('INTENT'),identity:original},first=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:intent,payloadSha256:hash(intent)})+'\n',current={...original,sourceSha:'1'.repeat(40),treeSha:'2'.repeat(40),approvalDigest:'3'.repeat(64),ciRunId:'51'},link={version:1 as const,purpose:'CUEVO_ORIGINAL_NATIVE_INTENT_EXECUTION' as const,originalOperationSha256:hash(original),originalIntentSha256:hash(intent),templateSha256:'4'.repeat(64),selectionSha256:'5'.repeat(64),currentExecutionIdentity:current,runId:'61',runAttempt:1,approvalObservedAtMs:1000,nativeProofBeganAtMs:2000,beforeHistorySha256:'6'.repeat(64),afterHistorySha256:'7'.repeat(64)},terminal:HostedExecutionJournal={evidence:'SUPPLIED_PORT_EXECUTION_ONLY',originalIntentExecution:link,state:'COMMITTED',version:2,identity:original,schemaHistoryAtomic:false},second=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:2,previousSha256:createHash('sha256').update(first).digest('hex'),payload:terminal,payloadSha256:hash(terminal)})+'\n';
  await writeFile(join(input.journalRoot,'000001.record.json'),first,{mode:0o600});await writeFile(join(input.journalRoot,'000002.record.json'),second,{mode:0o600});const owner=await readFile(join(input.journalRoot,'owner.json'),'utf8');assert.equal(JSON.stringify(JSON.parse(second).payload),JSON.stringify(terminal));if(await supportsDirectorySync(input.repoRoot)){assert.deepEqual(await adapter.readJournal(),terminal);assert.deepEqual(await(await createHostedMigrationJournal({...input,identity:original})).readJournal(),terminal);}else await assert.rejects(adapter.readJournal());await assert.rejects(adapter.readOriginalIntentAcknowledgement());assert.equal(await readFile(join(input.journalRoot,'owner.json'),'utf8'),owner);assert.equal(await readFile(join(input.journalRoot,'000001.record.json'),'utf8'),first);assert.equal(await readFile(join(input.journalRoot,'000002.record.json'),'utf8'),second);
 });
});

test('linked native terminal must reference the actual first local intent payload bytes',async context=>{
 const{createHostedMigrationJournal}=await api();await fixture(async input=>{const original={...identity,stageId:'native' as const},adapter=await createHostedMigrationJournal({...input,identity:original}),intent={evidence:'SUPPLIED_PORT_EXECUTION_ONLY',identity:original,state:'INTENT',version:1,schemaHistoryAtomic:false},canonicalIntent={version:1,identity:original,state:'INTENT',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'},first=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:intent,payloadSha256:hash(intent)})+'\n',terminal={version:2,identity:original,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',originalIntentExecution:{version:1,purpose:'CUEVO_ORIGINAL_NATIVE_INTENT_EXECUTION',originalOperationSha256:hash(original),originalIntentSha256:hash(canonicalIntent),templateSha256:'4'.repeat(64),selectionSha256:'5'.repeat(64),currentExecutionIdentity:{...original,sourceSha:'1'.repeat(40),treeSha:'2'.repeat(40),approvalDigest:'3'.repeat(64),ciRunId:'51'},runId:'61',runAttempt:1,approvalObservedAtMs:1000,nativeProofBeganAtMs:2000,beforeHistorySha256:'6'.repeat(64),afterHistorySha256:'7'.repeat(64)}},second=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:2,previousSha256:createHash('sha256').update(first).digest('hex'),payload:terminal,payloadSha256:hash(terminal)})+'\n';assert.notEqual(hash(intent),hash(canonicalIntent));await writeFile(join(input.journalRoot,'000001.record.json'),first,{mode:0o600});await writeFile(join(input.journalRoot,'000002.record.json'),second,{mode:0o600});
  const handle=await open(join(input.journalRoot,'000001.record.json'),'r'),prototype=Object.getPrototypeOf(handle) as FileHandle;await handle.close();const mocked=context.mock.method(prototype,'sync',async function(this:FileHandle){if((await this.stat()).isDirectory())return;});try{await assert.rejects(adapter.readJournal());await assert.rejects(createHostedMigrationJournal({...input,identity:original}));}finally{mocked.mock.restore();}assert.equal(await readFile(join(input.journalRoot,'000001.record.json'),'utf8'),first);assert.equal(await readFile(join(input.journalRoot,'000002.record.json'),'utf8'),second);
 });
});

test('actual local linked terminal publication appends one immutable record and keeps its original owner and intent',async context=>{
 const{createHostedMigrationJournal}=await api();await fixture(async input=>{const original={...identity,stageId:'native' as const},adapter=await createHostedMigrationJournal({...input,identity:original}),intent:HostedExecutionJournal={version:1,identity:original,state:'INTENT',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'},current={...original,sourceSha:'1'.repeat(40),treeSha:'2'.repeat(40),approvalDigest:'3'.repeat(64),ciRunId:'51'},terminal:HostedExecutionJournal={version:2,identity:original,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',originalIntentExecution:{version:1,purpose:'CUEVO_ORIGINAL_NATIVE_INTENT_EXECUTION',originalOperationSha256:hash(original),originalIntentSha256:hash(intent),templateSha256:'4'.repeat(64),selectionSha256:'5'.repeat(64),currentExecutionIdentity:current,runId:'61',runAttempt:1,approvalObservedAtMs:1000,nativeProofBeganAtMs:2000,beforeHistorySha256:'6'.repeat(64),afterHistorySha256:'7'.repeat(64)}},probe=await open(join(input.journalRoot,'owner.json'),'r'),prototype=Object.getPrototypeOf(probe) as FileHandle;await probe.close();const actualSync=prototype.sync,mocked=context.mock.method(prototype,'sync',async function(this:FileHandle){if((await this.stat()).isDirectory())return;await actualSync.call(this);});
  try{assert.deepEqual(await adapter.writeJournal(intent),{kind:'SYNCED',sha256:hash(intent)});const owner=await readFile(join(input.journalRoot,'owner.json'),'utf8'),first=await readFile(join(input.journalRoot,'000001.record.json'),'utf8');assert.deepEqual(await adapter.writeJournal(terminal),{kind:'SYNCED',sha256:hash(terminal)});const second=await readFile(join(input.journalRoot,'000002.record.json'),'utf8');assert.equal(JSON.parse(second).previousSha256,createHash('sha256').update(first).digest('hex'));assert.deepEqual(await adapter.writeJournal(terminal),{kind:'SYNCED',sha256:hash(terminal)});assert.deepEqual(await adapter.readJournal(),terminal);assert.deepEqual((await readdir(input.journalRoot)).sort(),['000001.record.json','000002.record.json','owner.json']);assert.equal(await readFile(join(input.journalRoot,'owner.json'),'utf8'),owner);assert.equal(await readFile(join(input.journalRoot,'000001.record.json'),'utf8'),first);assert.equal(await readFile(join(input.journalRoot,'000002.record.json'),'utf8'),second);await assert.rejects(adapter.readOriginalIntentAcknowledgement());}finally{mocked.mock.restore();}
 });
});

test('native journal publishes exact intent bytes without replacing original records', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const adapter = await createHostedMigrationJournal(input);
    assert.equal(await adapter.readJournal(), null);
    const intent = payload('INTENT');
    const receipt = await adapter.writeJournal(intent);
    const files = (await readdir(input.journalRoot)).filter(name => name.endsWith('.record.json'));
    assert.equal(files.length, 1);
    const bytes = await readFile(join(input.journalRoot, files[0]), 'utf8');
    const stored = JSON.parse(bytes) as { payload: HostedExecutionJournal; payloadSha256: string };
    assert.deepEqual(stored.payload, intent);
    assert.equal(stored.payloadSha256, hash(intent));
    if (await supportsDirectorySync(input.journalRoot)) {
      assert.deepEqual(receipt, { kind: 'SYNCED', sha256: hash(intent) });
      assert.deepEqual(await adapter.readJournal(), intent);
    } else {
      assert.deepEqual(receipt, { kind: 'UNCONFIRMED' });
      await assert.rejects(adapter.readJournal(), /requires review; contents withheld/);
    }
    assert.equal((await readFile(join(input.journalRoot, files[0]), 'utf8')), bytes);
    if (process.platform !== 'win32') {
      assert.equal((await stat(input.journalRoot)).mode & 0o777, 0o700);
      assert.equal((await stat(join(input.journalRoot, files[0]))).mode & 0o777, 0o600);
    }
  });
});

test('journal ownership refuses an existing foreign directory and mismatched original operation', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    await mkdir(input.journalRoot, { recursive: true });
    await writeFile(join(input.journalRoot, 'foreign.txt'), 'do not overwrite');
    await assert.rejects(createHostedMigrationJournal(input));
    assert.equal(await readFile(join(input.journalRoot, 'foreign.txt'), 'utf8'), 'do not overwrite');
    await rm(input.journalRoot, { recursive: true });
    await createHostedMigrationJournal(input);
    for (const patch of [
      { projectRef: 'z'.repeat(20) }, { sourceSha: '0'.repeat(40) }, { stageId: 'native' as const },
      { approvalDigest: '0'.repeat(64) }, { certificateSha256: '0'.repeat(64) }, { ciRunId: '43' },
    ]) await assert.rejects(createHostedMigrationJournal({ ...input, identity: { ...input.identity, ...patch } }));
  });
});

test('journal refuses external aliased nested and currently nonignored owned paths before writing', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    for (const journalRoot of [join(input.repoRoot, 'journal-outside'), join(input.journalRoot, 'nested'), input.journalRoot + '/']) {
      await assert.rejects(createHostedMigrationJournal({ ...input, journalRoot }));
    }
    assert.equal((await readdir(input.repoRoot)).includes('.local'), false);
    await writeFile(join(input.repoRoot, '.gitignore'), '');
    await assert.rejects(createHostedMigrationJournal(input));
    await writeFile(join(input.repoRoot, '.gitignore'), '.local/\n');
    const adapter = await createHostedMigrationJournal(input);
    await writeFile(join(input.repoRoot, '.gitignore'), '');
    assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
    assert.equal((await readdir(input.journalRoot)).some(name => name.endsWith('.record.json')), false);
  });
});

test('invalid state transition cannot reserve or poison a readable original journal', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const adapter = await createHostedMigrationJournal(input);
    assert.deepEqual(await adapter.writeJournal(payload('COMMITTED')), { kind: 'UNCONFIRMED' });
    assert.deepEqual(await readdir(input.journalRoot), ['owner.json']);
    assert.equal(await adapter.readJournal(), null);
  });
});

test('native synced history retains intent, idempotent outcomes and review after uncertain cleanup', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const adapter = await createHostedMigrationJournal(input);
    if (!await supportsDirectorySync(input.repoRoot)) {
      assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
      await assert.rejects(adapter.readJournal());
      await assert.rejects(createHostedMigrationJournal(input));
      return;
    }
    for (const state of ['INTENT', 'COMMITTED', 'REQUIRES_REVIEW'] as const) {
      const value = payload(state);
      assert.deepEqual(await adapter.writeJournal(value), { kind: 'SYNCED', sha256: hash(value) });
      const names = await readdir(input.journalRoot);
      const records = names.filter(name => name.endsWith('.record.json'));
      const original = await readFile(join(input.journalRoot, '000001.record.json'), 'utf8');
      assert.deepEqual(await adapter.writeJournal(value), { kind: 'SYNCED', sha256: hash(value) });
      assert.equal((await readdir(input.journalRoot)).filter(name => name.endsWith('.record.json')).length, records.length);
      assert.deepEqual(await adapter.readJournal(), value);
      assert.equal(await readFile(join(input.journalRoot, '000001.record.json'), 'utf8'), original);
      const reopened = await createHostedMigrationJournal(input);
      assert.deepEqual(await reopened.readJournal(), value);
    }
    assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
    assert.deepEqual(await adapter.readJournal(), payload('REQUIRES_REVIEW'));
    assert.equal((await readdir(input.journalRoot)).filter(name => name.endsWith('.record.json')).length, 3);
  });
});

test('symlinked ancestors never redirect journal output or current reads outside the admitted repository', async () => {
  const { createHostedMigrationJournal } = await api();
  for (const position of ['repo', 'local', 'release', 'journal', 'replaced'] as const) {
    await fixture(async input => {
      const outside = await mkdtemp(join(tmpdir(), 'cuevo-journal-outside-'));
      try {
        let path: string;
        if (position === 'repo') {
          path = input.repoRoot + '-alias';
          await symlink(input.repoRoot, path, process.platform === 'win32' ? 'junction' : 'dir');
          try { await assert.rejects(createHostedMigrationJournal({ ...input, repoRoot: path, journalRoot: join(path, '.local', 'hosted-release', 'journal-original-operation') })); }
          finally { await rm(path, { force: true }); }
        } else if (position === 'replaced') {
          const adapter = await createHostedMigrationJournal(input);
          await rename(input.journalRoot, input.journalRoot + '-preserved');
          await symlink(outside, input.journalRoot, process.platform === 'win32' ? 'junction' : 'dir');
          assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
          await assert.rejects(adapter.readJournal());
        } else {
          path = position === 'local' ? join(input.repoRoot, '.local') : position === 'release' ? join(input.repoRoot, '.local', 'hosted-release') : input.journalRoot;
          await mkdir(resolve(path, '..'), { recursive: true });
          await symlink(outside, path, process.platform === 'win32' ? 'junction' : 'dir');
          await assert.rejects(createHostedMigrationJournal(input));
        }
        assert.deepEqual(await readdir(outside), []);
      } finally { await rm(outside, { recursive: true, force: true }); }
    });
  }
});

test('replaced owner files, hard links and newly tracked local receipts are refused without overwrite', async () => {
  const { createHostedMigrationJournal } = await api();
  for (const mode of ['owner', 'hardlink', 'tracked'] as const) {
    await fixture(async input => {
      const adapter = await createHostedMigrationJournal(input);
      const ownerPath = join(input.journalRoot, 'owner.json');
      const original = await readFile(ownerPath, 'utf8');
      if (mode === 'owner') {
        await rename(ownerPath, join(input.journalRoot, 'owner-preserved.json'));
        await writeFile(ownerPath, original, { mode: 0o600 });
      } else if (mode === 'hardlink') await link(ownerPath, join(input.repoRoot, 'owner-linked'));
      else git(input.repoRoot, 'add', '--force', ownerPath);
      assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
      await assert.rejects(adapter.readJournal());
      assert.equal(await readFile(ownerPath, 'utf8'), original);
      assert.equal((await readdir(input.journalRoot)).filter(name => name.endsWith('.record.json')).length, 0);
    });
  }
});

test('corrupt bytes, state gaps, wrong identity, digest mismatch and abandoned temporary publication require review', async () => {
  const { createHostedMigrationJournal } = await api();
  for (const mode of ['corrupt', 'gap', 'identity', 'digest', 'temporary', 'lock', 'oversize', 'hardlink'] as const) {
    await fixture(async input => {
      const adapter = await createHostedMigrationJournal(input);
      const value = payload('INTENT');
      const record = { version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', sequence: 1, previousSha256: null, payload: value, payloadSha256: hash(value) };
      if (mode === 'identity') record.payload.identity.approvalDigest = '0'.repeat(64);
      if (mode === 'digest') record.payloadSha256 = '0'.repeat(64);
      const name = mode === 'temporary' ? '.abandoned.tmp' : mode === 'lock' ? 'writer.lock' : mode === 'gap' ? '000002.record.json' : '000001.record.json';
      const bytes = mode === 'corrupt' ? '{truncated' : mode === 'oversize' ? 'x'.repeat(32769) : JSON.stringify(record) + '\n';
      await writeFile(join(input.journalRoot, name), bytes, { mode: 0o600 });
      if (mode === 'hardlink') await link(join(input.journalRoot, name), join(input.repoRoot, 'record-linked'));
      await assert.rejects(adapter.readJournal(), /requires review; contents withheld/);
      await assert.rejects(createHostedMigrationJournal(input));
      assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
      assert.equal(await readFile(join(input.journalRoot, name), 'utf8'), bytes);
    });
  }
});

test('untrusted identity and payload accessors, proxies, credentials and extra fields never reach disk', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    let getterReads = 0;
    const accessor = { ...input.identity, get sourceSha() { getterReads++; return identity.sourceSha; } };
    await assert.rejects(createHostedMigrationJournal({ ...input, identity: accessor }));
    await assert.rejects(createHostedMigrationJournal({ ...input, identity: new Proxy(input.identity, {}) }));
    await assert.rejects(createHostedMigrationJournal({ ...input, identity: { ...input.identity, databaseUrl: identity.databaseUrl.replace('postgres@', 'postgres:private-canary@') } }));
    assert.equal(getterReads, 0);
    const adapter = await createHostedMigrationJournal(input);
    const unsafe = [
      { ...payload('INTENT'), get state() { getterReads++; return 'INTENT' as const; } },
      new Proxy(payload('INTENT'), {}),
      { ...payload('INTENT'), extra: 'private-canary' },
      { ...payload('INTENT'), identity: { ...identity, databaseUrl: identity.databaseUrl.replace('postgres@', 'postgres:private-canary@') } },
    ];
    for (const value of unsafe) assert.deepEqual(await adapter.writeJournal(value as HostedExecutionJournal), { kind: 'UNCONFIRMED' });
    assert.equal(getterReads, 0);
    assert.deepEqual(await readdir(input.journalRoot), ['owner.json']);
    assert.equal((await readFile(join(input.journalRoot, 'owner.json'), 'utf8')).includes('private-canary'), false);
  });
});

test('only one concurrent native writer may publish the same original intent', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const first = await createHostedMigrationJournal(input);
    const second = await createHostedMigrationJournal(input);
    const replies = await Promise.all([first.writeJournal(payload('INTENT')), second.writeJournal(payload('INTENT'))]);
    assert.equal(replies.filter(reply => reply.kind === 'SYNCED').length, await supportsDirectorySync(input.repoRoot) ? 1 : 0);
    assert.equal((await readdir(input.journalRoot)).filter(name => name.endsWith('.record.json')).length, 1);
    const original = JSON.parse(await readFile(join(input.journalRoot, '000001.record.json'), 'utf8')) as { payload: HostedExecutionJournal };
    assert.deepEqual(original.payload, payload('INTENT'));
  });
});

test('cached confirmed bytes alone cannot bypass missing native directory durability', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const adapter = await createHostedMigrationJournal(input);
    const intent = payload('INTENT');
    const before = JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', sequence: 1, previousSha256: null, payload: intent, payloadSha256: hash(intent) }) + '\n';
    const committed = payload('COMMITTED');
    const after = JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', sequence: 2, previousSha256: createHash('sha256').update(before).digest('hex'), payload: committed, payloadSha256: hash(committed) }) + '\n';
    await writeFile(join(input.journalRoot, '000001.record.json'), before, { mode: 0o600 });
    await writeFile(join(input.journalRoot, '000002.record.json'), after, { mode: 0o600 });
    if (await supportsDirectorySync(input.repoRoot)) assert.deepEqual(await adapter.readJournal(), committed);
    else await assert.rejects(adapter.readJournal(), /requires review; contents withheld/);
  });
});

test('Unix readable-to-others journals and files require review rather than silently chmod adoption', async () => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const adapter = await createHostedMigrationJournal(input);
    if (process.platform === 'win32') {
      assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
      await assert.rejects(adapter.readJournal());
      return;
    }
    for (const [path, mode] of [[input.journalRoot, 0o750], [join(input.journalRoot, 'owner.json'), 0o640]] as const) {
      await chmod(path, mode);
      assert.deepEqual(await adapter.writeJournal(payload('INTENT')), { kind: 'UNCONFIRMED' });
      await assert.rejects(adapter.readJournal());
      await assert.rejects(createHostedMigrationJournal(input));
      assert.equal((await stat(path)).mode & 0o777, mode);
      await chmod(path, path === input.journalRoot ? 0o700 : 0o600);
    }
  });
});

test('native file flush failure never elevates a cached committed chain to confirmed history', async context => {
  const { createHostedMigrationJournal } = await api();
  await fixture(async input => {
    const adapter = await createHostedMigrationJournal(input);
    const intent = payload('INTENT');
    const before = JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', sequence: 1, previousSha256: null, payload: intent, payloadSha256: hash(intent) }) + '\n';
    const committed = payload('COMMITTED');
    const after = JSON.stringify({ version: 1, purpose: 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', sequence: 2, previousSha256: createHash('sha256').update(before).digest('hex'), payload: committed, payloadSha256: hash(committed) }) + '\n';
    await writeFile(join(input.journalRoot, '000001.record.json'), before, { mode: 0o600 });
    await writeFile(join(input.journalRoot, '000002.record.json'), after, { mode: 0o600 });
    const probe = await open(join(input.journalRoot, '000001.record.json'), 'r');
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    await probe.close();
    // Isolate the file-flush refusal from Windows directory-sync refusal; this fault probe never proves native SYNCED execution.
    const replacement = context.mock.method(prototype, 'sync', async function(this: FileHandle) {
      if ((await this.stat()).isFile()) throw new Error('private-flush-failure-canary');
    });
    try {
      await assert.rejects(adapter.readJournal(), error => error instanceof Error && /requires review; contents withheld/.test(error.message) && !error.message.includes('canary'));
      assert.equal(await readFile(join(input.journalRoot, '000002.record.json'), 'utf8'), after);
    } finally { replacement.mock.restore(); }
  });
});
