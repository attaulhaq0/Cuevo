import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { parseServerConfig } from '@cuevo/config';
import { IntelligenceService } from '../../src/modules/improvement/intelligence.service';
import { DomainError } from '@cuevo/domain';
import type { Database } from '../../src/platform/database/database';
import type { IdentityService } from '../../src/platform/identity/identity.service';

const actor = { userId: '20000000-0000-4000-8000-000000000004', schoolId: '10000000-0000-4000-8000-000000000001', membershipId: '70000000-0000-4000-8000-000000000004', role: 'teacher' as const, entitlements: ['improvement'] };
const context = { resultId: '00000000-0000-4000-8000-000000000001', evidenceId: '00000000-0000-4000-8000-000000000002', referenceId: '00000000-0000-4000-8000-000000000003', referenceVersion: 'school1', score: 3, maxScore: 10 };
const generated = { evidenceIds: [context.evidenceId], facts: [{ kind: 'NUMERIC_RESULT', ...context }], action: 'GUIDED_PRACTICE', reason: 'REVIEW_RECORDED_RESULT', limitation: 'SINGLE_RESULT_NOT_CAUSAL' };
const config = parseServerConfig({ NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:56321', AI_GENERATION_MODE: 'FIXTURE', AI_FIXTURE_ENABLED: 'true' });
const response = { id: '00000000-0000-4000-8000-000000000005', origin: 'AI_GENERATED', generationMode: 'FIXTURE', intelligenceRunId: '00000000-0000-4000-8000-000000000004', status: 'AWAITING_HUMAN' };

function store(reservation: Record<string, unknown> = { state: 'NEW', runId: response.intelligenceRunId, leaseToken: context.evidenceId, context }, persistFailure?: Error, receiptFailure?: 'START'|'COMPLETE'|'FAIL') {
  let inside = false;
  let writes = 0;
  let failure: unknown;
  const database = { actorTransaction: async (_user: string, _school: string, fn: (client: PoolClient) => Promise<unknown>) => {
    inside = true;
    let phase='';
    try { const result=await fn({ query: async (sql: string, values: unknown[]) => { if (sql.includes('begin_teacher_insight_run')) {phase='START';return { rows: [{ reservation }] };} if (sql.includes('complete_intelligence_run')) {phase='COMPLETE'; if(persistFailure)throw persistFailure; writes++; return { rows: [{ response }] }; } if(sql.includes('fail_intelligence_run')){phase='FAIL';failure=values[2];} return { rows: [] }; } } as unknown as PoolClient);if(phase===receiptFailure)throw Error('COMMIT receipt lost');return result; }
    finally { inside = false; }
  } } as unknown as Database;
  return { database, inside: () => inside, writes: () => writes, failure:()=>failure };
}

describe('governed intelligence service boundaries', () => {
  it('runs provider outside transaction and returns only a persisted human-controlled proposal', async () => {
    const db = store();
    const identity = { resolve: async () => actor } as unknown as IdentityService;
    const service = new IntelligenceService(identity, db.database, config, { generate: async () => { expect(db.inside()).toBe(false); return { output: generated, outputTokens: 0, cost: 0 }; } });
    expect(await service.analyze('Bearer token', actor.schoolId, { baselineResultId: context.resultId }, 'request-key', 'request-id')).toEqual(response);
    expect(db.writes()).toBe(1);
  });
  it('rechecks a revoked session after generation and persists no proposal', async () => {
    const db = store(); let calls = 0;
    const identity = { resolve: async () => { if (++calls > 1) throw new DomainError('SESSION_REVOKED', 401, 'Sign in again.'); return actor; } } as unknown as IdentityService;
    const service = new IntelligenceService(identity, db.database, config, { generate: async () => ({ output: generated, outputTokens: 0, cost: 0 }) });
    await expect(service.analyze('Bearer token', actor.schoolId, { baselineResultId: context.resultId }, 'request-key', 'request-id')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(db.writes()).toBe(0);
  });
  it('denies unauthorized actor before any context retrieval', async () => {
    const db = store();
    const identity = { resolve: async () => ({ ...actor, role: 'student' }) } as unknown as IdentityService;
    const service = new IntelligenceService(identity, db.database, config);
    await expect(service.analyze('Bearer token', actor.schoolId, { baselineResultId: context.resultId }, 'request-key', 'request-id')).rejects.toMatchObject({ status: 403 });
    expect(db.writes()).toBe(0);
  });
  it('returns stored authorized replay without invoking generation', async () => {
    const db = store({ state: 'COMPLETED', response });
    const service = new IntelligenceService({ resolve: async () => actor } as unknown as IdentityService, db.database, config, { generate: async () => { throw Error('must not execute'); } });
    expect(await service.analyze('Bearer token', actor.schoolId, { baselineResultId: context.resultId }, 'request-key', 'request-id')).toEqual(response);
    expect(db.writes()).toBe(0);
  });
  it('does not execute a live provider merely because strings are configured', async () => {
    const db = store();
    const live = parseServerConfig({ AI_GENERATION_MODE: 'LIVE', AI_PROVIDER: 'approved', AI_MODEL: 'configured', AI_DATA_POLICY_STATUS: 'APPROVED', OPENAI_API_KEY: 'fixture-only' });
    const service = new IntelligenceService({ resolve: async () => actor } as unknown as IdentityService, db.database, live);
    await expect(service.analyze('Bearer token', actor.schoolId, { baselineResultId: context.resultId }, 'request-key', 'request-id')).rejects.toMatchObject({ code: 'INTELLIGENCE_UNAVAILABLE' });
  });
  it('persists a fixed failed attempt without private provider errors or a proposal', async () => {
    const db=store();
    const service=new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,db.database,config,{generate:async()=>{throw Error('secret raw prompt');}});
    await expect(service.analyze('Bearer token',actor.schoolId,{baselineResultId:context.resultId},'failure-key','request-id')).rejects.toMatchObject({code:'INTELLIGENCE_PROVIDER_FAILED'});
    expect(db.failure()).toBe('INTELLIGENCE_PROVIDER_FAILED');expect(db.writes()).toBe(0);
  });
  it('rejects a changed or revoked source during persistence rather than returning generated output',async()=>{
    const db=store(undefined,Object.assign(Error('private source denied'),{code:'42501'}));
    const service=new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,db.database,config,{generate:async()=>({output:generated,outputTokens:0,cost:0})});
    await expect(service.analyze('Bearer token',actor.schoolId,{baselineResultId:context.resultId},'source-key','request-id')).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(db.writes()).toBe(0);
  });
  it('reconciles an active durable attempt without calling the provider again',async()=>{
    const db=store({state:'IN_PROGRESS',runId:response.intelligenceRunId});
    const service=new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,db.database,config,{generate:async()=>{throw Error('must not execute');}});
    await expect(service.analyze('Bearer token',actor.schoolId,{baselineResultId:context.resultId},'source-key','request-id')).rejects.toMatchObject({code:'COMMAND_IN_PROGRESS'});
    expect(db.writes()).toBe(0);
  });
  it('keeps the original command uncertain when successful proposal COMMIT receipt is lost',async()=>{
    const db=store(undefined,undefined,'COMPLETE');
    const service=new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,db.database,config,{generate:async()=>({output:generated,outputTokens:0,cost:0})});
    await expect(service.analyze('Bearer token',actor.schoolId,{baselineResultId:context.resultId},'commit-key','request-id')).rejects.toMatchObject({code:'INTELLIGENCE_OUTCOME_UNKNOWN'});
    expect(db.writes()).toBe(1);expect(db.failure()).toBeUndefined();
  });
  it('does not declare a terminal provider failure without a committed failure receipt',async()=>{
    const db=store(undefined,undefined,'FAIL');
    const service=new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,db.database,config,{generate:async()=>{throw Error('private provider failure');}});
    await expect(service.analyze('Bearer token',actor.schoolId,{baselineResultId:context.resultId},'fail-key','request-id')).rejects.toMatchObject({code:'INTELLIGENCE_OUTCOME_UNKNOWN'});
    expect(db.writes()).toBe(0);
  });
  it('reconciles start COMMIT receipt loss instead of retrying generation under another key',async()=>{
    const db=store(undefined,undefined,'START');
    const service=new IntelligenceService({resolve:async()=>actor}as unknown as IdentityService,db.database,config,{generate:async()=>{throw Error('must not execute');}});
    await expect(service.analyze('Bearer token',actor.schoolId,{baselineResultId:context.resultId},'start-key','request-id')).rejects.toMatchObject({code:'INTELLIGENCE_OUTCOME_UNKNOWN'});
    expect(db.writes()).toBe(0);
  });
});
