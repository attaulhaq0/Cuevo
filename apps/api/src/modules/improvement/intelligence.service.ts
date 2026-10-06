import { createHash } from 'node:crypto';
import { z } from 'zod';
import { analyzeInputSchema, idempotencyKeySchema,intelligenceBudgetPolicyInputSchema,intelligenceBudgetStatusSchema,schoolIntelligencePolicyInputSchema,schoolIntelligencePolicyStatusSchema,intelligenceQualityReviewInputSchema,intelligenceQualityReviewStatusSchema,intelligenceExecutionRegistrySchema } from '@cuevo/contracts';
import { DomainError, requireCapability, type ActorContext } from '@cuevo/domain';
import type { Database } from '../../platform/database/database';
import type { IdentityService } from '../../platform/identity/identity.service';
import type { ServerConfig } from '@cuevo/config';
import { orchestrateProposal, validateEvidenceContext, ProposalEvaluationError, type AIProvider } from './orchestrator';
import { createFixtureProvider } from './fixture-provider';
import { validateInsightContext } from './insight-context';
import { FoundryProvider } from './foundry-provider';
import { resolveIntelligencePrompt } from './prompt';
import { intelligenceActionSchema,intelligenceRunStatusSchema,paginationSchema } from '@cuevo/contracts';
import { intelligenceExecutionManifest } from './execution-manifest';

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
    this.provider = provider ?? (config.intelligence.mode === 'FIXTURE' && config.aiEnabled ? createFixtureProvider() : config.intelligence.mode === 'LIVE' && config.aiEnabled && config.foundry?.endpoint && config.foundry.apiKey && config.intelligence.model ? new FoundryProvider({ ...config.foundry, endpoint: config.foundry.endpoint, apiKey: config.foundry.apiKey, model: config.intelligence.model, reservedCost: config.intelligence.maxCost }) : undefined);
  }
  private async actor(header: string | undefined, school: string | undefined, expected?: ActorContext) {
    const actor = await this.identity.resolve(header, school);
    requireCapability(actor, actor.schoolId, 'improvement', ['admin', 'teacher']);
    if (expected && (expected.userId !== actor.userId || expected.schoolId !== actor.schoolId)) throw new DomainError('FORBIDDEN', 403, 'Your current access does not permit this analysis.');
    return actor;
  }
  async runs(header:string|undefined,school:string|undefined,query:unknown,target?:string){
    const actor=await this.actor(header,school);const page=parse(paginationSchema,query);if(target)parse(z.uuid(),target);
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{const result=(await client.query('select internal.read_intelligence_run_status($1,$2,$3)as page',[page.limit,page.cursor??null,target??null])).rows[0]?.page;
      const schema=z.object({items:z.array(intelligenceRunStatusSchema).max(100),nextCursor:z.uuid().nullable()}).strict();const parsed=schema.safeParse(result);if(!parsed.success)throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'Run status requires review.');return target?parsed.data.items[0]??null:parsed.data;});}
    catch(error){throw safeFailure(error);}
  }
  async budget(header:string|undefined,school:string|undefined,body?:unknown,key?:unknown,requestId='intelligence-budget-read'){
    const actor=await this.actor(header,school);if(actor.role!=='admin')throw new DomainError('FORBIDDEN',403,'School budget approval requires administrator access.');
    const input=body===undefined?undefined:parse(intelligenceBudgetPolicyInputSchema,body);const commandKey=input?parse(idempotencyKeySchema,key):undefined;
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{if(input)await client.query('select internal.approve_intelligence_budget($1::jsonb,$2,$3,$4)',[JSON.stringify(input),commandKey,createHash('sha256').update(JSON.stringify(input)).digest('hex'),requestId]);const result=(await client.query('select internal.read_intelligence_budget()as budget')).rows[0]?.budget;return{id:actor.schoolId,...intelligenceBudgetStatusSchema.parse(result)};});}catch(error){throw safeFailure(error);}
  }
  async schoolPolicy(header:string|undefined,school:string|undefined,body?:unknown,key?:unknown,requestId='intelligence-policy-read'){
    const actor=await this.actor(header,school);if(actor.role!=='admin')throw new DomainError('FORBIDDEN',403,'School intelligence policy requires administrator access.');
    const input=body===undefined?undefined:parse(schoolIntelligencePolicyInputSchema,body);const commandKey=input?parse(idempotencyKeySchema,key):undefined;
    if(input?.fixtureEnabled&&(this.config.nodeEnv==='production'&&this.config.deploymentEnvironment!=='synthetic-staging'||this.config.intelligence.mode!=='FIXTURE'||!this.config.aiEnabled))throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'Fixture activation requires explicit local or hosted synthetic configuration.');
    if(input?.liveEnabled&&(this.config.intelligence.mode!=='LIVE'||!this.config.aiEnabled||!this.provider||!this.config.intelligence.globalDailyBudget))throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'Live activation requires approved server provider/data and budget configuration.');
    const approvedManifest=input?intelligenceExecutionManifest(this.config,input.dataClassification):null;
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{if(input){await client.query('select internal.approve_school_intelligence_policy($1::jsonb,$2,$3,$4)',[JSON.stringify(input),commandKey,createHash('sha256').update(JSON.stringify({input,executionManifest:approvedManifest})).digest('hex'),requestId]);if(approvedManifest&&(input.fixtureEnabled&&approvedManifest.mode==='FIXTURE'||input.liveEnabled&&approvedManifest.mode==='LIVE'))await client.query('select internal.approve_intelligence_execution($1::jsonb,$2)',[JSON.stringify(approvedManifest),requestId]);}return schoolIntelligencePolicyStatusSchema.parse((await client.query('select internal.read_school_intelligence_policy()as policy')).rows[0]?.policy);});}catch(error){throw safeFailure(error);}
  }
  async executionRegistry(header:string|undefined,school:string|undefined){
    const actor=await this.actor(header,school);try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{
      const row=(await client.query('select internal.read_intelligence_execution_binding()as binding,(select jsonb_build_object(\'version\',version,\'dataClassification\',data_classification,\'fixtureEnabled\',fixture_enabled,\'liveEnabled\',live_enabled)from app.intelligence_policies where school_id=$1)as policy',[actor.schoolId])).rows[0];
      const policy=row?.policy;const classification=policy?.dataClassification==='SCHOOL_CUSTOM_NATIVE'?'SCHOOL_CUSTOM_NATIVE':'SCHOOL_CUSTOM_NUMERIC';const current=intelligenceExecutionManifest(this.config,classification);const binding=row?.binding??null;
      const enabled=current?.mode==='FIXTURE'?policy?.fixtureEnabled===true:current?.mode==='LIVE'&&policy?.liveEnabled===true;
      const same=current&&binding&&Number.isInteger(policy?.version)&&binding.policyVersion===policy.version&&enabled&&Date.parse(binding.effectiveAt)<=Date.now()&&Object.entries(current).every(([key,value])=>JSON.stringify(binding.manifest[key])===JSON.stringify(value));
      return intelligenceExecutionRegistrySchema.parse({id:actor.schoolId,current,binding,status:!current?'SERVER_UNAVAILABLE':same?'APPROVED':'REQUIRES_APPROVAL'});
    });}catch(error){throw safeFailure(error);}
  }
  async qualityReview(header:string|undefined,school:string|undefined,target:string,body?:unknown,key?:unknown,requestId='intelligence-review-read'){
    const actor=await this.actor(header,school);parse(z.uuid(),target);const input=body===undefined?undefined:parse(intelligenceQualityReviewInputSchema,body);const commandKey=input?parse(idempotencyKeySchema,key):undefined;
    try{return await this.database.actorTransaction(actor.userId,actor.schoolId,async client=>{if(input)await client.query('select internal.record_intelligence_quality_review($1,$2::jsonb,$3,$4,$5)',[target,JSON.stringify(input),commandKey,createHash('sha256').update(JSON.stringify({target,input})).digest('hex'),requestId]);return intelligenceQualityReviewStatusSchema.parse((await client.query('select internal.read_intelligence_quality_review($1)as review',[target])).rows[0]?.review);});}catch(error){throw safeFailure(error);}
  }
  async analyze(header: string | undefined, school: string | undefined, body: unknown, key: unknown, requestId: string): Promise<unknown> {
    const actor = await this.actor(header, school);
    const input = parse(analyzeInputSchema, body);
    const commandKey = parse(idempotencyKeySchema, key);
    const settings = this.config.intelligence;
    let prompt=resolveIntelligencePrompt(settings.promptId,settings.promptVersion);
    if(settings.mode==='LIVE'&&!settings.globalDailyBudget)throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'An explicit global live budget is required.');
    if (!this.provider || !this.config.aiEnabled || settings.mode === 'DISABLED' || !settings.approved) throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'An approved intelligence provider and school policy are required.');
    // Runtime construction repeats the production fixture guard; injected adapters never relax it.
    if (settings.mode === 'FIXTURE' && this.config.nodeEnv === 'production' && this.config.deploymentEnvironment !== 'synthetic-staging') throw new DomainError('INTELLIGENCE_UNAVAILABLE', 503, 'Fixture intelligence is unavailable in production.');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let reservation: Reservation;
    try {
      reservation = await this.database.actorTransaction(actor.userId, actor.schoolId, async client => {
        const policy=(await client.query('select version,data_classification from app.intelligence_policies where school_id=$1',[actor.schoolId])).rows[0];
        if(!policy||!Number.isInteger(policy.version))throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'Current school intelligence approval is unavailable.');
        if(policy.data_classification==='SCHOOL_CUSTOM_NATIVE')prompt=resolveIntelligencePrompt(settings.promptId,'3');
        const manifest=intelligenceExecutionManifest(this.config,policy.data_classification==='SCHOOL_CUSTOM_NATIVE'?'SCHOOL_CUSTOM_NATIVE':'SCHOOL_CUSTOM_NUMERIC');if(!manifest)throw new DomainError('INTELLIGENCE_UNAVAILABLE',503,'An implemented approved execution manifest is required.');
        const row = (await client.query('select internal.begin_teacher_insight_run($1,$2,$3,$4::jsonb,$5) as reservation', [commandKey, fingerprint, input.baselineResultId,
          JSON.stringify({ mode: settings.mode, provider: settings.provider, model: settings.model, promptId: prompt.id, promptVersion: prompt.version,promptDigest:prompt.digest,executionManifest:manifest, policyVersion: policy.version, timeoutMs: settings.timeoutMs, maxTokens: settings.maxTokens, maxCost: settings.maxCost,...(settings.mode==='LIVE'?{globalDailyBudget:settings.globalDailyBudget}:{}),
            ...(this.config.foundry && settings.mode === 'LIVE' ? { syntheticOnly: this.config.foundry.syntheticOnly, costBasis: this.config.foundry.inputCostPerMillion !== undefined && this.config.foundry.outputCostPerMillion !== undefined ? 'CONFIGURED_TOKEN_RATES' : 'BUDGET_RESERVATION' } : settings.mode === 'FIXTURE' ? { syntheticOnly: true, costBasis: 'DETERMINISTIC_FIXTURE' } : {}) }), requestId])).rows[0];
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
      const actions=z.array(intelligenceActionSchema).min(1).max(2).safeParse(raw.allowedActions);
      if(!actions.success)throw new DomainError('INTELLIGENCE_REQUIRES_REVIEW',409,'Frozen school action policy is unavailable.');
      result = await orchestrateProposal(this.provider, { ...context, ...(raw.insight ? { insight: validateInsightContext(raw.insight,context) } : {}) }, {...settings,allowedActions:actions.data,prompt});
    } catch (error) {
      const safe = safeFailure(error);
      // A provider rejection is definitive only after its durable failure receipt commits.
      try {
        const current = await this.actor(header, school, actor);
        await this.database.actorTransaction(current.userId, current.schoolId, async client => { await client.query('select internal.fail_intelligence_run($1,$2,$3,$4,$5)', [reservation.runId, reservation.leaseToken,
          /^INTELLIGENCE_(TIMEOUT|LIMIT_EXCEEDED|PROVIDER_FAILED|REQUIRES_REVIEW|INSUFFICIENT_EVIDENCE|UNAVAILABLE)$/.test(safe.code) ? safe.code : 'INTELLIGENCE_REQUIRES_REVIEW', requestId,error instanceof ProposalEvaluationError]); });
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
