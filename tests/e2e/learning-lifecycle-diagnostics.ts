import { submissionWorkSourceSchema } from '@cuevo/contracts';

type SourceStatus='SUBMITTED'|'RESUBMITTED'|'RETURNED'|'CLOSED'|'UNKNOWN';
type ReadCategory='MEMBERSHIP'|'SUBMISSION_QUEUE'|'SELECTED_SOURCE_WORK';
type Read={httpStatus:number|null;schemaValid:boolean|null;selectedPresent:boolean|null;revisionMatchesExpected:boolean|null;sourceStatus:SourceStatus;pageCount:number|null;continued:boolean|null};
export type LifecycleDiagnosticDom={readerCount:number|null;selectedCount:number|null;selectedIdentityMatches:boolean|null;returnFormCount:number|null;feedbackCount:number|null};
const categories:ReadCategory[]=['MEMBERSHIP','SUBMISSION_QUEUE','SELECTED_SOURCE_WORK'];
const unknownRead=():Read=>({httpStatus:null,schemaValid:null,selectedPresent:null,revisionMatchesExpected:null,sourceStatus:'UNKNOWN',pageCount:null,continued:null});
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const bounded=(value:unknown,max:number):value is number|null=>value===null||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
const nullableBool=(value:unknown)=>value===null||typeof value==='boolean';
/** Only the scalar queue fields used by this diagnostic are inspected. This
 * is not an application submission parser or an authorization verdict. */
const queueRecord=(value:unknown)=>{if(!object(value)||typeof value.id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.id)||typeof value.revision!=='number'||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.status!=='string'||!['SUBMITTED','RESUBMITTED','RETURNED','CLOSED'].includes(value.status))throw Error('Bounded queue observation required.');return{id:value.id,revision:value.revision,status:value.status};};

/** Failure metadata only. No record identity, response text or arbitrary error can enter stdout. */
export function validateLifecycleDiagnostic(value:unknown){
 if(!object(value)||!exact(value,['code','stage','reads','dom'])||value.code!=='RETURN_EDITOR_REVALIDATION_FAILED'||typeof value.stage!=='string'||!['BLANK_EDITOR','TYPED_EDITOR'].includes(value.stage)||!object(value.reads)||!exact(value.reads,categories)||!object(value.dom)||!exact(value.dom,['readerCount','selectedCount','selectedIdentityMatches','returnFormCount','feedbackCount']))throw Error('Bounded lifecycle diagnostic fields required.');
 for(const key of categories){const read=value.reads[key];if(!object(read)||!exact(read,['httpStatus','schemaValid','selectedPresent','revisionMatchesExpected','sourceStatus','pageCount','continued'])||!bounded(read.httpStatus,599)||read.httpStatus!==null&&Number(read.httpStatus)<100||!nullableBool(read.schemaValid)||!nullableBool(read.selectedPresent)||!nullableBool(read.revisionMatchesExpected)||typeof read.sourceStatus!=='string'||!['SUBMITTED','RESUBMITTED','RETURNED','CLOSED','UNKNOWN'].includes(read.sourceStatus)||!bounded(read.pageCount,100)||!nullableBool(read.continued))throw Error('Bounded lifecycle diagnostic reads required.');}
 const observedDom=value.dom;
 if(!['readerCount','selectedCount','returnFormCount','feedbackCount'].every(key=>bounded(observedDom[key],2))||!nullableBool(observedDom.selectedIdentityMatches))throw Error('Bounded lifecycle diagnostic DOM required.');
 const reads={}as Record<ReadCategory,Read>;for(const category of categories){const read=value.reads[category]as Read;reads[category]={httpStatus:read.httpStatus,schemaValid:read.schemaValid,selectedPresent:read.selectedPresent,revisionMatchesExpected:read.revisionMatchesExpected,sourceStatus:read.sourceStatus,pageCount:read.pageCount,continued:read.continued};}
 const dom=value.dom as LifecycleDiagnosticDom;
 return{code:'RETURN_EDITOR_REVALIDATION_FAILED' as const,stage:value.stage as 'BLANK_EDITOR'|'TYPED_EDITOR',reads,dom:{readerCount:dom.readerCount,selectedCount:dom.selectedCount,selectedIdentityMatches:dom.selectedIdentityMatches,returnFormCount:dom.returnFormCount,feedbackCount:dom.feedbackCount}};
}
export function createLifecycleDiagnostics(targetId:string,expectedRevision:unknown){
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(targetId))throw Error('Exact known lifecycle target required.');
 const revision=typeof expectedRevision==='number'&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0?expectedRevision:null;
 let reads:Record<ReadCategory,Read>={MEMBERSHIP:unknownRead(),SUBMISSION_QUEUE:unknownRead(),SELECTED_SOURCE_WORK:unknownRead()};
 return{
  reset(){reads={MEMBERSHIP:unknownRead(),SUBMISSION_QUEUE:unknownRead(),SELECTED_SOURCE_WORK:unknownRead()};},
  observeUnknown(category:ReadCategory,httpStatus:number){const read=unknownRead();read.httpStatus=Number.isSafeInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null;reads[category]=read;},
  observe(category:ReadCategory,httpStatus:number,payload:unknown){
   const read=unknownRead();read.httpStatus=Number.isSafeInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null;
   if(category==='MEMBERSHIP'){reads[category]=read;return;}
   if(category==='SUBMISSION_QUEUE'){
    try{if(!object(payload)||!Array.isArray(payload.items)||payload.items.length>100||!(payload.nextCursor===null||typeof payload.nextCursor==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(payload.nextCursor)))throw Error('invalid');const items=payload.items.map(queueRecord),selected=items.filter(item=>item.id===targetId);if(selected.length>1)throw Error('invalid');read.schemaValid=true;read.pageCount=items.length;read.continued=payload.nextCursor!==null;read.selectedPresent=selected.length===1;if(selected[0]){read.revisionMatchesExpected=revision===null?null:selected[0].revision===revision;read.sourceStatus=selected[0].status as SourceStatus;}}catch{read.schemaValid=false;}
   }else{const parsed=submissionWorkSourceSchema.safeParse(payload);read.schemaValid=parsed.success;if(parsed.success){read.selectedPresent=parsed.data.submissionId===targetId;read.revisionMatchesExpected=revision===null?null:parsed.data.revision===revision;}}
   reads[category]=read;
  },
  summary(stage:'BLANK_EDITOR'|'TYPED_EDITOR',dom:LifecycleDiagnosticDom){return validateLifecycleDiagnostic({code:'RETURN_EDITOR_REVALIDATION_FAILED',stage,reads:structuredClone(reads),dom});},
 };
}
