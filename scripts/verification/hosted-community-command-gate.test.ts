import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { registerHooks } from 'node:module';
import { canonicalReleaseExecutionJson } from './release-review';
import { hostedCommunityRecipeText as text, parseHostedCommunityCommand } from './hosted-community-command';
import { hostedCommandJournalContracts, type HostedCommandJournalRecord, type HostedCommandJournalRead } from './hosted-command-journal-contracts';
import type { HostedCommunityJournalOriginal } from './hosted-community-journal';
import type { HostedCommunityLivePrefixInput } from './backend-hosted-community-artifact';

// Only controlled test tokens are recognized. Production imports the separate
// live read owner; fixtures never create genuine current-context authority.
const fixtureProofs = new WeakMap<object, { expected: unknown; receipt: Record<string, unknown>; consumed: boolean }>();
Object.assign(globalThis, { communityGateConsumeProof(proof: unknown, expected: unknown) {
  const retained = proof && typeof proof === 'object' ? fixtureProofs.get(proof) : undefined;
  if (!retained || retained.consumed || canonicalReleaseExecutionJson(retained.expected) !== canonicalReleaseExecutionJson(expected)) throw Error('Controlled proof refused');
  retained.consumed = true; return retained.receipt;
} });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './hosted-community-live-prefix' && context.parentURL?.endsWith('/hosted-community-command-gate.ts')) return { url: 'fixture:community-gate-live-proof', shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url === 'fixture:community-gate-live-proof') return { format: 'module', shortCircuit: true, source: 'export const consumeHostedCommunityLivePrefixProof=globalThis.communityGateConsumeProof;' };
  return next(url, context);
} });

const hash = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const ids = { school: '10000000-0000-4000-8000-000000000001', class: '30000000-0000-4000-8000-000000000001', teacher: '20000000-0000-4000-8000-000000000004', student: '20000000-0000-4000-8000-000000000012', peer: '20000000-0000-4000-8000-000000000018', parent: '20000000-0000-4000-8000-000000000072', group: '93000000-0000-4000-8000-000000000001' } as const;
const identity = { projectRef: 'mqxdjvsyckzocokuikmx', schoolId: ids.school, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), ciRunId: '31', runId: '81', runAttempt: 1, backendTransferSha256: 'c'.repeat(64), webDeploymentId: 'dpl_Web' };
const actor = { actorId: ids.teacher, schoolId: ids.school, role: 'teacher' as const, email: 'samira@cuevo.test', displayName: 'Samira Hassan' };
const scope = { synthetic: true as const, schoolId: ids.school, classId: ids.class, teacherActorId: ids.teacher, studentActorId: ids.student, peerActorId: ids.peer, parentActorId: ids.parent, group: null, postIds: [], announcement: null };
const origin = 'https://api.cuevo-fixture.invalid';

async function api() {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-community-command-gate.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof subject.createHostedCommunityCommandGate, 'function', 'a confined original community command gate exists');
  return subject as typeof import('./hosted-community-command-gate');
}

