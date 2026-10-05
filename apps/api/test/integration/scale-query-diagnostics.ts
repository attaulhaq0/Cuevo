export const scaleSqlStages = ['IDENTITY', 'ACADEMIC_AUTHORIZATION', 'RELEASE_COURSE', 'CURRICULUM_WRITE', 'IDEMPOTENCY_BEGIN', 'RELEASE_LOCK', 'RELEASE_EXISTING', 'RELEASE_KIND', 'RELEASE_NATIVE', 'RELEASE_PROJECTION', 'IMPROVEMENT_AUTHORIZATION', 'MEASURE_LOCK', 'MEASURE_NATIVE', 'MEASURE_PROJECTION', 'OUTBOX_LOOKUP', 'AUDIT', 'OUTBOX', 'IDEMPOTENCY_FINISH', 'UNKNOWN'] as const;
export type ScaleSqlStage = typeof scaleSqlStages[number];
const sqlStates = ['57014', '40P01', '40001', '55P03', '42501', '22023', '23502', '23503', '23505', '23514', '55000'] as const;
export type ScaleQueryFailure = { stage: ScaleSqlStage; sqlState: typeof sqlStates[number] | null; durationMs: number | null };

/** Test-only fixed classifications. SQL and bindings never enter a record. */
export function scaleSqlStage(value: unknown): ScaleSqlStage {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (value.startsWith('select *from "authorization".current_memberships()') || value.startsWith('select "authorization".is_current_session(')) return 'IDENTITY';
  if (value.startsWith('select "authorization".academic_access($1)and(')) return 'ACADEMIC_AUTHORIZATION';
  if (value.startsWith('select course_id as id from app.assessments where school_id=$1 and id=(select assessment_id from app.submissions')) return 'RELEASE_COURSE';
  if (value === 'select internal.require_curriculum_academic_write($1)') return 'CURRICULUM_WRITE';
  if (value === 'select internal.begin_command($1,$2,$3)as reservation') return 'IDEMPOTENCY_BEGIN';
  if (value === 'select pg_advisory_xact_lock(hashtextextended($1,0))') return 'RELEASE_LOCK';
  if (value.startsWith('select *from(select r.id,r.submission_id') && value.endsWith(')existing_native_result')) return 'RELEASE_EXISTING';
  if (value === "select 'numeric'as model from app.marking_revisions where id=$1 union all select 'rubric'as model from app.rubric_marking_revisions where id=$1") return 'RELEASE_KIND';
  if (value === 'select internal.release_marking($1,$2,$3)as id' || value === 'select internal.release_rubric_marking($1,$2,$3)as id') return 'RELEASE_NATIVE';
  if (value.startsWith('select r.id,r.submission_id') && value.endsWith(' where r.id=$1')) return 'RELEASE_PROJECTION';
  if (value === 'select internal.append_audit($1,$2,$3,$4,$5,$6::jsonb)') return 'AUDIT';
  if (value === 'select internal.enqueue_event($1,$2,$3,$4,$5::jsonb,$6)') return 'OUTBOX';
  if (value === 'select internal.finish_command($1,$2,$3,$4::jsonb)') return 'IDEMPOTENCY_FINISH';
  return 'UNKNOWN';
}

export function scaleSqlState(error: unknown): ScaleQueryFailure['sqlState'] {
  try {
    if (!error || typeof error !== 'object') return null;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : null;
    return typeof value === 'string' && sqlStates.includes(value as typeof sqlStates[number]) ? value as typeof sqlStates[number] : null;
  } catch { return null; }
}

const duration = (start: number | null, end: number) => start !== null && Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.min(180000, Math.round(end - start)) : null;

/** Promise-based fixture statements execute once and always retain the original rejection. */
export async function observeScaleQuery<T>(sql: unknown, run: () => Promise<T>, observe: (failure: ScaleQueryFailure) => void, now = () => performance.now(), classify = scaleSqlStage): Promise<T> {
  let start: number | null = null; try { start = now(); } catch { /* Clock failure cannot affect SQL. */ }
  try { return await run(); }
  catch (error) {
    try { observe({ stage: classify(sql), sqlState: scaleSqlState(error), durationMs: duration(start, now()) }); } catch { /* Diagnostic failure cannot replace the driver error. */ }
    throw error;
  }
}

/** Only the rollback fixture opts in; the production database and other contexts keep the original client. */
export function scaleDiagnosticClient<T extends object>(client: T, observe?: (failure: ScaleQueryFailure) => void, classify = scaleSqlStage): T {
  if (!observe) return client;
  return new Proxy(client, { get(target, key, receiver) {
    if (key !== 'query') return Reflect.get(target, key, receiver);
    const query: unknown = Reflect.get(target, key);
    if (typeof query !== 'function') return query;
    return (...args: unknown[]) => observeScaleQuery(args[0], () => Reflect.apply(query, target, args) as Promise<unknown>, observe, undefined, classify);
  } });
}

export const scaleSetupOperations = ['assessment.create', 'assessment.reference', 'submission.create', 'assessment.marked', 'result.released'] as const;
export function checkedQueryFailure(query: ScaleQueryFailure) {
  const invalid=():never=>{throw Error('Fixed scale query diagnostic fields required.');};
  try {
    if(!query||typeof query!=='object'||Array.isArray(query))return invalid();
    const fields=Object.getOwnPropertyDescriptors(query);
    if(Object.keys(fields).sort().join('|')!=='durationMs|sqlState|stage'||Object.values(fields).some(field=>!('value'in field)))return invalid();
    const stage:unknown=fields.stage.value,sqlState:unknown=fields.sqlState.value,durationMs:unknown=fields.durationMs.value;
    if(typeof stage!=='string'||!scaleSqlStages.includes(stage as ScaleSqlStage)||!(sqlState===null||typeof sqlState==='string'&&sqlStates.includes(sqlState as typeof sqlStates[number]))||!(durationMs===null||typeof durationMs==='number'&&Number.isInteger(durationMs)&&durationMs>=0&&durationMs<=180000))return invalid();
    return{stage:stage as ScaleSqlStage,sqlState:sqlState as ScaleQueryFailure['sqlState'],durationMs};
  } catch { return invalid(); }
}
export function scaleSetupFailure(sourceIndex: number, releasedSources: number, operation: string, query: ScaleQueryFailure | null) {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex > 99 || !Number.isInteger(releasedSources) || releasedSources < 0 || releasedSources > 100 || !scaleSetupOperations.includes(operation as typeof scaleSetupOperations[number])) throw Error('Fixed scale setup diagnostic identity required.');
  return { code: 'SCALE_SETUP_FAILURE' as const, phase: 'REAL_API_RELEASE' as const, sourceIndex, releasedSources, operation, query: query===null ? null : checkedQueryFailure(query) };
}
