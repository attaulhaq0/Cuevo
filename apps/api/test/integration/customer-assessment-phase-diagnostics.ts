import { z } from 'zod';
import { scaleSqlStages, scaleSqlState, type ScaleQueryFailure } from './scale-query-diagnostics';

const phases=['ENROLLMENT_REVOKE','REVOKED_PAGE','ENROLLMENT_RESTORE','RESTORED_PAGE','PROGRAMME_SETUP','PROGRAMME_REVOKE','PROGRAMME_DENIED_PAGE','PROGRAMME_RESTORE','PROGRAMME_RESTORED_PAGE'] as const;
type Phase=typeof phases[number];
const elapsed=z.number().int().min(0).max(180000).nullable();
const queryFailure=z.object({stage:z.enum(scaleSqlStages),sqlState:z.enum(['57014','40P01','40001','55P03','42501','22023','23502','23503','23505','23514','55000']).nullable(),durationMs:elapsed}).strict();
const phaseRecord=z.object({phase:z.enum(phases),status:z.enum(['RUNNING','COMPLETED','REJECTED']),elapsedMs:elapsed,httpResponses:z.number().int().min(0).max(1000),lastHttpStatus:z.number().int().min(100).max(599).nullable(),queryFailure:queryFailure.nullable()}).strict();
const failureRecord=z.object({schemaVersion:z.literal('1'),code:z.literal('CUSTOMER_ASSESSMENT_REVOCATION_UNVERIFIED'),budgetMs:z.literal(30000),elapsedMs:elapsed,phases:z.array(phaseRecord).max(9),truncated:z.boolean()}).strict();
type PhaseRecord=z.infer<typeof phaseRecord>;

/** Reject accessors and serialization hooks before schema parsing; never read diagnostic input properties. */
function plainData(value:unknown,depth=0):boolean {
  if(value===null||typeof value!=='object')return typeof value!=='function';
  if(depth>8)return false;
  try {
    const array=Array.isArray(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))return false;
    const fields=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(fields).some(key=>typeof key!=='string'))return false;
    const keys=Object.keys(fields);if(keys.length>20)return false;
    return keys.every(key=>{const field=fields[key];return 'value'in field&&key!=='toJSON'&&(!array||key==='length'||/^\d+$/.test(key))&&plainData(field.value,depth+1);});
  } catch {return false;}
}
/** Only this strict fixed record may enter the integration log. */
export function serializeCustomerAssessmentFailure(value:unknown):string {
  if(!plainData(value))throw Error('Fixed customer assessment diagnostic fields required.');
  const parsed=failureRecord.safeParse(value);if(!parsed.success)throw Error('Fixed customer assessment diagnostic fields required.');return JSON.stringify(parsed.data);
}

/** Test-only observations do not alter the request, fixture deadline, SQL or rejection. */
export class CustomerAssessmentPhaseDiagnostics {
  private readonly started:number|null;
  private readonly records:PhaseRecord[]=[];
  private active:{record:PhaseRecord;started:number|null}|undefined;
  private failed=false;
  private emitted=false;
  private truncated=false;
  constructor(private readonly now:()=>number=()=>performance.now()){this.started=this.time();}
  private time():number|null{try{const value=this.now();return Number.isFinite(value)?value:null;}catch{return null;}}
  private duration(start:number|null):number|null{const end=this.time();return start!==null&&end!==null&&end>=start?Math.min(180000,Math.round(end-start)):null;}
  async run<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(error){this.failed=true;throw error;}}
  async phase<T>(phase:Phase,work:()=>Promise<T>):Promise<T>{
    const record:PhaseRecord={phase,status:'RUNNING',elapsedMs:null,httpResponses:0,lastHttpStatus:null,queryFailure:null};
    const active={record,started:this.time()};this.active=active;
    if(this.records.length<9)this.records.push(record);else this.truncated=true;
    try{const result=await work();record.status='COMPLETED';return result;}
    catch(error){record.status='REJECTED';const sqlState=scaleSqlState(error);if(sqlState&&!record.queryFailure)record.queryFailure={stage:'UNKNOWN',sqlState,durationMs:this.duration(active.started)};throw error;}
    finally{record.elapsedMs=this.duration(active.started);if(this.active===active)this.active=undefined;}
  }
  httpStatus(value:unknown):void {
    if(!this.active||typeof value!=='number'||!Number.isInteger(value)||value<100||value>599)return;
    const record=this.active.record;if(record.httpResponses<1000)record.httpResponses++;else this.truncated=true;record.lastHttpStatus=value;
  }
  queryFailure(value:unknown):void {
    if(!this.active)return;
    try{if(!plainData(value))return;const parsed=queryFailure.safeParse(value);if(parsed.success)this.active.record.queryFailure=parsed.data as ScaleQueryFailure;}catch{/* Unavailable evidence cannot change SQL. */}
  }
  emitFailure(write:(value:string)=>void):void {
    if(!this.failed||this.emitted)return;this.emitted=true;
    try{write(serializeCustomerAssessmentFailure({schemaVersion:'1',code:'CUSTOMER_ASSESSMENT_REVOCATION_UNVERIFIED',budgetMs:30000,elapsedMs:this.duration(this.started),phases:this.records,truncated:this.truncated}));}catch{/* Evidence delivery preserves the original runner/body failure. */}
  }
}
