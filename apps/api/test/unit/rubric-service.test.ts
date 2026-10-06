import { describe, expect, it } from 'vitest';
import { AcademicService } from '../../src/modules/academic/academic.service';
import type { Database } from '../../src/platform/database/database';
import type { ActorContext } from '@cuevo/domain';

const actor: ActorContext = { userId: '20000000-0000-4000-8000-000000000004', schoolId: '10000000-0000-4000-8000-000000000001', role: 'teacher', membershipId: '21000000-0000-4000-8000-000000000004', entitlements: ['assessment', 'curriculum'] };
const submissionId = '75200000-0000-4000-8000-000000000001';
const rubricId = '76000000-0000-4000-8000-000000000001';
const markId = '76100000-0000-4000-8000-000000000001';
const nativeResult = { type: 'rubric', rubricId, rubricTitle: 'Explanation', rubricVersion: 'school-1', policyVersion: 2, normalized: null, criteria: [{ criterionKey: 'explanation', criterionTitle: 'Explanation', levelKey: 'developing', levelLabel: 'Developing', levelDescription: 'Explain a step.' }] };
const mark = { id: markId, submissionId, learnerId: '20000000-0000-4000-8000-000000000012', revision: 1, model: 'rubric', nativeResult, feedback: 'Teacher reviewed work.', status: 'REVIEW', policyVersion: 2, referenceId: '61000000-0000-4000-8000-000000000001' };
const body = { nativeResult: { type: 'rubric', rubricId, criteria: [{ criterionKey: 'explanation', levelKey: 'developing' }] }, feedback: 'Teacher reviewed work.', expectedPolicyVersion: 2, expectedRevision: 0, sourceEvidence: true };

function database(query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) {
  return { actorTransaction: async (_actor: string, _school: string, run: (client: unknown) => Promise<unknown>) => run({ query }) } as unknown as Database;
}

describe('native rubric academic commands', () => {
  it('routes complete native choices through the rubric source command and canonical rubric event', async () => {
    const calls: { sql: string; values?: unknown[] }[] = [];
    const db = database(async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('as allowed')) return { rows: [{ allowed: true }] };
      if (sql.includes('as approved')) return { rows: [{ approved: true }] };
      if(sql.startsWith('select assessment.course_id as id')||sql.startsWith('select course_id as id from app.assessments'))return{rows:[{id:'75000000-0000-4000-8000-000000000001'}]};
      if (sql.includes('begin_command')) return { rows: [{ reservation: { state: 'NEW' } }] };
      if (sql.includes('mark_rubric_submission')) return { rows: [{ id: markId }] };
      if (sql.includes('rubric_marking_revisions')) return { rows: [mark] };
      return { rows: [{}] };
    });
    const result = await new AcademicService(db).command(actor, 'marking.create', submissionId, body, 'rubric-mark-key', 'request');
    expect(result).toMatchObject({ model: 'rubric', nativeResult, status: 'REVIEW' });
    const write = calls.find(call => call.sql.includes('mark_rubric_submission'))!;
    expect(write.values).toEqual([submissionId, rubricId, '[{"criterionKey":"explanation","levelKey":"developing"}]', 'Teacher reviewed work.', 2, 0, true]);
    expect(calls.find(call => call.sql.includes('enqueue_event'))?.values?.[0]).toBe('rubric.assessment.marked');
  });

  it('denies revoked object scope before delivering a completed rubric command receipt', async () => {
    const calls: string[] = [];
    const db = database(async sql => { calls.push(sql); return { rows: sql.includes('as allowed') ? [{ allowed: false }] : [{ reservation: { state: 'COMPLETED', response: mark } }] }; });
    await expect(new AcademicService(db).command(actor, 'marking.create', submissionId, body, 'rubric-mark-key', 'request')).rejects.toMatchObject({ status: 403 });
    expect(calls.some(sql => sql.includes('begin_command'))).toBe(false);
  });

  it('requires the current submission to remain open before returning an academic command receipt',async()=>{
    let queriedCurrent=false;
    const db=database(async sql=>{if(sql.includes('as allowed')){queriedCurrent=sql.includes('current_submission_open');return{rows:[{allowed:!queriedCurrent}]};}if(sql.includes('as approved'))return{rows:[{approved:true}]};return{rows:[{reservation:{state:'COMPLETED',response:mark}}]};});
    await expect(new AcademicService(db).command(actor,'marking.create',submissionId,body,'returned-mark-key','request')).rejects.toMatchObject({status:403});
    expect(queriedCurrent).toBe(true);
  });

  it('does not allow a parent to author or mark a rubric', async () => {
    const db = database(async () => ({ rows: [{}] }));
    await expect(new AcademicService(db).command({ ...actor, role: 'parent' }, 'marking.create', submissionId, body, 'rubric-mark-key', 'request')).rejects.toMatchObject({ status: 403 });
  });

  it('returns the same native rubric release with a new key without another source event', async () => {
    const released = { ...mark, id: '76200000-0000-4000-8000-000000000001', status: 'RELEASED', parentVisible: false, evidenceId: '76300000-0000-4000-8000-000000000001', score: null, maxScore: null };
    const calls: string[] = [];
    const db = database(async sql => {
      calls.push(sql);
      if (sql.includes('as allowed')) return { rows: [{ allowed: true }] };
      if(sql.startsWith('select assessment.course_id as id')||sql.startsWith('select course_id as id from app.assessments'))return{rows:[{id:'75000000-0000-4000-8000-000000000001'}]};
      if (sql.includes('begin_command')) return { rows: [{ reservation: { state: 'NEW' } }] };
      if (sql.includes('existing_native_result')) return { rows: [released] };
      return { rows: [{}] };
    });
    const result = await new AcademicService(db).command(actor, 'result.release', markId, { expectedRevision: 1, parentVisible: false }, 'rubric-release-key', 'request');
    expect(result).toMatchObject({ model: 'rubric', nativeResult, status: 'RELEASED' });
    expect(result).not.toHaveProperty('score'); expect(result).not.toHaveProperty('maxScore');
    expect(calls.some(sql => sql.includes('enqueue_event'))).toBe(false);
  });
});