test('community forwarding requires one exact planned current session and a durable original intent', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const events: string[] = []; let original: unknown;
  const journal = {
    async intent(command: unknown) { events.push('intent'); original = { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; return original; },
    async startForwarding(value: unknown, forward: () => Promise<unknown>) { assert.deepEqual(value, original); events.push('forwarding'); return forward(); },
    async recordHttpReceipt(value: unknown) { assert.deepEqual(value, original); events.push('http'); },
    async markUncertain() { events.push('uncertain'); }, async read() { return { commands: [], records: [] }; },
  };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => { events.push('admit'); }, persist: async (_name, value) => { events.push('persist'); return hash(value); } });
  gate.session(actor, 'current-token', 1);
  // The source-owned finite recipe must be supplied by the actual parser.
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  const body = { classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] };
  const bytes = Buffer.from(JSON.stringify(body));
  const request = { method: () => 'POST', url: () => origin + '/v1/community/rooms', headers: () => ({ authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': 'original-community-create', 'content-type': 'application/json' }), postDataBuffer: () => bytes };
  const intent = { actor, path: '/v1/community/rooms', scopeGeneration: 1 };
  await gate.prepare(intent);
  gate.session(actor,'current-token',1);
  await gate.forward(request as never, async () => { events.push('effect'); });
  gate.session(actor,'current-token',1);
  assert.deepEqual(events, ['admit', 'intent', 'persist', 'forwarding', 'admit', 'effect']);
  await gate.confirm({ ...intent, request: request as never, key: 'original-community-create', body, receipt: { id: ids.group, roomId: ids.group, command: 'room.create' }, status: 200 }, 'request-1');
  assert.equal(gate.confirmedCount(), 1); assert.deepEqual(gate.scope().group, { id: ids.group, revision: 1 });
  assert.equal(gate.receipts()[0].nativeChainVerified, false);
  assert.deepEqual(gate.receipts()[0].input, body, 'the finite source-owned input must survive for exact native fingerprint verification');
  assert.doesNotMatch(JSON.stringify(gate.receipts()), /current-token|Bearer|samira@/);
  assert.equal(events.filter(value => value === 'effect').length, 1);
  await assert.rejects(gate.forward(request as never, async () => { events.push('effect'); }));
  assert.equal(events.filter(value => value === 'effect').length, 1);
});

test('unplanned foreign or changed session requests invoke no effect or original intent', async () => {
  const { createHostedCommunityCommandGate } = await api(); let calls = 0;
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: { intent: async () => { calls++; }, markUncertain: async () => {} } as never, readmit: async () => {}, persist: async () => 'd'.repeat(64) });
  gate.session(actor, 'current-token', 1);
  const request = { method: () => 'POST', url: () => origin + '/v1/community/rooms', headers: () => ({}), postDataBuffer: () => Buffer.from('{}') };
  await assert.rejects(gate.forward(request as never, async () => { calls++; })); assert.equal(calls, 0);
  await assert.rejects(gate.prepare({ actor, path: '/v1/community/rooms', scopeGeneration: 1 }));
});

