import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import type { MigrationSource, HostedMigrationPlanV1 } from './hosted-migration-plan';

const failure=()=>new Error('Native migration history source coverage requires review; contents withheld.');
const version=z.string().regex(/^\d{14}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),filename=z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/);
const rowSchema=z.object({version,name:z.string().min(1).max(200),statements:z.array(z.string().min(1).max(2*1024*1024)).max(20000)}).strict();
const includedSchema=z.object({name:filename,version,sha256:digest}).strict();
const inputSchema=z.object({sources:z.array(z.object({name:filename,bytes:z.instanceof(Uint8Array)}).strict()).max(1000),included:z.array(includedSchema).max(1000),expectedVersions:z.array(version).max(1000),history:z.array(rowSchema).max(1000).nullable()}).strict();
export type HostedMigrationHistoryReceipt={evidence:'SOURCE_TEXT_COVERAGE';historyPresence:'ABSENT'|'PRESENT';history:{version:string;sourceReceiptSha256:string}[]};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function snapshot(value:unknown,depth=0):unknown{
 if(depth>8)throw failure();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value))throw failure();
 if(types.isUint8Array(value)){const bytes=Uint8Array.prototype.slice.call(value) as Uint8Array;if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)))throw failure();return bytes;}
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 if(Array.isArray(value)){const field=Object.getOwnPropertyDescriptor(value,'length');if(!field||!('value'in field)||!Number.isSafeInteger(field.value)||field.value>20000||Reflect.ownKeys(value).length!==field.value+1)throw failure();for(let index=0;index<field.value;index++)if(!Object.hasOwn(value,String(index)))throw failure();}
 const copy:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();Object.defineProperty(copy,key,{value:snapshot(field.value,depth+1),enumerable:true});}return copy;
}
function covered(source:string,statements:readonly string[]){
 let cursor=0;const skip=()=>{while(cursor<source.length&&(/\s/u.test(source[cursor])||source[cursor]===';'))cursor++;};
 for(const statement of statements){if(statement!==statement.trim()||!statement||statement.replace(/;+$/u,'')==='')throw failure();skip();if(!source.startsWith(statement,cursor))throw failure();cursor+=statement.length;}
 skip();if(cursor!==source.length)throw failure();
}

/** Compares raw native history with already-verified original source bytes. This proves literal coverage, not parser segmentation or current live schema semantics. */
export function verifyHostedMigrationHistory(value:{sources:MigrationSource[];included:HostedMigrationPlanV1['migrations'];expectedVersions:string[];history:unknown}):HostedMigrationHistoryReceipt{
 try{
  const input=inputSchema.parse(snapshot(value));let total=0;const sources=new Map<string,{name:string;bytes:Uint8Array}>();
  for(const source of input.sources){if(source.bytes.byteLength>2*1024*1024||sources.has(source.name))throw failure();total+=source.bytes.byteLength;sources.set(source.name,source);}if(total>16*1024*1024)throw failure();
  const included=new Map<string,{name:string;version:string;sha256:string}>();for(const row of input.included){const source=sources.get(row.name);if(row.name.slice(0,14)!==row.version||included.has(row.version)||!source||hash(source.bytes)!==row.sha256)throw failure();included.set(row.version,row);}
  if(new Set(input.expectedVersions).size!==input.expectedVersions.length||input.expectedVersions.some(item=>!included.has(item)))throw failure();
  if(input.history===null){if(input.expectedVersions.length)throw failure();return{evidence:'SOURCE_TEXT_COVERAGE',historyPresence:'ABSENT',history:[]};}
  let statementBytes=0;const raw=new Map<string,z.infer<typeof rowSchema>>();for(const row of input.history){if(raw.has(row.version))throw failure();raw.set(row.version,row);for(const statement of row.statements)statementBytes+=Buffer.byteLength(statement);}if(statementBytes>16*1024*1024||JSON.stringify([...raw.keys()].sort())!==JSON.stringify([...input.expectedVersions].sort()))throw failure();
  const history=input.expectedVersions.map(item=>{const expected=included.get(item)!,record=raw.get(item)!;if(record.name!==expected.name.slice(15,-4))throw failure();const bytes=sources.get(expected.name)!.bytes,source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);if(!record.statements.length&&bytes.byteLength!==0)throw failure();covered(source,record.statements);return{version:item,sourceReceiptSha256:hash(bytes)};});
  return{evidence:'SOURCE_TEXT_COVERAGE',historyPresence:'PRESENT',history};
 }catch{throw failure();}
}
