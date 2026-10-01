import { createHash } from 'node:crypto';
import { z } from 'zod';
import { analyzeInputSchema, idempotencyKeySchema } from '@cuevo/contracts';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import type { Database } from '../../platform/database/database';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { ServerConfig } from '@cuevo/config';
import { orchestrateProposal, validateEvidenceContext, type AIProvider } from './orchestrator';
import { createFixtureProvider } from './fixture-provider';
import { validateInsightContext } from './insight-context';

type Reservation = { state: 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; runId?: string; leaseToken?: string; context?: unknown; response?: unknown; failureCode?: string };
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT', 400, 'Review the intelligence request fields.');
  return result.data;
}
function safeFailure(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === '42501') return new DomainError('FORBIDDEN', 403, 'Your current access does not permit this analysis.');
  if (code === 'P0002') return new DomainError('INTELLIGENCE_INSUFFICIENT_EVIDENCE', 409, 'Released evidence and an approved source version are required.');
  if (code === '22023') return new DomainError('INTELLIGENCE_REQUIRES_REVIEW', 409, 'The intelligence source or policy requires review.');
  return new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Intelligence services are temporarily unavailable.');
}
function outcomeUnknown(): DomainError { return new DomainError('INTELLIGENCE_OUTCOME_UNKNOWN', 503, 'The analysis outcome is not confirmed. Reconcile the original request.'); }
/** SQL rejection proves no write; transport/COMMIT failure does not prove rollback. */
function persistenceFailure(error:unknown):DomainError {
  const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';
  if(['42501','P0002','22023'].includes(code))return safeFailure(error);
  return outcomeUnknown();
}
export class IntelligenceService {
  private readonly provider: AIProvider | undefined;
  constructor(private readonly identity: IdentityService, private readonly database: Database, private readonly config: ServerConfig, provider?: AIProvider) {
    this.provider = provider ?? (config.intelligence.mode === 'FIXTURE' && config.aiEnabled ? createFixtureProvider() : undefined);
  }
  private async actor(header: string | undefined, school: string | undefined, expected?: ActorContext) {
    const actor = await this.identity.resolve(header, school);
    requireCapability(actor, actor.schoolId, 'improvement', ['admin', 'teacher']);
    if (expected && (expected.userId !== actor.userId || expected.schoolId !== actor.schoolId)) throw new DomainError('FORBIDDEN', 403, 'Your current access does not permit this analysis.');
    return actor;
  }
  async analyze(header: string | undefined, school: string | undefined, body: unknown, key: unknown, requestId: string): Promise<unknown> {
    const actor = await this.actor(header, school);
    const input = parse(analyzeInputSchema, body);
    const commandKey = parse(idempotencyKeySchema, key);
    const settings = this.config.intelligence;
    if (!this.provider || !this.config.aiEnabled || settings.mode === 'DISABLED' || !settings.approved) throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'An approved intelligence provider and school policy are required.');
    // Runtime construction repeats the production fixture guard; injected adapters never relax it.
    if (settings.mode === 'FIXTURE' && this.config.nodeEnv === 'production') throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Fixture intelligence is unavailable in production.');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let reservation: Reservation;
    try {
      reservation = await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const row = (await client.query('select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5) as reservation', [commandKey, fingerprint, input.baselineResultId,
          JSON.stringify({ mode: settings.mode, provider: settings.provider, model: settings.model, promptId: settings.promptId, promptVersion: settings.promptVersion, policyVersion: settings.policyVersion, timeoutMs: settings.timeoutMs, maxTokens: settings.maxTokens, maxCost: settings.maxCost }), requestId])).rows[0];
        if (!row?.reservation) throw outcomeUnknown();
        return row.reservation as Reservation;
      });
    } catch (error) { throw persistenceFailure(error); }
    // SQL authorizes current source/policy before returning stored command responses.
    if (reservation.state === 'COMPLETED') {if(!reservation.response)throw outcomeUnknown();return reservation.response;}
    if (reservation.state === 'FAILED') throw new DomainError(reservation.failureCode ?? 'INTELLIGENCE_REQUIRES_REVIEW', 503, 'This analysis attempt did not produce a proposal. Start a new analysis after review.');
    if (reservation.state !== 'NEW' || !reservation.runId || !reservation.leaseToken) throw new DomainError('COMMAND_IN_PROGRESS', 409, 'This analysis is in progress. Reconcile the original request.');
    let result:Awaited<ReturnType<typeof orchestrateProposal>>;
    try {
      const context = validateEvidenceContext(reservation.context);
      const raw = reservation.context as Record<string, unknown>;
      result = await orchestrateProposal(this.provider, { ...context, ...(raw.insight ? { insight: validateInsightContext(raw.insight,context) } : {}) }, settings);
    } catch (error) {
      const safe = safeFailure(error);
      // A provider rejection is definitive only after its durable failure receipt commits.
      try {
        const current = await this.actor(header, school, actor);
        await this.database.actorTransaction(current.userId, current.schoolId, async client => { await client.query('select internal.fail_intelligence_run($1,$2,$3,$4)', [reservation.runId, reservation.leaseToken,
          /^INTELLIGENCE_(TIMEOUT|LIMIT_EXCEEDED|PROVIDER_FAILED|REQUIRES_REVIEW|INSUFFICIENT_EVIDENCE|UNAVAILABLE)$/.test(safe.code) ? safe.code : 'INTELLIGENCE_REQUIRES_REVIEW', requestId]); });
      } catch { throw outcomeUnknown(); }
      throw safe;
    }
    const current=await this.actor(header,school,actor);
    try {
      return await this.database.actorTransaction(current.userId,current.schoolId,async client=>{
        const row=(await client.query('select internal.complete_intelligence_run($1,$2,$3::jsonb,$4::jsonb,$5) as response',[reservation.runId,reservation.leaseToken,JSON.stringify(result.groundedOutput),JSON.stringify(result.usage),requestId])).rows[0];
        if(!row?.response)throw outcomeUnknown();
        return row.response;
      });
    } catch(error) {
      // Never overwrite a potentially committed proposal with a late failure or clear its key.
      throw persistenceFailure(error);
    }
  }
}
export function createIntelligenceService(identity: IdentityService, database: Database, config: ServerConfig): IntelligenceService {
  return new IntelligenceService(identity, database, config);
}
