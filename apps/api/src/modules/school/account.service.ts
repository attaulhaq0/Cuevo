import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import { schoolAccountAvailabilitySchema, schoolAccountInviteSchema, schoolAccountInvitationRevokeSchema, schoolAccountClaimSchema, schoolAccountInvitationQuerySchema, schoolAccountInvitationReceiptSchema, schoolAccountInvitationPageSchema, schoolAccountClaimReceiptSchema, schoolAccountEffectStatusSchema, schoolAccountRecoveryRequestSchema, schoolAccountRecoveryAuthorizationSchema, schoolAccountRecoveryCompletionSchema, schoolAccountRecoveryReceiptSchema, idempotencyKeySchema } from '@cuevo/contracts';
import { parseVerifiedAccount, type VerifiedAccount } from '../../platform/identity/identity.service';
import type { Database } from '../../platform/database/database';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT', 400, 'Review the school account fields and confirmation.');
  return result.data;
}
function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function unknownOutcome(): DomainError { return new DomainError('ACCOUNT_OUTCOME_UNKNOWN', 503, 'The account request outcome is not confirmed. Reconcile the original request.'); }
function safe(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return code === 'P0002' ? new DomainError('RECOVERY_PASSWORD_UNCHANGED', 409, 'The password change has not been recorded. Review and save your new password.') : code === '42501' ? new DomainError('FORBIDDEN', 403, 'Your current access does not permit this account operation.') : ['22023', '23505', '55000'].includes(code) ? new DomainError('ACCOUNT_REQUIRES_REVIEW', 409, 'Review the current school account request and approval.') : unknownOutcome();
}
export class SchoolAccountService {
  constructor(private readonly database: Database) {}
  async availability(actor: ActorContext) {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']);
    try { return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      const output = (await client.query('select internal.read_school_account_availability() as status')).rows[0]?.status;
      const result = schoolAccountAvailabilitySchema.safeParse(output);
      if (!result.success) throw unknownOutcome();
      return result.data;
    }); } catch (error) { throw safe(error); }
  }
  async requestRecovery(actor: ActorContext, userId: string, body: unknown, key: unknown, requestId: string) {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']); const target = parse(z.uuid(), userId); const input = parse(schoolAccountRecoveryRequestSchema, body); const commandKey = parse(idempotencyKeySchema, key);
    try { return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      const output = (await client.query('select internal.create_school_account_recovery($1::uuid,$2::jsonb,$3,$4,$5) as receipt', [target, JSON.stringify(input), commandKey, fingerprint({ command: 'school.account.recovery.request', userId: target, input }), requestId])).rows[0]?.receipt;
      const result = schoolAccountInvitationReceiptSchema.safeParse(output); if (!result.success || result.data.schoolId !== actor.schoolId) throw unknownOutcome(); return result.data;
    }); } catch (error) { throw safe(error); }
  }
  async recovery(account: VerifiedAccount, body: unknown, key: unknown, requestId: string, complete = false) {
    const current = parseVerifiedAccount(account); const input = complete ? parse(schoolAccountRecoveryCompletionSchema, body) : parse(schoolAccountRecoveryAuthorizationSchema, body); const commandKey = parse(idempotencyKeySchema, key);
    const secretDigest = 'admissionSecret' in input ? createHash('sha256').update(input.admissionSecret).digest('hex') : null;
    try { return await this.database.actorTransaction(current.userId, undefined, async client => {
      await client.query("select set_config('app.session_id',$1,true)", [current.sessionId]);
      if ((await client.query('select "authorization".is_current_session($1::uuid) as active', [current.sessionId])).rows[0]?.active !== true) throw new DomainError('SESSION_REVOKED', 401, 'Sign in again before account recovery.');
      const fp = fingerprint({ command: complete ? 'school.account.recovery.complete' : 'school.account.recovery.authorize', id: input.id, ...(complete ? {} : { secretDigest }) });
      const output = complete ? (await client.query('select internal.complete_school_account_recovery($1::uuid,$2,$3,$4) as receipt', [input.id, commandKey, fp, requestId])).rows[0]?.receipt : (await client.query('select internal.authorize_school_account_recovery($1::uuid,$2,$3,$4,$5) as receipt', [input.id, secretDigest, commandKey, fp, requestId])).rows[0]?.receipt;
      const result = schoolAccountRecoveryReceiptSchema.safeParse(output); if (!result.success || result.data.id !== input.id || result.data.userId !== current.userId || result.data.status !== (complete ? 'COMPLETED' : 'AUTHORIZED')) throw unknownOutcome(); return result.data;
    }); } catch (error) { throw safe(error); }
  }
  async effectStatus(actor: ActorContext, id: string) {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']); const target = parse(z.uuid(), id);
    try { return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
      const output = (await client.query('select internal.read_school_account_effect($1::uuid) as status', [target])).rows[0]?.status;
      const result = schoolAccountEffectStatusSchema.safeParse(output);
      if (!result.success || result.data.receipt && (result.data.receipt.id !== target || result.data.receipt.schoolId !== actor.schoolId)) throw new DomainError('REQUEST_UNAVAILABLE', 503, 'Current invitation delivery status could not be confirmed.');
      return result.data;
    }); } catch (error) { throw safe(error); }
  }
  async invite(actor: ActorContext, body: unknown, key: unknown, requestId: string) {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']);
    const input = parse(schoolAccountInviteSchema, body); const commandKey = parse(idempotencyKeySchema, key);
    try {
      return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const output = (await client.query('select internal.create_school_account_invitation($1::jsonb,$2,$3,$4) as receipt', [JSON.stringify(input), commandKey, fingerprint({ command: 'school.account.invite', input }), requestId])).rows[0]?.receipt;
        const result = schoolAccountInvitationReceiptSchema.safeParse(output);
        if (!result.success || result.data.schoolId !== actor.schoolId) throw unknownOutcome();
        return result.data;
      });
    } catch (error) { throw safe(error); }
  }
  async list(actor: ActorContext, query: unknown) {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']); const input = parse(schoolAccountInvitationQuerySchema, query);
    try {
      return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const output = (await client.query('select internal.read_school_account_invitations($1,$2::uuid) as page', [input.limit, input.cursor ?? null])).rows[0]?.page;
        const result = schoolAccountInvitationPageSchema.safeParse(output);
        if (!result.success || result.data.items.length > input.limit || result.data.items.some(item => item.schoolId !== actor.schoolId)) throw new DomainError('REQUEST_UNAVAILABLE', 503, 'Current school invitation records could not be confirmed.');
        return result.data;
      });
    } catch (error) { throw safe(error); }
  }
  async revoke(actor: ActorContext, id: string, body: unknown, key: unknown, requestId: string) {
    requireCapability(actor, actor.schoolId, 'school.operations', ['admin']); const target = parse(z.uuid(), id); const input = parse(schoolAccountInvitationRevokeSchema, body); const commandKey = parse(idempotencyKeySchema, key);
    try {
      return await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const output = (await client.query('select internal.revoke_school_account_invitation($1::uuid,$2::jsonb,$3,$4,$5) as receipt', [target, JSON.stringify(input), commandKey, fingerprint({ command: 'school.account.revoke', id: target, input }), requestId])).rows[0]?.receipt;
        const result = schoolAccountInvitationReceiptSchema.safeParse(output);
        if (!result.success || result.data.id !== target || result.data.schoolId !== actor.schoolId || result.data.status !== 'REVOKED') throw unknownOutcome();
        return result.data;
      });
    } catch (error) { throw safe(error); }
  }
  async claim(account: VerifiedAccount, body: unknown, key: unknown, requestId: string) {
    const current = parseVerifiedAccount(account); const input = parse(schoolAccountClaimSchema, body); const commandKey = parse(idempotencyKeySchema, key);
    const secretDigest = createHash('sha256').update(input.admissionSecret).digest('hex');
    try {
      return await this.database.actorTransaction(current.userId, undefined, async client => {
        await client.query("select set_config('app.session_id',$1,true)", [current.sessionId]);
        if ((await client.query('select "authorization".is_current_session($1::uuid) as active', [current.sessionId])).rows[0]?.active !== true) throw new DomainError('SESSION_REVOKED', 401, 'Sign in again before accepting school access.');
        const output = (await client.query('select internal.claim_school_account_invitation($1::uuid,$2,$3,$4,$5) as receipt', [input.id, secretDigest, commandKey, fingerprint({ command: 'school.account.claim', id: input.id, secretDigest }), requestId])).rows[0]?.receipt;
        const result = schoolAccountClaimReceiptSchema.safeParse(output);
        if (!result.success || result.data.id !== input.id || result.data.userId !== current.userId) throw unknownOutcome();
        return result.data;
      });
    } catch (error) { throw safe(error); }
  }
}
