import type {Pool} from 'pg';
import type{DeliveryMetric}from'../../platform/telemetry';
export class OutboxProcessor{
 private running=false;
 constructor(private readonly pool:Pool,private readonly metric?:(value:DeliveryMetric)=>void){}
 async tick(){
  if(this.running)return;this.running=true;
  try{
   const events=(await this.pool.query<{id:string;lease_token:string}>('select id,lease_token from internal.claim_outbox($1,$2)',[10,30])).rows;
   for(const event of events){
    const start=performance.now();let outcome:DeliveryMetric['outcome']='COMPLETED';
    try{await this.pool.query('select internal.process_learner_event($1,$2)',[event.id,event.lease_token]);}
    catch{outcome='REQUIRES_REVIEW';try{const result=await this.pool.query('select internal.fail_outbox($1,$2,$3,$4)as acknowledged',[event.id,event.lease_token,'PROCESSING_REQUIRES_REVIEW',30]);if(result.rows[0]?.acknowledged!==true)outcome='FAILURE_RECEIPT_UNKNOWN';}catch{outcome='FAILURE_RECEIPT_UNKNOWN';}}
    try{this.metric?.({outcome,durationMs:performance.now()-start});}catch{/* Metrics do not change lease/source authority. */}
   }
  }finally{this.running=false;}
 }
}
