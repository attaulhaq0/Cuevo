import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../../platform/database/database';
import type { AuthProvisioningAdapter } from '../../platform/identity/provisioning';

export type SchoolAccountDelivery = (message: { requestId: string; email: string; admissionUrl: string; expiresAt: string; signal: AbortSignal }) => Promise<{ state: 'ACCEPTED' }>;
const prior = z.enum(['NOT_ATTEMPTED', 'OUTCOME_UNKNOWN', 'CONFIRMED']);
const sourceSchema = z.object({ purpose: z.enum(['invite', 'recovery']).optional(), eventId: z.uuid(), leaseToken: z.uuid(), requestId: z.uuid(), schoolId: z.uuid(), userId: z.uuid(), email: z.email().max(254), requestRevision: z.number().int().positive(), expiresAt: z.iso.datetime({ offset: true }), leaseExpiresAt: z.iso.datetime({ offset: true }), state: z.literal('ADMITTED'), priorCreateState: prior, priorLinkState: prior, priorDeliveryState: prior }).strict().refine(value => (value.priorLinkState === 'NOT_ATTEMPTED' || value.priorCreateState === 'CONFIRMED') && (value.priorDeliveryState === 'NOT_ATTEMPTED' || value.priorLinkState === 'CONFIRMED'), 'Later steps require confirmed earlier effects.');
const state = z.enum(['CONFIRMED', 'OUTCOME_UNKNOWN', 'REQUIRES_REVIEW']);
const finalSchema = z.object({ id: z.uuid(), schoolId: z.uuid(), eventId: z.uuid(), requestRevision: z.number().int().positive(), status: z.enum(['AWAITING_CLAIM', 'REQUIRES_REVIEW', 'OUTCOME_UNKNOWN']), providerState: state, deliveryState: z.enum(['ACCEPTED', 'REQUIRES_REVIEW', 'OUTCOME_UNKNOWN']) }).strict().refine(value => value.status !== 'AWAITING_CLAIM' || value.providerState === 'CONFIRMED' && value.deliveryState === 'ACCEPTED', 'Awaiting claim requires confirmed provider and delivery effects.');
type Source = z.infer<typeof sourceSchema>;
type Step = 'CREATE' | 'LINK' | 'DELIVERY';
type Receipt = { state: 'CONFIRMED' | 'OUTCOME_UNKNOWN' | 'REQUIRES_REVIEW'; code: string; emailConfirmed?: boolean | null };
const providerCodes = z.enum(['PROVIDER_OUTCOME_UNKNOWN', 'PROVIDER_RESPONSE_UNCONFIRMED', 'IDENTITY_NOT_CONFIRMED', 'IDENTITY_MISMATCH', 'PROVIDER_REJECTED', 'LINK_NOT_CONFIRMED', 'EMAIL_NOT_CONFIRMED', 'LINK_RESPONSE_UNCONFIRMED', 'LINK_CONSUMPTION_UNKNOWN']);
const failedProvider = z.object({ state: z.enum(['OUTCOME_UNKNOWN', 'REQUIRES_REVIEW']), requestId: z.uuid(), code: providerCodes }).strict();
const generatedLink = z.object({ state: z.literal('GENERATED'), requestId: z.uuid(), userId: z.uuid(), purpose: z.enum(['invite', 'recovery']) }).strict();
function unknown() { return new DomainError('ACCOUNT_OUTCOME_UNKNOWN', 503, 'The account effect outcome is not confirmed. Reconcile the original request.'); }
function safe(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return code === '42501' ? new DomainError('FORBIDDEN', 403, 'Current school approval does not permit this account effect.') : unknown();
}
function acceptedDelivery(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value); const descriptor = Object.getOwnPropertyDescriptor(value, 'state');
  return keys.length === 1 && keys[0] === 'state' && descriptor !== undefined && 'value' in descriptor && descriptor.value === 'ACCEPTED';
}

