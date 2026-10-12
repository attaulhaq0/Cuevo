import { createHash } from 'node:crypto';
import type { Request } from '@playwright/test';
import { idempotencyKeySchema } from '@cuevo/contracts';
import type { CustomerLearningLoopActor, CustomerLearningLoopCommandObservation, CustomerLearningLoopMutationIntent } from '../../tests/e2e/customer-learning-loop';
import { canonicalReleaseExecutionJson } from './release-review';
import { parseHostedCommunityCommand, requireHostedCommunityRecipeStep, reduceHostedCommunityReceipt, type HostedCommunityActor, type HostedCommunityCommand, type HostedCommunityScope } from './hosted-community-command';
import type { HostedCommunityJournal, HostedCommunityJournalIdentity, HostedCommunityJournalOriginal } from './hosted-community-journal';
import { prepareHostedCommunityLivePrefix, type HostedCommunityLivePrefixInput } from './backend-hosted-community-artifact';
import { consumeHostedCommunityLivePrefixProof } from './hosted-community-live-prefix';

const fail = () => Error('Original hosted community command requires review; private contents withheld.');
const hash = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);

/** Confined forwarding for a separately admitted finite synthetic recipe.
 * Supplied callbacks and local receipts never establish provider or native proof. */
export function createHostedCommunityCommandGate(options: {
  apiOrigin: string; identity: HostedCommunityJournalIdentity; scope: HostedCommunityScope;
  journal: HostedCommunityJournal; readmit: () => Promise<void>;
  persist: (name: string, value: unknown) => Promise<string>;
}) {
  if (new URL(options.apiOrigin).origin !== options.apiOrigin || new URL(options.apiOrigin).protocol !== 'https:'
    || options.identity.schoolId !== options.scope.schoolId) throw fail();
  const scope = structuredClone(options.scope), identity = structuredClone(options.identity); let stopped = false;
  let session: { actor: CustomerLearningLoopActor; token: string; generation: number } | null = null;
  let planned: CustomerLearningLoopMutationIntent | null = null;
  let active: { request: Request; command: HostedCommunityCommand; original: HostedCommunityJournalOriginal;
    actor: CustomerLearningLoopActor; generation: number; bytes: string; key: string; intentSha256: string } | null = null;
  const receipts: Record<string, unknown>[] = [], companions: { path: string; sha256: string }[] = [];
  const companionBytes = new Map<string, Buffer>();
  let retirementPending = false, retirementAuthorized = false, captureActive = false, captureCount = 0;
  let captured: { canonicalSnapshot: string; prefixSnapshotSha256: string; journalHeadSha256: string; companionInventorySha256: string } | null = null;
  const current = (intent: CustomerLearningLoopMutationIntent) => !!session && same(session.actor, intent.actor) && session.generation === intent.scopeGeneration;
  const stop = async () => { stopped = true; if (active) try { await options.journal.markUncertain(active.original); } catch { /* Preserve original bytes for reconciliation. */ } };
  const metadata = (command: HostedCommunityCommand) => ({ operation: command.operation, owner: command.owner,
    ledgerCommand: command.ledgerCommand, targetId: command.targetId, sourceIds: command.sourceIds,
    sourceRevision: command.sourceRevision, requestBodySha256: command.requestBodySha256, nativeFingerprint: command.nativeFingerprint,
    // The strict parser accepts only source-owned fictional fields/text. This
    // private companion is required to recompute the native service fingerprint.
    input: command.input });
  const parserActor = (actor: CustomerLearningLoopActor): HostedCommunityActor => {
    if (!['teacher', 'student', 'parent'].includes(actor.role)) throw fail();
    return { actorId: actor.actorId, schoolId: actor.schoolId, role: actor.role as HostedCommunityActor['role'] };
  };
  const saveCompanion = async (name: string, value: unknown) => {
    const bytes = Buffer.from(canonicalReleaseExecutionJson(value)), expected = createHash('sha256').update(bytes).digest('hex');
    const persisted = await options.persist(name, value);
    if (persisted !== expected || companionBytes.has(name)) throw fail();
    companionBytes.set(name, bytes); return persisted;
  };
  const requireRetirementCommand = (command: HostedCommunityCommand) => {
    if (!retirementAuthorized) return;
    if (!session || session.actor.actorId !== scope.teacherActorId || session.actor.role !== 'teacher' || session.generation !== 13) throw fail();
    if (receipts.length === 15 && command.operation === 'member.configure' && command.targetId === scope.group?.id && command.input.actorId === scope.studentActorId && command.input.status === 'revoked') return;
    if (receipts.length === 16 && command.operation === 'group.lifecycle' && command.targetId === scope.group?.id && command.sourceRevision === 1) return;
    if (receipts.length === 17 && command.operation === 'announcement.withdraw' && command.targetId === scope.announcement?.id && command.sourceRevision === 1) return;
    throw fail();
  };
  return {
    session(actor: CustomerLearningLoopActor, token: string, generation: number) {
      if(!stopped&&session&&same(session.actor,actor)&&session.token===token&&session.generation===generation)return;
      if (stopped || planned || active || retirementPending || actor.schoolId !== identity.schoolId || !token || !Number.isSafeInteger(generation) || generation < 1) { stopped = true; throw fail(); }
      session = { actor: Object.freeze({ ...actor }), token, generation };
    },
    endSession() { if (planned || active || retirementPending) stopped = true; session = null; },
    async prepare(intent: CustomerLearningLoopMutationIntent) {
      try { if (stopped || planned || active || retirementPending || receipts.length >= 18 || receipts.length === 15 && !retirementAuthorized || !current(intent) || !/^\/v1\/community\/[a-z0-9/-]+$/.test(intent.path)) throw fail();
        requireHostedCommunityRecipeStep(receipts.length,intent.path,parserActor(intent.actor),intent.scopeGeneration,scope);
        await options.readmit(); if (stopped || retirementPending || !current(intent)) throw fail();
        requireHostedCommunityRecipeStep(receipts.length,intent.path,parserActor(intent.actor),intent.scopeGeneration,scope);planned = { ...intent, actor: Object.freeze({ ...intent.actor }) };
      } catch { await stop(); throw fail(); }
    },
    async forward(request: Request, forward: () => Promise<void>) {
      try {
        if (stopped || retirementPending || receipts.length === 15 && !retirementAuthorized || !planned || active || !session || !current(planned) || request.method() !== 'POST' || request.url() !== options.apiOrigin + planned.path) throw fail();
        const headers = { ...request.headers() }, key = idempotencyKeySchema.parse(headers['idempotency-key']);
        if (headers.authorization !== 'Bearer ' + session.token || headers['x-school-id'] !== session.actor.schoolId || headers['content-type']?.split(';')[0].trim() !== 'application/json') throw fail();
        const body = request.postDataBuffer(); if (!body || body.length > 65536) throw fail();
        const raw = Buffer.from(body);
        const bytes = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(raw), command = parseHostedCommunityCommand(planned.path, raw, parserActor(session.actor), scope);
        requireHostedCommunityRecipeStep(receipts.length,planned.path,parserActor(session.actor),session.generation,scope,command);
        requireRetirementCommand(command);
        const original = await options.journal.intent({ step: command.operation, actorId: session.actor.actorId, role: session.actor.role,
          schoolId: session.actor.schoolId, path: planned.path, operation: command.operation, sourceIds: command.sourceIds,
          sourceRevision: command.sourceRevision, key, requestBodySha256: command.requestBodySha256 });
        active = { request, command, original, actor: session.actor, generation: session.generation, bytes, key, intentSha256: '' };
        const name = String(original.intentSequence).padStart(6, '0') + '.intent.json';
        active.intentSha256 = await saveCompanion(name, { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_ORIGINAL_COMMAND', original,requestBody:bytes, scopeGeneration:active.generation,...metadata(command) });
        if (!/^[a-f0-9]{64}$/.test(active.intentSha256)) throw fail(); companions.push({ path: name, sha256: active.intentSha256 });
        // Expensive local durability work finishes before this fresh admission.
        // The same original callback is invoked once; no automatic retry exists.
        await options.journal.startForwarding(original, async () => {
          await options.readmit(); if (stopped || retirementPending || !planned || !session || !current(planned) || active?.request !== request) throw fail();
          const currentHeaders = request.headers();
          if (request.method() !== 'POST' || request.url() !== options.apiOrigin + planned.path || currentHeaders.authorization !== 'Bearer ' + session.token
            || currentHeaders['x-school-id'] !== session.actor.schoolId || currentHeaders['idempotency-key'] !== key
            || currentHeaders['content-type'] !== headers['content-type'] || !request.postDataBuffer()?.equals(raw)) throw fail();
          requireHostedCommunityRecipeStep(receipts.length,planned.path,parserActor(session.actor),session.generation,scope,command);
          await forward();
        });
      } catch { await stop(); throw fail(); }
    },
    async confirm(observation: CustomerLearningLoopCommandObservation, requestId: string) {
      try {
        const item = active;
        if (stopped || !item || !planned || !session || !current(observation) || observation.path !== planned.path || item.generation !== session.generation || item.request !== observation.request
          || observation.key !== item.key || !same(observation.body, JSON.parse(item.bytes)) || observation.status !== 200 || !/^[-A-Za-z0-9_.:]{1,200}$/.test(requestId)) throw fail();
        const reduced = reduceHostedCommunityReceipt(observation.receipt, { path: planned.path, rawBytes: item.bytes, key: item.key,
          requestBodySha256: item.command.requestBodySha256, nativeFingerprint: item.command.nativeFingerprint }, parserActor(item.actor), scope);
        const receiptSha256 = hash(observation.receipt), name = String(item.original.intentSequence).padStart(6, '0') + '.http.json';
        const value = { version: 1, purpose: 'CUEVO_HOSTED_COMMUNITY_HTTP_RECEIPT', original: item.original,
          originalCompanionSha256: item.intentSha256,requestBody:item.bytes,scopeGeneration:item.generation, ...metadata(item.command), requestId, status: 200,
          receiptSha256,observedReceiptSha256:createHash('sha256').update(JSON.stringify(observation.receipt)).digest('hex'), receiptIdentity: reduced, nativeChainVerified: false };
        const companionSha256 = await saveCompanion(name, value); if (!/^[a-f0-9]{64}$/.test(companionSha256)) throw fail();
        companions.push({ path: name, sha256: companionSha256 }); await options.journal.recordHttpReceipt(item.original, { status: 200, receiptSha256 });
        if (item.command.operation === 'room.create') scope.group = { id: reduced.receiptId, revision: 1 };
        else if (item.command.operation === 'post.create') { if (scope.postIds.includes(reduced.receiptId)) throw fail(); scope.postIds.push(reduced.receiptId); }
        else if (item.command.operation === 'announcement.create') scope.announcement = { id: reduced.receiptId, revision: 1 };
        else if (item.command.operation === 'group.lifecycle') { if (!scope.group || reduced.revision === null) throw fail(); scope.group.revision = reduced.revision; }
        else if (item.command.operation === 'announcement.withdraw') { if (!scope.announcement || reduced.revision === null) throw fail(); scope.announcement.revision = reduced.revision; }
        receipts.push({ ...value, companionSha256 }); active = null; planned = null;
      } catch { await stop(); throw fail(); }
    },
    async captureLivePrefix(): Promise<HostedCommunityLivePrefixInput> {
      if (captureActive) { stopped = true; throw fail(); } captureActive = true;
      try {
        if (stopped || planned || active || retirementAuthorized || receipts.length !== 15 || !session || session.actor.actorId !== scope.teacherActorId || session.actor.role !== 'teacher' || session.generation !== 13) throw fail();
        retirementPending = true;
        const journal = await options.journal.read();
        if (stopped || planned || active || !retirementPending || !same(options.identity, identity)) throw fail();
        const input = { identity, scope, journal, commands: receipts, companions };
        const selected = prepareHostedCommunityLivePrefix(input, companionBytes), canonicalSnapshot = canonicalReleaseExecutionJson(selected.snapshot);
        if (captured && captured.canonicalSnapshot !== canonicalSnapshot) throw fail();
        captured ??= { canonicalSnapshot, prefixSnapshotSha256: selected.selection.identity.prefixSnapshotSha256,
          journalHeadSha256: selected.selection.identity.journalHeadSha256, companionInventorySha256: selected.selection.identity.companionInventorySha256 };
        captureCount++; return JSON.parse(canonicalReleaseExecutionJson(input)) as HostedCommunityLivePrefixInput;
      } catch { await stop(); throw fail(); } finally { captureActive = false; }
    },
    admitRetirement(proof: unknown) {
      try {
        if (stopped || captureActive || planned || active || !retirementPending || retirementAuthorized || !captured || captureCount < 2 || receipts.length !== 15 || !same(options.identity, identity)) throw fail();
        const receipt = consumeHostedCommunityLivePrefixProof(proof, { identity, prefixSnapshotSha256: captured.prefixSnapshotSha256, journalHeadSha256: captured.journalHeadSha256 });
        if (receipt.status !== 'LIVE_PREFIX_NATIVE_VERIFIED' || !same(receipt.identity, identity) || receipt.prefixSnapshotSha256 !== captured.prefixSnapshotSha256
          || receipt.journalHeadSha256 !== captured.journalHeadSha256 || receipt.companionInventorySha256 !== captured.companionInventorySha256
          || !receipt.readOnly || !receipt.sessionsClosed || receipt.customerReady || receipt.hostedAcceptance || receipt.referenceRestored) throw fail();
        retirementAuthorized = true; retirementPending = false;
        return receipt;
      } catch { stopped = true; throw fail(); }
    },
    fail: stop, scope: () => structuredClone(scope), confirmedCount: () => receipts.length,
    receipts: () => structuredClone(receipts), companions: () => structuredClone(companions), read: () => options.journal.read(),
  };
}
