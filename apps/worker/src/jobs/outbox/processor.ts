import type { WorkerQueryPort, WorkerRow } from '../../platform/query-port';
import type{DeliveryMetric}from'../../platform/telemetry';
import { processingReceiptOutcome } from './processing-receipt';
export type BoundedProcessSummary = { processed: number; attempted: number; deferred: number; reviewRequired: boolean; failureReceiptUnknown: boolean; processingReceiptUnknown: boolean; deadlineReached: boolean; executionUnavailable: boolean };
export class OutboxProcessor{
 private running=false;
 constructor(private readonly pool:WorkerQueryPort,private readonly metric?:(value:DeliveryMetric)=>void,private readonly generation:string|null=null){}
 private claim(batch:number){return this.generation===null?this.pool.query('select id,lease_token from internal.claim_outbox($1,$2)',[batch,30]):this.pool.query('select id,lease_token from internal.claim_outbox($1,$2,$3)',[batch,30,this.generation]);}
 async tick(){
  if(this.running)return;this.running=true;
  try{
   const events=(await this.claim(10)).rows;
   for(const event of events){
    const start=performance.now();let outcome:DeliveryMetric['outcome']='PROCESSING_RECEIPT_UNKNOWN';
    try{const result=await this.pool.query('select internal.process_learner_event($1,$2)',[event.id,event.lease_token]);outcome=processingReceiptOutcome(result);}
    catch{outcome='REQUIRES_REVIEW';try{const result=await this.pool.query('select internal.fail_outbox($1,$2,$3,$4)as acknowledged',[event.id,event.lease_token,'PROCESSING_REQUIRES_REVIEW',30]);if(result.rows[0]?.acknowledged!==true)outcome='FAILURE_RECEIPT_UNKNOWN';}catch{outcome='FAILURE_RECEIPT_UNKNOWN';}}
    try{this.metric?.({outcome,durationMs:performance.now()-start});}catch{/* Metrics do not change lease/source authority. */}
    // The SQL transaction may have committed. Leave this event and the claimed tail to existing lease/source recovery.
    if(outcome==='PROCESSING_RECEIPT_UNKNOWN')break;
   }
  }finally{this.running=false;}
 }
 async process({ maxEvents, deadline, now = Date.now }: { maxEvents: number; deadline: number; now?: () => number }) {
  const summary: BoundedProcessSummary = { processed: 0, attempted: 0, deferred:0, reviewRequired: false, failureReceiptUnknown: false, processingReceiptUnknown: false, deadlineReached: false, executionUnavailable: false };
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 10 || !Number.isFinite(deadline)) throw new Error('Bounded worker execution limits required.');
  if (this.running) return { ...summary, reviewRequired: true };
  this.running = true;
  try {
   while (summary.attempted < maxEvents) {
    // Claim, processing and failure receipt each retain the five-second SQL budget.
    if (deadline - now() < 15_000) { summary.deadlineReached = true; break; }
    let rows: WorkerRow[];
    try { rows = (await this.claim(1)).rows; }
    catch { summary.executionUnavailable = true; summary.reviewRequired = true; break; }
    if (!rows.length) break;
    if (rows.length !== 1) { summary.executionUnavailable = true; summary.reviewRequired = true; break; }
    const event: WorkerRow = rows[0];
    if (typeof event.id !== 'string' || !event.id || typeof event.lease_token !== 'string' || !event.lease_token) { summary.executionUnavailable = true; summary.reviewRequired = true; break; }
    summary.attempted++;
    const started = now(); let outcome: DeliveryMetric['outcome'] = 'PROCESSING_RECEIPT_UNKNOWN';
    try {
     const result=await this.pool.query('select internal.process_learner_event($1,$2)', [event.id, event.lease_token]);
     outcome=processingReceiptOutcome(result);
     if(outcome==='WAITING')summary.deferred++;
     else if(outcome==='REQUIRES_REVIEW')summary.reviewRequired=true;
     else if(outcome==='COMPLETED')summary.processed++;
     else{summary.processingReceiptUnknown=true;summary.reviewRequired=true;}
    }
    catch {
     summary.reviewRequired = true; outcome = 'REQUIRES_REVIEW';
     try {
      const result = await this.pool.query('select internal.fail_outbox($1,$2,$3,$4)as acknowledged', [event.id, event.lease_token, 'PROCESSING_REQUIRES_REVIEW', 30]);
      if (result.rows[0]?.acknowledged !== true) { summary.failureReceiptUnknown = true; outcome = 'FAILURE_RECEIPT_UNKNOWN'; }
     } catch { summary.failureReceiptUnknown = true; outcome = 'FAILURE_RECEIPT_UNKNOWN'; }
    }
    try { this.metric?.({ outcome, durationMs: Math.max(0, now() - started) }); } catch { /* Telemetry never changes source processing. */ }
    if(summary.processingReceiptUnknown)break;
   }
   return summary;
  } finally { this.running = false; }
 }
}
