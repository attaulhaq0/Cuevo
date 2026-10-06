import type {Database} from '../../src/platform/database/database';
import {checkedQueryFailure,scaleDiagnosticClient,scaleSqlStage,type ScaleQueryFailure,type ScaleSqlStage} from './scale-query-diagnostics';

/** The explicitly observed fixture measurement keeps private SQL and bindings out of evidence. */
export function measureSqlStage(sql: unknown): ScaleSqlStage {
  if(typeof sql !== 'string') return 'UNKNOWN';
  if(sql === 'select "authorization".can_access_intervention($1,$2,true)as allowed') return 'IMPROVEMENT_AUTHORIZATION';
  if(sql === 'select pg_advisory_xact_lock(hashtextextended($1,0))') return 'MEASURE_LOCK';
  if(sql === 'select internal.measure_intervention($1,$2,$3)as id') return 'MEASURE_NATIVE';
  if(sql.startsWith('select o.id,internal.intervention_outcome_projection(o.id)as source,') && sql.endsWith('from app.outcome_measurements o where o.id=$1')) return 'MEASURE_PROJECTION';
  if(sql === 'select internal.improvement_event_exists($1)as existing') return 'OUTBOX_LOOKUP';
  return scaleSqlStage(sql);
}

export function measureFailureRecord(failure: ScaleQueryFailure) {
  return {code:'IMPROVEMENT_MEASURE_QUERY_FAILED' as const,...checkedQueryFailure(failure)};
}

/** The sequential fixture explicitly enables observation until its one injected measurement request settles. */
export function measureDiagnosticDatabase(database: Database, observe: (failure: ScaleQueryFailure) => void) {
  let active = false;
  const decorated = new Proxy(database,{get(target,key,receiver){
    if(key !== 'actorTransaction') return Reflect.get(target,key,receiver);
    const transaction = target.actorTransaction;
    return (actor: string,school: string | undefined,run: Parameters<Database['actorTransaction']>[2]) => transaction.call(target,actor,school,client=>run(active ? scaleDiagnosticClient(client,observe,measureSqlStage) : client));
  }});
  return {database:decorated,run:async<T>(operation:()=>Promise<T>)=>{if(active)throw Error('One diagnostic measurement request may run at a time.');active=true;try{return await operation();}finally{active=false;}}};
}
