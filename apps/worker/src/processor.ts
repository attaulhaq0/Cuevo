import type {Pool} from 'pg';
export class OutboxProcessor{
 private running=false;
 constructor(private readonly pool:Pool){}
 async tick(){
  if(this.running)return;this.running=true;
  try{
   const events=(await this.pool.query<{id:string;lease_token:string}>('select id,lease_token from internal.claim_outbox($1,$2)',[10,30])).rows;
   for(const event of events){
    try{await this.pool.query('select internal.process_learner_event($1,$2)',[event.id,event.lease_token]);}
    catch{await this.pool.query('select internal.fail_outbox($1,$2,$3,$4)',[event.id,event.lease_token,'PROCESSING_REQUIRES_REVIEW',30]).catch(()=>undefined);}
   }
  }finally{this.running=false;}
 }
}