/** Executes only a trusted exact request. SQL owns approval, leases and durable effect history. */
export class SchoolAccountEffectsService {
  private readonly now: () => number;
  private readonly admissionUrl: string; private readonly recoveryUrl: string;
  constructor(private readonly database: Database, private readonly provider: Pick<AuthProvisioningAdapter, 'createUnconfirmed' | 'reconcileUser' | 'generateLink'>, private readonly delivery: SchoolAccountDelivery, options: { admissionUrl: string; recoveryUrl?: string; now?: () => number }) {
    try { const url = new URL(options.admissionUrl); if (!['http://localhost:3000', 'http://127.0.0.1:3000'].includes(url.origin) || url.pathname !== '/account/admission' || url.username || url.password || url.search || url.hash) throw Error('Target'); this.admissionUrl = url.href; }
    catch { throw new DomainError('AUTH_PROVISIONING_TARGET_INVALID', 400, 'The local account continuation target is invalid.'); }
    this.recoveryUrl = options.recoveryUrl ?? new URL('/account/recovery', this.admissionUrl).href;
    if (this.recoveryUrl !== new URL('/account/recovery', this.admissionUrl).href) throw new DomainError('AUTH_PROVISIONING_TARGET_INVALID', 400, 'The local account recovery target is invalid.');
    this.now = options.now ?? Date.now;
  }
  async execute(actor: ActorContext, requestId: string): Promise<z.infer<typeof finalSchema>> {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']);
    if (!z.uuid().safeParse(requestId).success) throw new DomainError('INVALID_INPUT', 400, 'Review the exact account request.');
    const startedAt = this.now();
    if (!Number.isFinite(startedAt)) throw unknown();
    const operationDeadline = startedAt + 30_000;
    const query = async (sql: string, args: unknown[]) => this.database.actorTransaction(actor.userId, actor.schoolId, async client => (await client.query(sql, args)).rows[0]);
    try {
      const claimed = sourceSchema.safeParse((await query('select internal.claim_school_account_effect($1::uuid)as context', [requestId]))?.context);
      if (!claimed.success || claimed.data.requestId !== requestId || claimed.data.schoolId !== actor.schoolId) throw unknown();
      const source = claimed.data;
      const purpose = source.purpose ?? 'invite';
      const admittedAt = this.now(); const leaseExpiresAt = Date.parse(source.leaseExpiresAt);
      if (!Number.isFinite(admittedAt) || !Number.isFinite(operationDeadline) || leaseExpiresAt <= admittedAt || leaseExpiresAt > admittedAt + 60_000) throw unknown();
      let providerConfirmed = source.priorCreateState === 'CONFIRMED' && source.priorLinkState === 'CONFIRMED';
      let deliveryConfirmed = source.priorDeliveryState === 'CONFIRMED';
      const deadline = Math.min(operationDeadline, Date.parse(source.expiresAt), leaseExpiresAt);
      const guard = () => { const current = this.now(); if (!Number.isFinite(current) || current >= deadline) throw unknown(); };
      const begin = async (step: Step, tokenDigest: string | null = null) => {
        guard(); const attempt = randomUUID();
        if ((await query('select internal.begin_school_account_effect_step($1::uuid,$2::uuid,$3,$4::uuid,$5)as admitted', [source.eventId, source.leaseToken, step, attempt, tokenDigest]))?.admitted !== true) throw unknown();
        guard(); return attempt;
      };
      const finish = async (step: Step, attempt: string, receipt: Receipt) => {
        guard(); if ((await query('select internal.finish_school_account_effect_step($1::uuid,$2::uuid,$3,$4::uuid,$5::jsonb)as recorded', [source.eventId, source.leaseToken, step, attempt, JSON.stringify(receipt)]))?.recorded !== true) throw unknown(); guard();
      };
      const finalize = async () => {
        guard(); const parsed = finalSchema.safeParse((await query('select internal.finish_school_account_effect($1::uuid,$2::uuid)as receipt', [source.eventId, source.leaseToken]))?.receipt); guard();
        if (!parsed.success || parsed.data.id !== source.requestId || parsed.data.schoolId !== source.schoolId || parsed.data.eventId !== source.eventId || parsed.data.requestRevision !== source.requestRevision) throw unknown();
        if (parsed.data.status === 'AWAITING_CLAIM' && (!providerConfirmed || !deliveryConfirmed)) throw unknown();
        return parsed.data;
      };
      guard();
      if (source.priorLinkState === 'OUTCOME_UNKNOWN' || source.priorDeliveryState === 'OUTCOME_UNKNOWN' || source.priorDeliveryState === 'CONFIRMED') return await finalize();
      if (source.priorLinkState === 'CONFIRMED') {
        const attempt = await begin('DELIVERY'); await finish('DELIVERY', attempt, { state: 'OUTCOME_UNKNOWN', code: 'LINK_SECRET_UNAVAILABLE' }); return await finalize();
      }
      const identity = { requestId: source.requestId, userId: source.userId, email: source.email, priorState: source.priorCreateState };
      const createAttempt = await begin('CREATE'); let create: unknown;
      try { create = await (purpose === 'invite' && source.priorCreateState === 'NOT_ATTEMPTED' ? this.provider.createUnconfirmed(identity) : this.provider.reconcileUser(identity)); }
      catch { create = { state: 'OUTCOME_UNKNOWN', requestId: source.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' }; }
      guard(); const createReceipt = this.identityReceipt(create, source);
      await finish('CREATE', createAttempt, createReceipt);
      if (createReceipt.state !== 'CONFIRMED') return await finalize();
      if (purpose === 'recovery' && createReceipt.emailConfirmed !== true) throw unknown();
      let secret: string | undefined = randomBytes(32).toString('hex'); const tokenDigest = createHash('sha256').update(secret).digest('hex');
      const linkAttempt = await begin('LINK', tokenDigest); let linkRecorded = false; let callbackCalled = false; let invocationOpen = false; let callbackTask: Promise<void> | undefined; let boundaryFailure: unknown; let linked: unknown;
      const callbackGuard = () => { if (!invocationOpen) throw unknown(); guard(); };
      try {
        invocationOpen = true;
        linked = await this.provider.generateLink({ ...identity, priorState: 'NOT_ATTEMPTED', purpose }, transient => {
          if (!invocationOpen || callbackCalled) { boundaryFailure = unknown(); const rejected = Promise.reject(boundaryFailure); void rejected.catch(() => undefined); return rejected; } callbackCalled = true;
          callbackTask = (async () => {
            try {
              callbackGuard(); if (!secret) throw unknown(); const admissionUrl = this.continuation(transient, source, secret);
              await finish('LINK', linkAttempt, { state: 'CONFIRMED', code: 'LINK_GENERATED' }); linkRecorded = true; providerConfirmed = true; callbackGuard();
              const deliveryAttempt = await begin('DELIVERY'); callbackGuard(); let delivered: Receipt;
              try {
                const receipt = await this.delivery({ requestId: source.requestId, email: source.email, admissionUrl, expiresAt: source.expiresAt, signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - this.now()))) });
                callbackGuard(); delivered = acceptedDelivery(receipt) ? { state: 'CONFIRMED', code: 'DELIVERY_ACCEPTED' } : { state: 'OUTCOME_UNKNOWN', code: 'DELIVERY_OUTCOME_UNKNOWN' };
              } catch { callbackGuard(); delivered = { state: 'OUTCOME_UNKNOWN', code: 'DELIVERY_OUTCOME_UNKNOWN' }; }
              await finish('DELIVERY', deliveryAttempt, delivered); callbackGuard();
              deliveryConfirmed = delivered.state === 'CONFIRMED';
            } catch (error) { boundaryFailure = error; throw error; }
          })();
          // Observe the original task even when a faulty provider does not await its sink.
          void callbackTask.catch(() => undefined); return callbackTask;
        });
      } catch { linked = { state: 'OUTCOME_UNKNOWN', requestId: source.requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' }; }
      finally { invocationOpen = false; secret = undefined; }
      if (callbackTask) { try { await callbackTask; } catch (error) { boundaryFailure = error; } }
      guard(); if (boundaryFailure) throw boundaryFailure;
      if (linkRecorded) {
        const generated = generatedLink.safeParse(linked);
        if (!generated.success || generated.data.requestId !== source.requestId || generated.data.userId !== source.userId || generated.data.purpose !== purpose) throw unknown();
      } else await finish('LINK', linkAttempt, this.linkReceipt(linked, source));
      return await finalize();
    } catch (error) { throw safe(error); }
  }
  private identityReceipt(value: unknown, source: Source): Receipt {
    const confirmed = z.object({ state: z.literal('CONFIRMED'), requestId: z.uuid(), userId: z.uuid(), emailConfirmed: z.boolean().nullable() }).strict().safeParse(value);
    if (confirmed.success && confirmed.data.requestId === source.requestId && confirmed.data.userId === source.userId) return { state: 'CONFIRMED', code: 'IDENTITY_CONFIRMED', emailConfirmed: confirmed.data.emailConfirmed };
    const failure = failedProvider.safeParse(value);
    return failure.success && failure.data.requestId === source.requestId ? { state: failure.data.state, code: failure.data.code } : { state: 'OUTCOME_UNKNOWN', code: 'PROVIDER_RESPONSE_UNCONFIRMED' };
  }
  private linkReceipt(value: unknown, source: Source): Receipt {
    const failure = failedProvider.safeParse(value);
    return failure.success && failure.data.requestId === source.requestId ? { state: failure.data.state, code: failure.data.code } : { state: 'OUTCOME_UNKNOWN', code: 'LINK_RESPONSE_UNCONFIRMED' };
  }
  private continuation(transient: { actionLink: string; purpose: 'invite' | 'recovery' }, source: Source, secret: string): string {
    try {
      const action = new URL(transient.actionLink); const fields = [...action.searchParams.keys()]; const token = action.searchParams.get('token');
      const purpose = source.purpose ?? 'invite'; const target = purpose === 'invite' ? this.admissionUrl : this.recoveryUrl;
      if (transient.purpose !== purpose || action.origin !== 'http://127.0.0.1:56321' || action.pathname !== '/auth/v1/verify' || action.username || action.password || action.hash || fields.length !== 3 || new Set(fields).size !== 3 || fields.some(field => !['type', 'token', 'redirect_to'].includes(field)) || action.searchParams.get('type') !== purpose || action.searchParams.get('redirect_to') !== target || !token || token.length > 4096) throw Error('Link');
      const url = new URL(target); url.hash = new URLSearchParams({ id: source.requestId, type: purpose, token_hash: token, admission_secret: secret }).toString(); return url.href;
    } catch { throw unknown(); }
  }
}
