import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

const codes = { '28P01':'AUTHENTICATION_FAILED','3D000':'DATABASE_NOT_FOUND','42501':'PERMISSION_DENIED','42P01':'UNDEFINED_TABLE','42883':'UNDEFINED_FUNCTION','42710':'DUPLICATE_OBJECT','53300':'TOO_MANY_CONNECTIONS','57P03':'CANNOT_CONNECT_NOW','08001':'CONNECTION_FAILURE','08006':'CONNECTION_FAILURE','53200':'OUT_OF_MEMORY','53400':'CONFIGURATION_LIMIT_EXCEEDED','XX000':'INTERNAL_ERROR' } as const;
const phases = { 'Resetting local database...':'RESETTING_DATABASE','Recreating database...':'RECREATING_DATABASE','Initialising schema...':'INITIALIZING_SCHEMA','Seeding globals from roles.sql...':'SEEDING_GLOBALS','Restarting containers...':'RESTARTING_CONTAINERS' } as const;
type Phase = 'UNKNOWN' | typeof phases[keyof typeof phases];
type Observation = { code: keyof typeof codes | 'UNRECOGNIZED'; label: typeof codes[keyof typeof codes] | 'UNRECOGNIZED_SQLSTATE_PRESENT'; format: 'SQLSTATE_SUFFIX'|'SQLSTATE_LINE'|'POSTGREX_ERROR'; phase:'INITIALIZING_SCHEMA' };
export type ResetDiagnostic = { phase:Phase;cause:'UNKNOWN';observedCodes:Observation[];capture:{stderrObserved:boolean;lineTruncated:boolean;diagnosticTruncated:boolean;invalidUtf8:boolean;incompleteLine:boolean;terminalExitMatched:boolean} };

/** Consume untrusted debug output into a finite vocabulary. Raw bytes are never returned. */
export function createResetDiagnosticParser() {
 let phase:Phase='UNKNOWN',line=Buffer.alloc(0),discarding=false,finished=false,terminalExit:number|null=null;
 const observedCodes:Observation[]=[],capture={stderrObserved:false,lineTruncated:false,diagnosticTruncated:false,invalidUtf8:false,incompleteLine:false,terminalExitMatched:false};
 function consume() {
  if(discarding){discarding=false;line=Buffer.alloc(0);return;}
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(line).replace(/\r$/,'').replace(new RegExp(String.fromCharCode(27)+'\\[[0-?]*[ -/]*[@-~]','g'),'');}catch{capture.invalidUtf8=true;line=Buffer.alloc(0);return;}line=Buffer.alloc(0);
  if(Object.hasOwn(phases,text)){phase=phases[text as keyof typeof phases];return;}
  const exit=/^error running container: exit ([0-9]{1,3})$/.exec(text);if(exit){const value=Number(exit[1]);terminalExit=value<=255?value:null;return;}
  if(phase!=='INITIALIZING_SCHEMA')return;
  let code:string|undefined,format:Observation['format']='SQLSTATE_LINE';
  const plain=/^SQLSTATE: ([A-Z0-9]{5})$/.exec(text),suffix=/^ERROR: [^\r\n]* \(SQLSTATE ([A-Z0-9]{5})\)$/.exec(text),postgrex=/^\*\* \(Postgrex\.Error\) ERROR ([A-Z0-9]{5}) \([a-z_]+\)(?: [^\r\n]*)?$/.exec(text);
  if(plain)code=plain[1];else if(suffix){code=suffix[1];format='SQLSTATE_SUFFIX';}else if(postgrex){code=postgrex[1];format='POSTGREX_ERROR';}else return;
  const known=Object.hasOwn(codes,code),safeCode=known?code as keyof typeof codes:'UNRECOGNIZED';
  if(observedCodes.some(row=>row.code===safeCode))return;
  if(observedCodes.length===4){capture.diagnosticTruncated=true;return;}
  observedCodes.push({code:safeCode,label:known?codes[code as keyof typeof codes]:'UNRECOGNIZED_SQLSTATE_PRESENT',format,phase:'INITIALIZING_SCHEMA'});
 }
 return {
  push(chunk:Buffer){if(finished)return;capture.stderrObserved ||= chunk.length>0;let start=0;
   while(start<chunk.length){const newline=chunk.indexOf(10,start),end=newline<0?chunk.length:newline;
    if(!discarding){const part=chunk.subarray(start,end);if(line.length+part.length>8192){capture.lineTruncated=true;line=Buffer.alloc(0);discarding=true;}else if(part.length)line=Buffer.concat([line,part]);}
    if(newline<0)break;consume();start=newline+1;
   }
  },
  unavailable(){capture.diagnosticTruncated=true;},
  finish(exitCode:number|null):ResetDiagnostic{if(!finished){finished=true;if(line.length||discarding){capture.incompleteLine=true;line=Buffer.alloc(0);}capture.terminalExitMatched=terminalExit!==null&&terminalExit===exitCode;}
   return{phase,cause:'UNKNOWN',observedCodes:observedCodes.map(row=>({...row})),capture:{...capture}};
  }
 };
}
export type PrefixResetFailure = ResetDiagnostic & {exitCode:number|null;signal:'SIGINT'|'SIGTERM'|'SIGKILL'|'OTHER'|null};
type ResetPorts = {spawn(command:string,args:string[],options:SpawnOptions):ChildProcess;write(value:PrefixResetFailure):Promise<void>};
function failure(exitCode:number|null,signal:PrefixResetFailure['signal']) {
 return Object.assign(new Error('Cuevo local prefix reset failed; minimized diagnostics may be available.'),{exitCode,signal});
}
/** One original CLI invocation, in its parent's owned process group. No output limit kills it. */
export async function runPrefixResetCommand(command:string,args:string[],ports:ResetPorts={spawn,write:async()=>{}}):Promise<void> {
 const parser=createResetDiagnosticParser();let child:ChildProcess;
 try{child=ports.spawn(command,[...args,'--debug'],{stdio:['ignore','pipe','pipe'],detached:false,windowsHide:true});}catch{throw failure(null,null);}
 const outcome=await new Promise<{code:number|null;signal:PrefixResetFailure['signal']}>(done=>{
  let spawnFailed=false;
  const stdout=()=>{},stderr=(chunk:Buffer)=>{try{parser.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));}catch{parser.unavailable();}},streamError=()=>{parser.unavailable();},error=()=>{spawnFailed=true;};
  const close=(code:number|null,signal:NodeJS.Signals|null)=>{child.stdout?.removeListener('data',stdout);child.stderr?.removeListener('data',stderr);child.stdout?.removeListener('error',streamError);child.stderr?.removeListener('error',streamError);child.removeListener('error',error);child.removeListener('close',close);done({code:spawnFailed?null:code,signal:signal===null?null:['SIGINT','SIGTERM','SIGKILL'].includes(signal)?signal as PrefixResetFailure['signal']:'OTHER'});};
  child.stdout?.on('data',stdout);child.stderr?.on('data',stderr);child.stdout?.on('error',streamError);child.stderr?.on('error',streamError);child.on('error',error);child.once('close',close);
 });
 if(outcome.code===0&&outcome.signal===null){parser.finish(0);return;}
 const diagnostic:PrefixResetFailure={...parser.finish(outcome.code),exitCode:outcome.code,signal:outcome.signal};
 try{await ports.write(diagnostic);}catch{/* Diagnostics never replace the original CLI failure. */}
 throw failure(outcome.code,outcome.signal);
}