test('late admission drift after intent retains uncertainty and prevents the original callback', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  let admissions = 0, effects = 0, uncertain = 0;
  const journal = { async intent(command: unknown) { return { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; }, async startForwarding(_original: unknown, forward: () => Promise<void>) { return forward(); }, async markUncertain() { uncertain++; } };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => { if (++admissions === 2) throw Error('Changed current source'); }, persist: async (_name, value) => hash(value) });
  gate.session(actor, 'current-token', 1); await gate.prepare({ actor, path: '/v1/community/rooms', scopeGeneration: 1 });
  const request = { method: () => 'POST', url: () => origin + '/v1/community/rooms', headers: () => ({ authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': 'original-community-create', 'content-type': 'application/json' }), postDataBuffer: () => Buffer.from(JSON.stringify({ classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] })) };
  await assert.rejects(gate.forward(request as never, async () => { effects++; }));
  assert.equal(effects, 0); assert.equal(uncertain, 1); assert.equal(gate.confirmedCount(), 0);
});

test('a changed command-observation path cannot confirm the original HTTP outcome', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  let confirmations = 0, uncertain = 0;
  const journal = { async intent(command: unknown) { return { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; }, async startForwarding(_original: unknown, forward: () => Promise<void>) { return forward(); }, async recordHttpReceipt() { confirmations++; }, async markUncertain() { uncertain++; } };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => {}, persist: async (_name, value) => hash(value) });
  gate.session(actor, 'current-token', 1); const intent = { actor, path: '/v1/community/rooms', scopeGeneration: 1 }; await gate.prepare(intent);
  const body = { classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] }, bytes = Buffer.from(JSON.stringify(body));
  const request = { method: () => 'POST', url: () => origin + intent.path, headers: () => ({ authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': 'original-community-create', 'content-type': 'application/json' }), postDataBuffer: () => bytes };
  await gate.forward(request as never, async () => {});
  await assert.rejects(gate.confirm({ ...intent, path: '/v1/community/announcements', request: request as never, key: 'original-community-create', body, receipt: { id: ids.group, roomId: ids.group, command: 'room.create' }, status: 200 }, 'request-1'));
  assert.equal(confirmations, 0); assert.equal(uncertain, 1); assert.equal(gate.confirmedCount(), 0);
});

test('a UTF-8 BOM cannot replace exact raw body provenance before the original effect', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  let intents = 0, effects = 0;
  const journal = { async intent(command: unknown) { intents++; return { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; }, async startForwarding(_original: unknown, forward: () => Promise<void>) { return forward(); }, async markUncertain() {} };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => {}, persist: async (_name, value) => hash(value) });
  gate.session(actor, 'current-token', 1); const intent = { actor, path: '/v1/community/rooms', scopeGeneration: 1 }; await gate.prepare(intent);
  const body = { classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] }, bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(body))]);
  const request = { method: () => 'POST', url: () => origin + intent.path, headers: () => ({ authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': 'original-community-create', 'content-type': 'application/json' }), postDataBuffer: () => bytes };
  await assert.rejects(gate.forward(request as never, async () => { effects++; }));
  assert.equal(intents, 0); assert.equal(effects, 0);
});

test('a request-key change during final admission cannot alter the original forwarded tuple', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  let admissions = 0, effects = 0, uncertain = 0, key = 'original-community-create';
  const journal = { async intent(command: unknown) { return { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; }, async startForwarding(_original: unknown, forward: () => Promise<void>) { return forward(); }, async markUncertain() { uncertain++; } };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => { if (++admissions === 2) key = 'substituted-community-key'; }, persist: async (_name, value) => hash(value) });
  gate.session(actor, 'current-token', 1); const intent = { actor, path: '/v1/community/rooms', scopeGeneration: 1 }; await gate.prepare(intent);
  const bytes = Buffer.from(JSON.stringify({ classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] }));
  const request = { method: () => 'POST', url: () => origin + intent.path, headers: () => ({ authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': key, 'content-type': 'application/json' }), postDataBuffer: () => bytes };
  await assert.rejects(gate.forward(request as never, async () => { effects++; })); assert.equal(effects, 0); assert.equal(uncertain, 1);
});

test('mutable request buffers cannot change the admitted body while final admission awaits', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  let admissions = 0, effects = 0, uncertain = 0;
  const bytes = Buffer.from(JSON.stringify({ classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] }));
  const journal = { async intent(command: unknown) { return { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; }, async startForwarding(_original: unknown, forward: () => Promise<void>) { return forward(); }, async markUncertain() { uncertain++; } };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => { if (++admissions === 2) bytes.write('CLASS', bytes.indexOf('GROUP')); }, persist: async (_name, value) => hash(value) });
  gate.session(actor, 'current-token', 1); const intent = { actor, path: '/v1/community/rooms', scopeGeneration: 1 }; await gate.prepare(intent);
  const request = { method: () => 'POST', url: () => origin + intent.path, headers: () => ({ authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': 'original-community-create', 'content-type': 'application/json' }), postDataBuffer: () => bytes };
  await assert.rejects(gate.forward(request as never, async () => { effects++; })); assert.equal(effects, 0); assert.equal(uncertain, 1);
});

test('mutable header objects cannot substitute content type during final admission', async () => {
  const { createHostedCommunityCommandGate } = await api();
  const { hostedCommunityRecipeText } = await import('./hosted-community-command');
  let admissions = 0, effects = 0, uncertain = 0;
  const headers = { authorization: 'Bearer current-token', 'x-school-id': ids.school, 'idempotency-key': 'original-community-create', 'content-type': 'application/json' };
  const journal = { async intent(command: unknown) { return { identity, command, intentSequence: 1, intentRecordSha256: 'd'.repeat(64) }; }, async startForwarding(_original: unknown, forward: () => Promise<void>) { return forward(); }, async markUncertain() { uncertain++; } };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => { if (++admissions === 2) headers['content-type'] = 'text/plain'; }, persist: async (_name, value) => hash(value) });
  gate.session(actor, 'current-token', 1); const intent = { actor, path: '/v1/community/rooms', scopeGeneration: 1 }; await gate.prepare(intent);
  const bytes = Buffer.from(JSON.stringify({ classId: ids.class, name: hostedCommunityRecipeText.groupName, type: 'GROUP', memberIds: [ids.student] }));
  const request = { method: () => 'POST', url: () => origin + intent.path, headers: () => headers, postDataBuffer: () => bytes };
  await assert.rejects(gate.forward(request as never, async () => { effects++; })); assert.equal(effects, 0); assert.equal(uncertain, 1);
});

