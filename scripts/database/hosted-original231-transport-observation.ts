import {createHash} from 'node:crypto';
import {z} from 'zod';
import {original231TransportAppendMigration} from './original231-transport-source';
import {parseOriginal231RecoveryTemplate,expandOriginalNative180RecoveryTemplate,readOriginalNative180RetainedChild} from './hosted-original-child-recovery';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {requireCompleteHostedSchemaCatalogue,type HostedSchemaCatalogue} from './hosted-schema-catalogue';
const fail=()=>Error('Native inactive transport source observation requires review; contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
/** Only the b4 migration's exact legacy Boolean replacement is eligible for the
 * inactive-definition observation. Neither false nor true supplies authority. */
export function readInactiveCronLegacyTransportBody(sourceBytes:Uint8Array):string{
 if(hash(sourceBytes)!==original231TransportAppendMigration.sha256)throw fail();
 const text=new TextDecoder('utf8',{fatal:true}).decode(sourceBytes),marker="create or replace function internal.worker_transport_private()returns boolean language sql stable security definer set search_path=''as $$",start=text.indexOf(marker),end=text.indexOf('$$;',start+marker.length);
 if(start<0||end<0||text.indexOf(marker,start+1)>=0)throw fail();return text.slice(start+marker.length,end);
}
export const inactiveCronLegacyTransportSourceSql=`/* CUEVO_INACTIVE_CRON_LEGACY_TRANSPORT_SOURCE */ select p.prosrc as body,p.prosecdef and p.provolatile='s' and p.prorettype='boolean'::regtype and r.rolname='postgres' and l.lanname='sql' and p.proconfig @> array['search_path=""'] and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') and not exists(select 1 from pg_roles caller where caller.rolname in('anon','authenticated','service_role','cuevo_api','cuevo_worker') and has_function_privilege(caller.oid,p.oid,'EXECUTE')) as valid from pg_proc p join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('internal.worker_transport_private()')`;
export const inactiveCronEmptyRuntimeSql=`/* CUEVO_INACTIVE_CRON_EMPTY_RUNTIME */ select
 not exists(select 1 from pg_roles where rolname in('cuevo_api','cuevo_worker')and rolcanlogin) as "runtimeNoLogin",
 not exists(select 1 from vault.secrets where name=$1) as "runtimeKeysAbsent",
 not exists(select 1 from internal.outbox_events where state='PROCESSING')and not exists(select 1 from internal.posthog_delivery where state='PROCESSING')as "processingAbsent",
 not exists(select 1 from net.http_request_queue)and not exists(select 1 from net._http_response)as "netQueueAbsent",
 not exists(select 1 from auth.users)and not exists(select 1 from auth.sessions)as "authAbsent"`;
export function readInactiveCronLegacyTransportSource(value:unknown,sourceBytes:Uint8Array){
 const expected=readInactiveCronLegacyTransportBody(sourceBytes),actual=z.object({body:z.string().max(64*1024),valid:z.literal(true)}).strict().parse(value);
 if(actual.body!==expected)throw fail();return{version:1 as const,purpose:'CUEVO_INACTIVE_CRON_LEGACY_SOURCE' as const,bodySha256:hash(expected),effectAuthority:false as const};
}
export function readInactiveCronEmptyRuntime(value:unknown){return z.object({runtimeNoLogin:z.literal(true),runtimeKeysAbsent:z.literal(true),processingAbsent:z.literal(true),netQueueAbsent:z.literal(true),authAbsent:z.literal(true)}).strict().parse(value);}
/** Source-matched native catalogue names become quoted read-only existence
 * checks for every physical app table, with no row values returned. */
export function inactiveCronEmptyAppCensusSql(catalogue:HostedSchemaCatalogue):string{
 const owned=requireCompleteHostedSchemaCatalogue(catalogue.rows),tables=owned.rows.filter(row=>row.category==='relation'&&row.facts.schema==='app'&&['r','p'].includes(String(row.facts.kind))).map(row=>String(row.facts.name)).sort();
 if(tables.length!==136||new Set(tables).size!==tables.length)throw fail();
 return '/* CUEVO_INACTIVE_CRON_FULL_EMPTY_APP_CENSUS */ select 136 as "tableCount",'+tables.map(name=>'not exists(select 1 from app."'+name.replaceAll('"','""')+'" limit 1)').join(' and ')+' as empty';
}
export function readInactiveCronEmptyAppCensus(value:unknown){return z.object({tableCount:z.literal(136),empty:z.literal(true)}).strict().parse(value);}

/** Exact original private objects remain unchanged while one distinct current
 * operation may own its new intent/terminal. No unrelated journal is ignored. */
export function requireOriginal231InactiveDefinitionCustody(value:{objects:{path:string;sha256:string}[];operations:{operation:string;identity:unknown;state:string;chainSha256:string}[]},templateValue:unknown,current:{identity:unknown;contextSha256:string}){
 const template=parseOriginal231RecoveryTemplate(templateValue),envelope=JSON.parse(template.native180ReceiptJson),native180=expandOriginalNative180RecoveryTemplate(envelope.template,template.stageRows.slice(0,180)),child=readOriginalNative180RetainedChild(native180).template;
 const protectedRows=[
  {operation:template.selection.originalOperationSha256,owner:template.ownerSha256,records:template.recordSha256,chain:template.originalChainSha256,identity:template.originalIdentity,state:'REQUIRES_REVIEW'},
  {operation:native180.selection.originalOperationSha256,owner:native180.ownerSha256,records:native180.recordSha256,chain:native180.originalChainSha256,identity:native180.originalIdentity,state:'REQUIRES_REVIEW'},
  {operation:child.selection.originalOperationSha256,owner:child.ownerSha256,records:child.recordSha256,chain:child.originalChainSha256,identity:child.originalIdentity,state:'REQUIRES_REVIEW'},
  {operation:child.native124.originalOperationSha256,owner:child.native124.ownerSha256,records:[child.native124.intentRecordSha256,child.native124.terminalRecordSha256],chain:null,identity:null,state:'COMMITTED'},
 ];
 const currentOperation=hash(JSON.stringify(current.identity)),expectedPaths=new Map<string,string>();
 for(const row of protectedRows){const base=`migration/v1/${template.originalIdentity.projectRef}/${row.operation}/`;expectedPaths.set(base+'owner.json',row.owner);row.records.forEach((sha,index)=>expectedPaths.set(base+String(index+1).padStart(6,'0')+'.record.json',sha));
  const matched=value.operations.filter(operation=>operation.operation===row.operation);if(matched.length!==1||matched[0].state!==row.state||row.chain!==null&&matched[0].chainSha256!==row.chain||row.identity!==null&&canonicalReleaseExecutionJson(matched[0].identity)!==canonicalReleaseExecutionJson(row.identity))throw fail();
 }
 if(value.operations.some(operation=>!protectedRows.some(row=>row.operation===operation.operation)&&(operation.operation!==currentOperation||canonicalReleaseExecutionJson(operation.identity)!==canonicalReleaseExecutionJson(current.identity)||!['OWNER_ONLY','INTENT','INACTIVE_DEFINITIONS_ACKNOWLEDGED'].includes(operation.state))))throw fail();
 if(value.objects.some(object=>expectedPaths.has(object.path)?object.sha256!==expectedPaths.get(object.path):!object.path.startsWith(`migration/v1/${template.originalIdentity.projectRef}/${currentOperation}/`))||new Set(value.objects.map(object=>object.path)).size!==value.objects.length||[...expectedPaths.keys()].some(path=>value.objects.filter(object=>object.path===path).length!==1))throw fail();
 return{originalOperationSha256:template.selection.originalOperationSha256,originalChainSha256:template.originalChainSha256,originalAcknowledgement:'UNKNOWN' as const,installedMarkerSha256:template.installedMarkerSha256,effectAuthority:false as const};
}
