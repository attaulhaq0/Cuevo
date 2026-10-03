import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Database } from '../../src/platform/database/database';
import type { AuthProvisioningAdapter } from '../../src/platform/identity/provisioning';
import { SchoolAccountEffectsService, type SchoolAccountDelivery } from '../../src/modules/school/account-effects.service';

const id = (n: number) => `25000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-03T00:00:00Z');
const actor = { userId: id(1), schoolId: id(2), membershipId: id(3), role: 'admin' as const, entitlements: ['school.operations'] };
const claim = { eventId: id(4), leaseToken: id(5), requestId: id(6), schoolId: actor.schoolId, userId: id(7), email: 'new.learner@example.test', requestRevision: 1, expiresAt: '2026-10-04T00:00:00Z', leaseExpiresAt: '2026-10-03T00:01:00Z', state: 'ADMITTED', priorCreateState: 'NOT_ATTEMPTED', priorLinkState: 'NOT_ATTEMPTED', priorDeliveryState: 'NOT_ATTEMPTED' };
const final = { id: claim.requestId, schoolId: actor.schoolId, eventId: claim.eventId, requestRevision: 1, status: 'AWAITING_CLAIM', providerState: 'CONFIRMED', deliveryState: 'ACCEPTED' };
type Provider = Pick<AuthProvisioningAdapter, 'createUnconfirmed' | 'reconcileUser' | 'generateLink'>;
type Transient = Parameters<Provider['generateLink']>[1];
const actionLink = 'http://127.0.0.1:56321/auth/v1/verify?type=invite&token=private-provider-token&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Faccount%2Fadmission';
const unknownFinal = { ...final, status: 'OUTCOME_UNKNOWN', providerState: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' };
const deliveryUnknownFinal = { ...final, status: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' };
function fixture(options: { claim?: unknown; begin?: unknown; finish?: unknown; final?: unknown; failureSql?: string; failureStep?: string; create?: 'THROW' | 'UNKNOWN' | 'FOREIGN'; createReceipt?: unknown; reconcileReceipt?: unknown; link?: 'THROW' | 'UNKNOWN' | 'INVALID' | 'EXPIRE' | 'DUPLICATE' | 'NO_CALLBACK' | 'LATE_RETURN' | 'LATE_THROW' | 'UNAWAITED' | 'UNAWAITED_DELIVERY' | 'THROW_AFTER_CALLBACK'; linkReceipt?: unknown; afterLinkReceipt?: unknown; delivery?: 'THROW' | 'MALFORMED' | 'EXPIRE'; deliveryReceipt?: unknown; heldDelivery?: Promise<void>; heldLinkFinish?: Promise<void>; expireFinal?: boolean; clock?: () => number } = {}) {
  const calls: { sql: string; args?: unknown[] }[] = []; const order: string[] = []; const transactions: { actor: string; school: string | undefined }[] = [];
  const providerCalls: string[] = []; const providerInputs: { operation: string; input: unknown; openTransaction: boolean }[] = []; const messages: Parameters<SchoolAccountDelivery>[0][] = []; const deliveryTransactions: boolean[] = []; let time = now; let openTransaction = false; let savedSink: Transient | undefined; let startedSink: Promise<void> | undefined;
  let enterDelivery!: () => void; const deliveryEntered = new Promise<void>(resolve => { enterDelivery = resolve; }); let enterLinkFinish!: () => void; const linkFinishEntered = new Promise<void>(resolve => { enterLinkFinish = resolve; });
  let enterProviderSettled!: () => void; const providerSettled = new Promise<void>(resolve => { enterProviderSettled = resolve; });
  const database = { actorTransaction: async (user: string, school: string | undefined, run: (client: PoolClient) => Promise<unknown>) => {
    transactions.push({ actor: user, school }); openTransaction = true;
    try { return await run({ query: async (sql: string, args?: unknown[]) => {
      calls.push({ sql, args });
      if (options.failureSql && sql.includes(options.failureSql)) throw Object.assign(Error('private SQL detail'), { code: '42501' });
      if (options.failureStep && sql.includes('begin_school_account_effect_step') && args?.[2] === options.failureStep) throw Object.assign(Error('private SQL detail'), { code: '42501' });
      if (sql.includes('claim_school_account_effect')) { order.push('claim'); return { rows: [{ context: Object.hasOwn(options, 'claim') ? options.claim : claim }] }; }
      if (sql.includes('begin_school_account_effect_step')) { order.push('begin:' + args?.[2]); return { rows: [{ admitted: Object.hasOwn(options, 'begin') ? options.begin : true }] }; }
      if (sql.includes('finish_school_account_effect_step')) { order.push('finish:' + args?.[2]); if (args?.[2] === 'LINK') { enterLinkFinish(); if (options.heldLinkFinish) await options.heldLinkFinish; } return { rows: [{ recorded: Object.hasOwn(options, 'finish') ? options.finish : true }] }; }
      if (sql.includes('finish_school_account_effect')) { order.push('final'); if (options.expireFinal) time = now + 30_000; return { rows: [{ receipt: Object.hasOwn(options, 'final') ? options.final : final }] }; }
      throw Error('Unexpected SQL boundary');
    } } as unknown as PoolClient); } finally { openTransaction = false; }
  } } as unknown as Database;
  const identityReceipt = () => ({ state: 'CONFIRMED' as const, requestId: claim.requestId, userId: claim.userId, emailConfirmed: false });
  const provider: Provider = {
    createUnconfirmed: async input => { providerInputs.push({ operation: 'create', input, openTransaction }); providerCalls.push('create'); order.push('create'); if (options.create === 'THROW') throw Error('private-provider-key'); if (options.create === 'UNKNOWN') return { state: 'OUTCOME_UNKNOWN', requestId: claim.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' }; if (options.create === 'FOREIGN') return { ...identityReceipt(), userId: id(99) }; return Object.hasOwn(options, 'createReceipt') ? options.createReceipt as Awaited<ReturnType<Provider['createUnconfirmed']>> : identityReceipt(); },
    reconcileUser: async input => { providerInputs.push({ operation: 'reconcile', input, openTransaction }); providerCalls.push('reconcile'); order.push('reconcile'); return Object.hasOwn(options, 'reconcileReceipt') ? options.reconcileReceipt as Awaited<ReturnType<Provider['reconcileUser']>> : identityReceipt(); },
    generateLink: (input, sink) => {
      const generated: ReturnType<Provider['generateLink']> = (async () => {
      providerInputs.push({ operation: 'link', input, openTransaction }); providerCalls.push('link'); order.push('link'); savedSink = sink;
      if (options.link === 'LATE_THROW') throw Error('private-provider-key');
      if (options.link === 'LATE_RETURN') return { state: 'GENERATED', requestId: claim.requestId, userId: claim.userId, purpose: 'invite' };
      if (options.link === 'THROW') throw Error('private-provider-key');
      if (options.link === 'UNKNOWN') return { state: 'OUTCOME_UNKNOWN', requestId: claim.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' };
      if (Object.hasOwn(options, 'linkReceipt')) return options.linkReceipt as Awaited<ReturnType<Provider['generateLink']>>;
      if (options.link === 'NO_CALLBACK') return { state: 'GENERATED', requestId: claim.requestId, userId: claim.userId, purpose: 'invite' };
      if (options.link === 'EXPIRE') time = now + 61000;
      const transient = { actionLink: options.link === 'INVALID' ? 'https://foreign.example/verify?token=private-provider-token' : actionLink, purpose: 'invite' as const };
      if (options.link === 'UNAWAITED' || options.link === 'UNAWAITED_DELIVERY') { startedSink = sink(transient); void startedSink.catch(() => undefined); if (options.link === 'UNAWAITED_DELIVERY') await deliveryEntered; return { state: 'GENERATED', requestId: claim.requestId, userId: claim.userId, purpose: 'invite' }; }
      await sink(transient);
      if (options.link === 'DUPLICATE') await sink(transient);
      if (options.link === 'THROW_AFTER_CALLBACK') throw Error('private-provider-token');
      if (Object.hasOwn(options, 'afterLinkReceipt')) return options.afterLinkReceipt as Awaited<ReturnType<Provider['generateLink']>>;
      return { state: 'GENERATED', requestId: claim.requestId, userId: claim.userId, purpose: 'invite' };
      })();
      void generated.then(enterProviderSettled, enterProviderSettled); return generated;
    },
  };
  const delivery: SchoolAccountDelivery = async message => { deliveryTransactions.push(openTransaction); messages.push(message); order.push('delivery'); enterDelivery(); if (options.heldDelivery) await options.heldDelivery; if (options.delivery === 'THROW') throw Error('private-admission-secret'); if (options.delivery === 'EXPIRE') time = now + 61000; if (options.delivery === 'MALFORMED') return { state: 'false-success' } as unknown as { state: 'ACCEPTED' }; return Object.hasOwn(options, 'deliveryReceipt') ? options.deliveryReceipt as { state: 'ACCEPTED' } : { state: 'ACCEPTED' }; };
  const service = new SchoolAccountEffectsService(database, provider, delivery, { admissionUrl: 'http://localhost:3000/account/admission', now: options.clock ?? (() => time) });
  return { service, calls, order, transactions, providerCalls, providerInputs, deliveryTransactions, deliveryEntered, linkFinishEntered, providerSettled, messages, invokeSaved: () => savedSink!({ actionLink, purpose: 'invite' }), started: () => startedSink };
}

describe('School-owned exact Auth effect execution', () => {
  it('reserves each durable step before its single external effect and returns only the sanitized final receipt', async () => {
    const test = fixture(); expect(await test.service.execute(actor, claim.requestId)).toEqual(final);
    expect(test.order).toEqual(['claim', 'begin:CREATE', 'create', 'finish:CREATE', 'begin:LINK', 'link', 'finish:LINK', 'begin:DELIVERY', 'delivery', 'finish:DELIVERY', 'final']);
    expect(test.transactions.every(transaction => transaction.actor === actor.userId && transaction.school === actor.schoolId)).toBe(true);
    expect(test.providerInputs).toEqual([{ operation: 'create', input: { requestId: claim.requestId, userId: claim.userId, email: claim.email, priorState: 'NOT_ATTEMPTED' }, openTransaction: false }, { operation: 'link', input: { requestId: claim.requestId, userId: claim.userId, email: claim.email, priorState: 'NOT_ATTEMPTED', purpose: 'invite' }, openTransaction: false }]);
    expect(test.deliveryTransactions).toEqual([false]);
    const message = test.messages[0]; expect(test.messages).toHaveLength(1); const url = new URL(message.admissionUrl);
    expect(url.origin + url.pathname).toBe('http://localhost:3000/account/admission'); expect(url.search).toBe('');
    const fragment = new URLSearchParams(url.hash.slice(1)); const secret = fragment.get('admission_secret');
    expect(fragment.get('token_hash')).toBe('private-provider-token'); expect(fragment.get('type')).toBe('invite'); expect(fragment.get('id')).toBe(claim.requestId); expect(secret).toMatch(/^[a-f0-9]{64}$/);
    const reservation = test.calls.find(call => call.sql.includes('begin_school_account_effect_step') && call.args?.[2] === 'LINK');
    expect(reservation?.args?.[4]).toBe(createHash('sha256').update(secret!).digest('hex'));
    expect(JSON.stringify(test.calls)).not.toContain(secret); expect(JSON.stringify(test.calls)).not.toContain('private-provider-token'); expect(JSON.stringify(test.calls)).not.toContain(claim.email); expect(JSON.stringify(final)).not.toMatch(/token|secret|email|actionLink/);
    expect(message.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(['teacher', 'student', 'parent', 'coordinator'] as const)('denies %s before source claim or provider work', async role => {
    const test = fixture(); await expect(test.service.execute({ ...actor, role }, claim.requestId)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(test.calls).toEqual([]); expect(test.providerCalls).toEqual([]);
  });
  it.each([null, { ...claim, requestId: id(99) }, { ...claim, schoolId: id(99) }, { ...claim, leaseToken: 'bad' }, { ...claim, requestRevision: 0 }, { ...claim, expiresAt: 'bad' }, { ...claim, email: 'bad' }, { ...claim, priorLinkState: undefined }, { ...claim, state: 'COMPLETED' }, { ...claim, secret: 'must not be accepted' }])('refuses missing or malformed exact claimed source %j before provider work', async context => {
    const test = fixture({ claim: context }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.providerCalls).toEqual([]);
  });
  it.each([{ ...claim, expiresAt: '2026-10-02T00:00:00Z' }, { ...claim, leaseExpiresAt: '2026-10-02T00:00:00Z' }])('denies expired request or effect lease before new work', async context => {
    const test = fixture({ claim: context }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.providerCalls).toEqual([]);
  });
  it.each([false, undefined, 'true'])('requires affirmative durable step admission %s before provider work', async admitted => {
    const test = fixture({ begin: admitted }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.providerCalls).toEqual([]);
  });
  it('reconciles a prior unknown create by exact UUID without creating again', async () => {
    const test = fixture({ claim: { ...claim, priorCreateState: 'OUTCOME_UNKNOWN' } }); await test.service.execute(actor, claim.requestId); expect(test.providerCalls).toEqual(['reconcile', 'link']); expect(test.providerInputs[0]).toEqual({ operation: 'reconcile', input: { requestId: claim.requestId, userId: claim.userId, email: claim.email, priorState: 'OUTCOME_UNKNOWN' }, openTransaction: false });
  });
  it('rechecks a confirmed creation without repeating create before a new link', async () => {
    const test = fixture({ claim: { ...claim, priorCreateState: 'CONFIRMED' } }); await test.service.execute(actor, claim.requestId); expect(test.providerCalls).toEqual(['reconcile', 'link']);
  });
  it.each([{ priorLinkState: 'OUTCOME_UNKNOWN' }, { priorLinkState: 'CONFIRMED', priorDeliveryState: 'OUTCOME_UNKNOWN' }, { priorLinkState: 'CONFIRMED', priorDeliveryState: 'CONFIRMED' }])('does not repeat uncertain or already confirmed link/delivery effects %j', async previous => {
    const receipt = previous.priorDeliveryState === 'CONFIRMED' ? final : { ...final, status: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' };
    const test = fixture({ claim: { ...claim, priorCreateState: 'CONFIRMED', ...previous }, final: receipt }); expect(await test.service.execute(actor, claim.requestId)).toEqual(receipt); expect(test.providerCalls).toEqual([]); expect(test.messages).toEqual([]);
  });
  it('never regenerates a confirmed but lost transient link to complete delivery', async () => {
    const test = fixture({ claim: { ...claim, priorCreateState: 'CONFIRMED', priorLinkState: 'CONFIRMED' }, final: { ...final, status: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' } }); await test.service.execute(actor, claim.requestId); expect(test.providerCalls).toEqual([]); expect(test.messages).toEqual([]); expect(test.calls.some(call => call.sql.includes('finish_school_account_effect_step') && String(call.args?.[4]).includes('LINK_SECRET_UNAVAILABLE'))).toBe(true);
  });
  it.each(['THROW', 'UNKNOWN', 'FOREIGN'] as const)('does not link after create %s and records a minimized failure', async create => {
    const test = fixture({ create, final: { ...final, status: 'OUTCOME_UNKNOWN', providerState: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' } }); await test.service.execute(actor, claim.requestId); expect(test.providerCalls).toEqual(['create']); expect(test.messages).toEqual([]); expect(JSON.stringify(test.calls)).not.toContain('private-provider-key');
  });
  it.each(['THROW', 'UNKNOWN', 'INVALID', 'EXPIRE'] as const)('does not deliver after link %s and never repeats link generation', async link => {
    const test = fixture({ link, final: { ...final, status: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' } });
    if (link === 'INVALID' || link === 'EXPIRE') await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    else await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual({ ...final, status: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' });
    expect(test.messages).toEqual([]); expect(test.providerCalls.filter(call => call === 'link')).toHaveLength(1); expect(JSON.stringify(test.calls)).not.toContain('private-provider-token');
  });
  it.each(['THROW', 'MALFORMED', 'EXPIRE'] as const)('holds unknown delivery %s without provider/sink retry or credential-bearing SQL', async delivery => {
    const test = fixture({ delivery, final: { ...final, status: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' } });
    if (delivery === 'EXPIRE') await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    else await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(deliveryUnknownFinal);
    expect(test.messages).toHaveLength(1); expect(test.providerCalls.filter(call => call === 'link')).toHaveLength(1); expect(JSON.stringify(test.calls)).not.toMatch(/private-provider-token|private-admission-secret/);
  });
  it.each([false, undefined, 'true'])('fails closed after an unconfirmed step receipt %s without starting the next effect', async recorded => {
    const test = fixture({ finish: recorded }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.providerCalls).toEqual(['create']); expect(test.messages).toEqual([]);
  });
  it.each([{ ...final, id: id(99) }, { ...final, schoolId: id(99) }, { ...final, eventId: id(99) }, { ...final, requestRevision: 2 }, { ...final, admissionSecret: 'raw-secret' }, null])('refuses a foreign, stale or credential-bearing final receipt %j', async receipt => {
    const test = fixture({ final: receipt }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
  });
  it('rejects an available-looking final result after known unknown create or delivery evidence', async () => {
    const created = fixture({ create: 'UNKNOWN' }); await expect(created.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    const delivered = fixture({ delivery: 'THROW' }); await expect(delivered.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
  });
  it('does not deliver twice when a provider invokes its transient callback twice', async () => {
    const test = fixture({ link: 'DUPLICATE' }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.messages).toHaveLength(1); expect(test.calls.filter(call => call.sql.includes('finish_school_account_effect'))).toHaveLength(3);
  });
  it('does not invent delivery when a provider reports generated without returning a validated link', async () => {
    const test = fixture({ link: 'NO_CALLBACK', final: { ...final, status: 'OUTCOME_UNKNOWN', providerState: 'OUTCOME_UNKNOWN', deliveryState: 'OUTCOME_UNKNOWN' } }); await test.service.execute(actor, claim.requestId); expect(test.messages).toEqual([]); expect(test.calls.some(call => call.args?.[2] === 'DELIVERY')).toBe(false);
  });
  it('reauthorizes delivery after generation and preserves the confirmed link if that current source is denied', async () => {
    const test = fixture({ failureStep: 'DELIVERY' }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(test.messages).toEqual([]); expect(test.calls.filter(call => call.sql.includes('finish_school_account_effect_step') && call.args?.[2] === 'LINK')).toHaveLength(1);
  });
  it('awaits the original local delivery before recording a receipt or finishing the event', async () => {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); const test = fixture({ heldDelivery: held });
    const running = test.service.execute(actor, claim.requestId);
    await test.deliveryEntered;
    const before = [...test.order]; const messageCount = test.messages.length; release(); await expect(running).resolves.toEqual(final);
    expect(messageCount).toBe(1); expect(before).not.toContain('finish:DELIVERY'); expect(before).not.toContain('final');
  });
  it.each(['LATE_RETURN', 'LATE_THROW'] as const)('refuses the first transient callback after provider %s without SQL or delivery', async link => {
    const test = fixture({ link, final: unknownFinal }); await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(unknownFinal);
    const before = structuredClone(test.calls); await expect(test.invokeSaved()).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.calls).toEqual(before); expect(test.messages).toEqual([]);
  });
  it('refuses a saved duplicate callback after completed delivery before more SQL or delivery', async () => {
    const test = fixture(); await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(final); const before = structuredClone(test.calls);
    await expect(test.invokeSaved()).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.calls).toEqual(before); expect(test.messages).toHaveLength(1);
  });
  it('joins an unawaited started callback and closes its lifetime before any later delivery', async () => {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); const test = fixture({ link: 'UNAWAITED', heldLinkFinish: held, final: unknownFinal });
    const running = test.service.execute(actor, claim.requestId); let settled = false; void running.then(() => { settled = true; }, () => { settled = true; });
    await test.linkFinishEntered; await test.providerSettled;
    const before = [...test.order]; const wasSettled = settled; release(); await expect(running).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    expect(test.started()).toBeInstanceOf(Promise); expect(wasSettled).toBe(false); expect(before).not.toContain('final');
    await expect(test.started()).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.order).not.toContain('final'); expect(test.messages).toEqual([]);
  });
  it('joins an original delivery even after a faulty provider returns without awaiting its callback', async () => {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); const test = fixture({ link: 'UNAWAITED_DELIVERY', heldDelivery: held });
    const running = test.service.execute(actor, claim.requestId); let settled = false; void running.then(() => { settled = true; }, () => { settled = true; });
    await test.deliveryEntered; await test.providerSettled; const before = [...test.order]; const wasSettled = settled; release(); await expect(running).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    expect(wasSettled).toBe(false); expect(before).not.toContain('finish:DELIVERY'); expect(before).not.toContain('final'); expect(test.order).not.toContain('finish:DELIVERY'); expect(test.order).not.toContain('final'); expect(test.messages).toHaveLength(1);
  });
  it('rejects a claimed effect lease beyond the 60-second bound before provider work', async () => {
    const test = fixture({ claim: { ...claim, leaseExpiresAt: '2026-10-03T00:01:00.001Z' } }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.providerCalls).toEqual([]); expect(test.calls).toHaveLength(1);
  });
  it('rejects a nonfinite admission clock before the source transaction', async () => {
    let read = 0; const test = fixture({ clock: () => read++ === 0 ? Number.NaN : now }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.calls).toEqual([]); expect(test.providerCalls).toEqual([]);
  });
  it('refuses a final query response after the operation deadline', async () => {
    const test = fixture({ expireFinal: true }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' }); expect(test.messages).toHaveLength(1);
  });
  it.each(['token', 'token_hash', 'hashed_token', 'actionLink', 'action_link', 'admissionSecret', 'admission_secret', 'email', 'content'])('refuses forbidden %s fields in final receipts', async field => {
    const test = fixture({ final: { ...final, [field]: 'private-token' } }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
  });
  it.each(['token', 'token_hash', 'hashed_token', 'actionLink', 'admissionSecret'])('refuses credential-bearing confirmed identity receipt %s without another effect', async field => {
    const test = fixture({ createReceipt: { state: 'CONFIRMED', requestId: claim.requestId, userId: claim.userId, emailConfirmed: false, [field]: 'private-token' }, final: unknownFinal }); await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(unknownFinal); expect(test.providerCalls).toEqual(['create']); expect(test.messages).toEqual([]); expect(JSON.stringify(test.calls)).not.toContain('private-token');
  });
  it.each(['token', 'token_hash', 'hashed_token', 'actionLink', 'admissionSecret'])('refuses credential-bearing provider failure receipt %s without another effect', async field => {
    const create = fixture({ createReceipt: { state: 'REQUIRES_REVIEW', requestId: claim.requestId, code: 'IDENTITY_MISMATCH', [field]: 'private-token' }, final: unknownFinal }); await expect(create.service.execute(actor, claim.requestId)).resolves.toEqual(unknownFinal); expect(create.providerCalls).toEqual(['create']); expect(create.messages).toEqual([]); expect(JSON.stringify(create.calls)).not.toContain('private-token');
    const linked = fixture({ linkReceipt: { state: 'OUTCOME_UNKNOWN', requestId: claim.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN', [field]: 'private-token' }, final: unknownFinal }); await expect(linked.service.execute(actor, claim.requestId)).resolves.toEqual(unknownFinal); expect(linked.messages).toEqual([]); const receipt = linked.calls.find(call => call.sql.includes('finish_school_account_effect_step') && call.args?.[2] === 'LINK'); expect(JSON.parse(String(receipt?.args?.[4]))).toEqual({ state: 'OUTCOME_UNKNOWN', code: 'LINK_RESPONSE_UNCONFIRMED' }); expect(JSON.stringify(linked.calls)).not.toContain('private-token');
  });
  it.each([{ state: 'GENERATED', requestId: id(99), userId: claim.userId, purpose: 'invite' }, { state: 'GENERATED', requestId: claim.requestId, userId: id(99), purpose: 'invite' }, { state: 'GENERATED', requestId: claim.requestId, userId: claim.userId, purpose: 'recovery' }, { state: 'GENERATED', requestId: claim.requestId, userId: claim.userId, purpose: 'invite', token_hash: 'private-provider-token' }, { state: 'REQUIRES_REVIEW', requestId: claim.requestId, code: 'PROVIDER_REJECTED' }, { state: 'OUTCOME_UNKNOWN', requestId: claim.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' }, null])('refuses a contradictory outer link receipt %j after preserving actual link and delivery effects', async afterLinkReceipt => {
    const test = fixture({ afterLinkReceipt }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    expect(test.messages).toHaveLength(1); expect(test.providerCalls).toEqual(['create', 'link']); expect(test.order).not.toContain('final');
    const effects = test.calls.filter(call => call.sql.includes('finish_school_account_effect_step') && ['LINK', 'DELIVERY'].includes(String(call.args?.[2])));
    expect(effects.map(call => JSON.parse(String(call.args?.[4])))).toEqual([{ state: 'CONFIRMED', code: 'LINK_GENERATED' }, { state: 'CONFIRMED', code: 'DELIVERY_ACCEPTED' }]); expect(JSON.stringify(test.calls)).not.toContain('private-provider-token');
  });
  it('keeps actual accepted delivery evidence when the outer provider rejects after its callback', async () => {
    const test = fixture({ link: 'THROW_AFTER_CALLBACK' }); await expect(test.service.execute(actor, claim.requestId)).rejects.toMatchObject({ code: 'ACCOUNT_OUTCOME_UNKNOWN' });
    expect(test.messages).toHaveLength(1); expect(test.order).not.toContain('final'); expect(test.calls.filter(call => call.sql.includes('finish_school_account_effect_step')).map(call => JSON.parse(String(call.args?.[4])))).toEqual([{ state: 'CONFIRMED', code: 'IDENTITY_CONFIRMED', emailConfirmed: false }, { state: 'CONFIRMED', code: 'LINK_GENERATED' }, { state: 'CONFIRMED', code: 'DELIVERY_ACCEPTED' }]);
  });
  it.each([{ state: 'OUTCOME_UNKNOWN', requestId: claim.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' }, { state: 'REQUIRES_REVIEW', requestId: claim.requestId, code: 'IDENTITY_MISMATCH' }, { state: 'CONFIRMED', requestId: claim.requestId, userId: id(99), emailConfirmed: true }, { state: 'CONFIRMED', requestId: claim.requestId, userId: claim.userId }])('rechecks prior confirmed creation and refuses unconfirmed current identity %j', async reconcileReceipt => {
    const receipt = reconcileReceipt.state === 'REQUIRES_REVIEW' ? { ...unknownFinal, status: 'REQUIRES_REVIEW', providerState: 'REQUIRES_REVIEW' } : unknownFinal;
    const test = fixture({ claim: { ...claim, priorCreateState: 'CONFIRMED' }, reconcileReceipt, final: receipt }); await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(receipt); expect(test.providerCalls).toEqual(['reconcile']); expect(test.messages).toEqual([]);
  });
  it.each([false, null])('permits invitation after exact confirmed identity with emailConfirmed %s', async emailConfirmed => {
    const test = fixture({ claim: { ...claim, priorCreateState: 'CONFIRMED' }, reconcileReceipt: { state: 'CONFIRMED', requestId: claim.requestId, userId: claim.userId, emailConfirmed } }); await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(final); expect(test.providerCalls).toEqual(['reconcile', 'link']);
  });
  it.each([{ state: 'ACCEPTED', token_hash: 'private-token' }, Object.assign(Object.create({ state: 'ACCEPTED' }), { token: 'private-token' }), Object.defineProperty({ state: 'ACCEPTED' }, 'token', { value: 'private-token' })])('refuses accepted-looking delivery with forbidden or inherited fields %j', async deliveryReceipt => {
    const test = fixture({ deliveryReceipt, final: deliveryUnknownFinal }); await expect(test.service.execute(actor, claim.requestId)).resolves.toEqual(deliveryUnknownFinal); expect(test.messages).toHaveLength(1); const delivery = test.calls.find(call => call.sql.includes('finish_school_account_effect_step') && call.args?.[2] === 'DELIVERY'); expect(JSON.parse(String(delivery?.args?.[4]))).toEqual({ state: 'OUTCOME_UNKNOWN', code: 'DELIVERY_OUTCOME_UNKNOWN' }); expect(JSON.stringify(test.calls)).not.toContain('private-token');
  });
});