async function retirementGateFixture(length = 15) {
  const { createHostedCommunityCommandGate } = await api(), contracts = hostedCommandJournalContracts('community');
  const records: HostedCommandJournalRecord<'community'>[] = [], states: HostedCommandJournalRead<'community'>['commands'] = [];
  let revision = 0, heldRead: Promise<void> | undefined;
  const append = (command: HostedCommunityJournalOriginal['command'], state: HostedCommandJournalRecord<'community'>['state'], original?: HostedCommunityJournalOriginal, receipt?: string) => {
    const payload = { version: 1, purpose: contracts.purpose, sequence: records.length + 1, previousRecordSha256: records.at(-1)?.recordSha256 ?? null,
      identity, command, state, intentSequence: original?.intentSequence ?? records.length + 1, intentRecordSha256: original?.intentRecordSha256 ?? null,
      httpReceiptSha256: receipt ?? null, nativeReceiptSha256: null, nativeProof: null, localDurabilityOnly: true };
    const record = contracts.recordSchema.parse({ ...payload, recordSha256: hash(payload) }) as HostedCommandJournalRecord<'community'>; records.push(record); return record;
  };
  const journal = {
    async intent(command: HostedCommunityJournalOriginal['command']) { const record = append(command, 'INTENT'); const original = { identity, command, intentSequence: record.sequence, intentRecordSha256: record.recordSha256 }; states.push({ original, state: 'INTENT', httpReceiptSha256: null, nativeReceiptSha256: null }); return original; },
    async startForwarding(original: HostedCommunityJournalOriginal, forward: () => Promise<void>) { append(original.command, 'FORWARDING_AUTHORIZED', original); states.at(-1)!.state = 'FORWARDING_AUTHORIZED'; await forward(); },
    async recordHttpReceipt(original: HostedCommunityJournalOriginal, receipt: { receiptSha256: string }) { append(original.command, 'HTTP_CONFIRMED', original, receipt.receiptSha256); Object.assign(states.at(-1)!, { state: 'HTTP_CONFIRMED', httpReceiptSha256: receipt.receiptSha256 }); },
    async markUncertain() {}, async read() { if (heldRead) await heldRead; const result = { records, commands: states, lastRecordSha256: records.at(-1)?.recordSha256 ?? null, evidence: 'LOCAL_DURABLE_METADATA_ONLY', hostedAcceptance: false, runnerLossRecoveryVerified: false }; return structuredClone(revision ? { ...result, lastRecordSha256: '0'.repeat(64) } : result); },
  };
  const gate = createHostedCommunityCommandGate({ apiOrigin: origin, identity, scope, journal: journal as never, readmit: async () => {}, persist: async (_name, value) => hash(value) });
  for (let index = 0; index < length; index++) {
    const current = gate.scope(), room = current.group?.id, post = current.postIds[0], announcement = current.announcement?.id;
    const recipes: readonly (readonly [string, Record<string, unknown>])[] = [
      ['/v1/community/rooms', { classId: ids.class, name: text.groupName, type: 'GROUP', memberIds: [ids.student] }],
      [`/v1/community/rooms/${room}/members`, { actorId: ids.peer, status: 'active', confirmAccessChange: true }],
      [`/v1/community/rooms/${room}/members`, { actorId: ids.peer, status: 'revoked', confirmAccessChange: true }],
      [`/v1/community/rooms/${room}/posts`, { body: text.postBody, replyToId: null }],
      [`/v1/community/rooms/${room}/posts`, { body: text.secondPostBody, replyToId: null }],
      [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: true }],
      [`/v1/community/posts/${post}/reactions`, { reaction: 'HELPFUL', active: false }],
      [`/v1/community/rooms/${room}/posts`, { body: text.replyBody, replyToId: post }],
      [`/v1/community/posts/${post}/report`, { reason: text.reportReason }],
      [`/v1/community/rooms/${room}/restrict`, { actorId: ids.student, restriction: 'MUTED', reason: text.restrictionReason, confirmModeration: true }],
      [`/v1/community/rooms/${room}/restrict`, { actorId: ids.student, restriction: 'NONE', reason: text.restrictionReason, confirmModeration: true }],
      [`/v1/community/posts/${post}/moderate`, { action: 'HIDE', reason: text.moderationReason, confirmModeration: true }],
      [`/v1/community/posts/${post}/moderate`, { action: 'RESTORE', reason: text.moderationReason, confirmModeration: true }],
      ['/v1/community/announcements', { classId: ids.class, title: text.announcementTitle, body: text.announcementBody, parentVisible: true }],
      [`/v1/community/notifications/${announcement}/read`, { expectedRevision: 1 }],
    ];
    const [path, body] = recipes[index], actorId = index === 14 ? ids.parent : [3, 4, 5, 6, 7, 8].includes(index) ? ids.student : ids.teacher;
    const role: 'parent' | 'student' | 'teacher' = index === 14 ? 'parent' : actorId === ids.student ? 'student' : 'teacher';
    const generation = index < 3 ? 1 : index < 9 ? 3 : index === 9 ? 5 : index < 14 ? 9 : 11;
    const person = { ...actor, actorId, role }, intent = { actor: person, path, scopeGeneration: generation }, key = 'gate-prefix-' + index;
    gate.endSession(); gate.session(person, 'token-' + generation, generation); await gate.prepare(intent);
    const command = parseHostedCommunityCommand(path, JSON.stringify(body), { actorId, schoolId: ids.school, role }, current), id = index === 5 || index === 6 ? post! : index === 14 ? announcement! : `93000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const response: { id: string; [key: string]: unknown } = index === 14 ? { id, status: 'READ', revision: 1 } : { id, command: command.owner === 'normal' ? command.nativeCommand : '' };
    if (index === 0) response.roomId = id;
    if (command.operation === 'post.create') Object.assign(response, { roomId: room, body: body.body, replyToId: body.replyToId, actorId, createdAt: '2026-10-12T01:00:00Z', status: 'VISIBLE' });
    const request = { method: () => 'POST', url: () => origin + path, headers: () => ({ authorization: 'Bearer token-' + generation, 'x-school-id': ids.school, 'idempotency-key': key, 'content-type': 'application/json' }), postDataBuffer: () => Buffer.from(JSON.stringify(body)) };
    await gate.forward(request as never, async () => {}); await gate.confirm({ ...intent, request: request as never, key, body, receipt: response, status: 200 }, 'prefix-request-' + index);
  }
  gate.endSession(); gate.session(actor, 'teacher-retirement-token', 13);
  return { gate, changedJournal() { revision++; }, holdRead(value: Promise<void>) { heldRead = value; }, states,
    next: { actor, path: '/v1/community/rooms/' + gate.scope().group!.id + '/members', scopeGeneration: 13 } };
}

function controlledRetirementProof(input: HostedCommunityLivePrefixInput) {
  const prefixSnapshotSha256 = hash({ version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX', ...input, nativeExecutionVerified: false, hostedAcceptance: false, customerReady: false });
  const expected = { identity: input.identity, prefixSnapshotSha256, journalHeadSha256: input.journal.lastRecordSha256 };
  const receipt = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF', status: 'LIVE_PREFIX_NATIVE_VERIFIED', ...expected,
    companionInventorySha256: hash(input.companions), nativeEvidenceSha256: 'a'.repeat(64), observedAt: '2026-10-12T01:00:00Z', readOnly: true, sessionsClosed: true, customerReady: false, hostedAcceptance: false, referenceRestored: false };
  const proof = Object.freeze({}); fixtureProofs.set(proof, { expected, receipt, consumed: false }); return proof;
}

test('LIVE_PREFIX capture freezes15 actual original receipts and consumes exactly one matching retirement proof', async () => {
  const { gate, next } = await retirementGateFixture();
  assert.equal(typeof gate.captureLivePrefix, 'function', 'live prefix capture is missing'); assert.equal(typeof gate.admitRetirement, 'function', 'retirement proof admission is missing');
  const first = await gate.captureLivePrefix(); assert.equal(first.commands.length, 15); assert.equal(first.companions.length, 30);
  assert.doesNotMatch(JSON.stringify(first), /token-|samira@|Bearer/);
  first.scope.postIds.pop(); assert.equal((await gate.captureLivePrefix()).scope.postIds.length, 3, 'capture is detached');
  const second = await gate.captureLivePrefix(), proof = controlledRetirementProof(second);
  gate.admitRetirement(proof); await gate.prepare(next);
  assert.throws(() => gate.admitRetirement(proof));
});

test('LIVE_PREFIX blocks mutation before capture while pending and refuses changed or incomplete journal evidence', async () => {
  const uncaptured = await retirementGateFixture(); await assert.rejects(uncaptured.gate.prepare(uncaptured.next));
  const pending = await retirementGateFixture(); let release!: () => void; pending.holdRead(new Promise<void>(done => { release = done; }));
  const capture = pending.gate.captureLivePrefix(); await assert.rejects(pending.gate.prepare(pending.next)); release(); await assert.rejects(capture);
  const changed = await retirementGateFixture(); await changed.gate.captureLivePrefix(); changed.changedJournal(); await assert.rejects(changed.gate.captureLivePrefix()); assert.throws(() => changed.gate.admitRetirement({}));
  const shorter = await retirementGateFixture(14); await assert.rejects(shorter.gate.captureLivePrefix());
  const uncertain = await retirementGateFixture(); uncertain.states[14].state = 'UNCERTAIN'; await assert.rejects(uncertain.gate.captureLivePrefix());
});

test('LIVE_PREFIX supplied copied stale foreign or single-capture proofs cannot unlock retirement', async () => {
  for (const mode of ['forged', 'copied', 'foreign', 'one-capture'] as const) {
    const { gate, next } = await retirementGateFixture(), captured = await gate.captureLivePrefix();
    if (mode !== 'one-capture') await gate.captureLivePrefix();
    const other = mode === 'foreign' ? { ...captured, identity: { ...captured.identity, runId: '82' } } : captured;
    const proof = controlledRetirementProof(other), presented = mode === 'forged' ? { status: 'LIVE_PREFIX_NATIVE_VERIFIED' } : mode === 'copied' ? { ...proof } : proof;
    assert.throws(() => gate.admitRetirement(presented)); await assert.rejects(gate.prepare(next));
  }
});

test('LIVE_PREFIX proof permits only the original teacher student-revoke closure withdrawal continuation', async () => {
  const fixture = await retirementGateFixture(), { gate } = fixture;
  await gate.captureLivePrefix(); const captured = await gate.captureLivePrefix(); gate.admitRetirement(controlledRetirementProof(captured));
  const room = gate.scope().group!.id, announcement = gate.scope().announcement!.id;
  const commands: readonly (readonly [string, Record<string, unknown>, { id: string; [key: string]: unknown }])[] = [
    [`/v1/community/rooms/${room}/members`, { actorId: ids.student, status: 'revoked', confirmAccessChange: true }, { id: '93000000-0000-4000-8000-000000000016', command: 'member.configure' }],
    [`/v1/community/groups/${room}/lifecycle`, { name: text.groupName, state: 'CLOSED', expectedRevision: 1, reason: text.groupClosureReason, confirmChange: true }, { id: room, revision: 2, status: 'CLOSED' }],
    [`/v1/community/announcements/${announcement}/withdraw`, { expectedRevision: 1, reason: text.announcementWithdrawalReason, confirmWithdrawal: true }, { id: announcement, revision: 2, status: 'WITHDRAWN' }],
  ];
  for (const [index, [path, body, receipt]] of commands.entries()) {
    const intent = { actor, path, scopeGeneration: 13 }, key = 'gate-retirement-' + index;
    const request = { method: () => 'POST', url: () => origin + path, headers: () => ({ authorization: 'Bearer teacher-retirement-token', 'x-school-id': ids.school, 'idempotency-key': key, 'content-type': 'application/json' }), postDataBuffer: () => Buffer.from(JSON.stringify(body)) };
    await gate.prepare(intent); await gate.forward(request as never, async () => {});
    await gate.confirm({ ...intent, request: request as never, key, body, receipt, status: 200 }, 'retirement-request-' + index);
  }
  assert.equal(gate.confirmedCount(), 18); assert.equal(gate.scope().group!.revision, 2); assert.equal(gate.scope().announcement!.revision, 2);
  await assert.rejects(gate.prepare(fixture.next));
  const displaced = await retirementGateFixture(); await displaced.gate.captureLivePrefix(); const second = await displaced.gate.captureLivePrefix(); displaced.gate.admitRetirement(controlledRetirementProof(second));
  const body = { actorId: ids.peer, status: 'revoked', confirmAccessChange: true }, request = { method: () => 'POST', url: () => origin + displaced.next.path, headers: () => ({ authorization: 'Bearer teacher-retirement-token', 'x-school-id': ids.school, 'idempotency-key': 'displaced-retirement', 'content-type': 'application/json' }), postDataBuffer: () => Buffer.from(JSON.stringify(body)) };
  let forwarded = 0; await displaced.gate.prepare(displaced.next); await assert.rejects(displaced.gate.forward(request as never, async () => { forwarded++; }));
  assert.equal(forwarded, 0); assert.equal(displaced.states.length, 15, 'wrong continuation cannot reserve another original intent');
});

test('LIVE_PREFIX overlapping reads and conflicting factual proof receipts permanently refuse retirement', async () => {
  const pending = await retirementGateFixture(); let release!: () => void; pending.holdRead(new Promise<void>(done => { release = done; }));
  const first = pending.gate.captureLivePrefix(); await assert.rejects(pending.gate.captureLivePrefix()); release(); await assert.rejects(first);
  for (const field of ['companionInventorySha256', 'readOnly', 'sessionsClosed', 'hostedAcceptance'] as const) {
    const { gate, next } = await retirementGateFixture(); await gate.captureLivePrefix(); const input = await gate.captureLivePrefix(), proof = controlledRetirementProof(input);
    const retained = fixtureProofs.get(proof)!; retained.receipt[field] = field === 'companionInventorySha256' ? '0'.repeat(64) : field === 'hostedAcceptance';
    assert.throws(() => gate.admitRetirement(proof)); await assert.rejects(gate.prepare(next));
  }
});

test('finite next recipe path actor and generation refuse before an original intent or callback', async () => {
  for (const mode of ['wrong-next-path','wrong-role','wrong-generation','read-only-student'] as const) {
    const count=mode==='wrong-next-path'?1:mode==='wrong-role'?3:mode==='read-only-student'?10:9,fixture=await retirementGateFixture(count),{gate,states}=fixture;
    const current=gate.scope(),path=mode==='wrong-next-path'?`/v1/community/rooms/${current.group!.id}/posts`:mode==='wrong-role'?`/v1/community/rooms/${current.group!.id}/posts`:`/v1/community/rooms/${current.group!.id}/restrict`;
    const person={...actor,actorId:mode==='read-only-student'?ids.student:ids.teacher,role:mode==='read-only-student'?'student' as const:'teacher' as const},generation=mode==='read-only-student'?7:mode==='wrong-generation'?9:mode==='wrong-role'?3:1;
    gate.endSession();gate.session(person,'wrong-step-token',generation);const before=canonicalReleaseExecutionJson(states),companions=canonicalReleaseExecutionJson(gate.companions());
    await assert.rejects(gate.prepare({actor:person,path,scopeGeneration:generation}),mode);
    assert.equal(canonicalReleaseExecutionJson(states),before,'wrong next metadata cannot reserve an original');assert.equal(canonicalReleaseExecutionJson(gate.companions()),companions,'wrong next metadata cannot write a companion');
  }
});

test('finite next recipe payload rejects peer mute duplicate post reversed reaction alternate reply and other post targets before intent', async () => {
  for (const mode of ['peer-mute','duplicate-post','reverse-reaction','alternate-reply','second-post-moderation'] as const) {
    const count=mode==='peer-mute'?9:mode==='duplicate-post'?4:mode==='reverse-reaction'?5:mode==='alternate-reply'?7:11,{gate,states}=await retirementGateFixture(count),current=gate.scope(),room=current.group!.id,post=current.postIds[0];
    const path=mode==='peer-mute'?`/v1/community/rooms/${room}/restrict`:mode==='reverse-reaction'?`/v1/community/posts/${post}/reactions`:mode==='second-post-moderation'?`/v1/community/posts/${current.postIds[1]}/moderate`:`/v1/community/rooms/${room}/posts`;
    const body=mode==='peer-mute'?{actorId:ids.peer,restriction:'MUTED',reason:text.restrictionReason,confirmModeration:true}:mode==='duplicate-post'?{body:text.postBody,replyToId:null}:mode==='reverse-reaction'?{reaction:'HELPFUL',active:false}:mode==='alternate-reply'?{body:text.replyDraftOther,replyToId:post}:{action:'HIDE',reason:text.moderationReason,confirmModeration:true};
    const teacher=mode==='peer-mute'||mode==='second-post-moderation',person={...actor,actorId:teacher?ids.teacher:ids.student,role:teacher?'teacher' as const:'student' as const},generation=mode==='peer-mute'?5:teacher?9:3;
    gate.endSession();gate.session(person,'next-step-token',generation);const intent={actor:person,path,scopeGeneration:generation},before=canonicalReleaseExecutionJson(states),companions=canonicalReleaseExecutionJson(gate.companions());let effects=0;
    const request={method:()=> 'POST',url:()=>origin+path,headers:()=>({authorization:'Bearer next-step-token','x-school-id':ids.school,'idempotency-key':'refused-step-'+mode,'content-type':'application/json'}),postDataBuffer:()=>Buffer.from(JSON.stringify(body))};
    await assert.rejects(async()=>{await gate.prepare(intent);await gate.forward(request as never,async()=>{effects++;});},mode);
    assert.equal(canonicalReleaseExecutionJson(states),before,'changed finite payload cannot reserve an original');assert.equal(canonicalReleaseExecutionJson(gate.companions()),companions,'changed finite payload cannot write a companion');assert.equal(effects,0,'changed finite payload cannot execute a callback');assert.equal(gate.confirmedCount(),count);
  }
});
