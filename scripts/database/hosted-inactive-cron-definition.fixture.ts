import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {original231RecoveryPlanFixture} from './hosted-original-child-recovery.fixture';
import {prepareOriginal231TransportAppendPlan} from './hosted-original231-transport-append';
import {original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {original231TransportAppendMigration} from './original231-transport-source';

const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
let base:ReturnType<typeof original231RecoveryPlanFixture>|undefined;
/** Source-only metadata fixture; never native approval or a token issuer. */
export function inactiveCronDefinitionContractFixture(){
 const input=structuredClone(base??=(original231RecoveryPlanFixture({sha:'f'.repeat(40),tree:'e'.repeat(40)}))),bytes=readFileSync(resolve(import.meta.dirname,'../../supabase/migrations',original231TransportAppendMigration.name));
 const plan=prepareOriginal231TransportAppendPlan({...input,sources:[...input.sources,{name:original231TransportAppendMigration.name,bytes}]}),old=input.original231Recovery.catalogueReference;
 const catalogueReference232={...old,purpose:'CUEVO_ORIGINAL231_TRANSPORT232_CATALOGUE_REFERENCE',appliedMigrationCount:232,migrationRowsSha256:hash(plan.migrations.map(row=>({version:row.version,sourceReceiptSha256:row.sha256}))),sourceInventorySha256:hash(plan.migrations.map(({name,sha256})=>({name,sha256}))),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,sourceOriginal231ReceiptSha256:'a'.repeat(64),effectScope:'DISABLED_TRANSPORT_DEFINITIONS_ONLY',effectAuthority:false};
 const identity={...input.original231Recovery.template.originalIdentity,sourceSha:plan.source.sha,treeSha:plan.source.tree,planSha256:plan.planSha256,stageSha256:'d'.repeat(64),approvalDigest:'c'.repeat(64),ciRunId:catalogueReference232.runId};
 return{plan,identity,catalogueReference232,releaseRunId:'62',releaseRunAttempt:1,now:input.now};
}
