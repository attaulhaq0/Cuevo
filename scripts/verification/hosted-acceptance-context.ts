import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';
import { consumeCompletedBackendWebTransferMetadataGuard, readCompletedBackendWebTransferMetadataAndGuard,
 captureCompletedBackendMetadataRefresh,ensureCompletedBackendMetadataRefresh,requireCompletedBackendPopulationEvidence, type CompletedBackendWebTransferMetadataGuard } from './backend-web-transfer-admission';
import { requireHostedBrowserRunner } from './backend-hosted-browser';
import { createHostedBrowserCompanions, readHostedBrowserSource, requestHostedBrowserJson,
 type HostedBrowserCompanionWriter, type HostedBrowserSourceFile } from './hosted-browser-evidence';
import type { HostedCommandJournalIdentity, HostedCommandJournalRecipe } from './hosted-command-journal-contracts';

const failure=()=>Error('Hosted acceptance context requires review; private contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(left:unknown,right:unknown)=>canonicalReleaseExecutionJson(left)===canonicalReleaseExecutionJson(right);
const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),runId=z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value=>Number.isSafeInteger(Number(value)));
const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),date=z.iso.datetime({offset:true});
const origin=z.string().url().refine(value=>{const url=new URL(value);return url.origin===value&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port;});
function inputSchema(){
 const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),runId=z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value=>Number.isSafeInteger(Number(value))),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
 const origin=z.string().url().refine(value=>{const url=new URL(value);return url.origin===value&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port;});
 return z.object({repoRoot:z.string(),releaseSha:sha,ciRunId:runId,backendRunId:runId,backendRunAttempt:positive,artifactId:runId,transferSha256:digest,populationReceiptSha256:digest,
 web:z.object({teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),target:z.literal('preview')}).strict(),webDeployment:z.object({id:z.string().regex(/^dpl_[A-Za-z0-9]+$/),url:origin}).strict(),
 githubToken:z.string().min(1).max(24576),vercelToken:z.string().min(20).max(24576)}).strict();}
/** Recipe wrappers may extend this shape, but preparation always constructs
 * its own private parser rather than trusting this mutable exported object. */
export const hostedAcceptanceInputSchema=inputSchema();
export type HostedAcceptanceInput=z.infer<typeof hostedAcceptanceInputSchema>;
const webAdmissionSchema=z.object({purpose:z.literal('PREBUILD_RELEASE_ADMISSION'),sourceSha:sha,treeSha:sha,ciRunId:runId,runId,runAttempt:positive,webDeploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),artifactSha256:digest,packageSha256:digest,webPackageExpiresAt:date,backendTransferSha256:digest,populationReceiptSha256:digest,apiOrigin:origin,authOrigin:origin,webOrigin:origin,observedAt:date}).strict();
export type HostedAcceptanceWebAdmission=z.infer<typeof webAdmissionSchema>;
export type HostedAcceptancePorts={readmitWeb:()=>Promise<HostedAcceptanceWebAdmission>;backendGuard?:CompletedBackendWebTransferMetadataGuard};
/** Equality/freshness only. The protected release owner supplies the current
 * approval tuple; serializable input never creates admission authority. */
export function validateHostedAcceptanceWebAdmission(value:unknown,expected:Omit<HostedAcceptanceWebAdmission,'observedAt'>&{consumptionExpiresAt:string;observedAt?:string},now:number):HostedAcceptanceWebAdmission{
 try{const current=webAdmissionSchema.parse(value),expires=Date.parse(expected.consumptionExpiresAt);if(!Number.isSafeInteger(now)||Date.parse(current.webPackageExpiresAt)<=now||Date.parse(current.observedAt)>now||now-Date.parse(current.observedAt)>30000||!Number.isFinite(expires)||expires<=now)throw failure();
  for(const key of Object.keys(current) as (keyof HostedAcceptanceWebAdmission)[])if(key!=='observedAt'&&!same(current[key],expected[key]))throw failure();return current;
 }catch{throw failure();}
}
type PublicConfig={apiUrl:string;supabaseUrl:string;supabasePublishableKey:string};
export type HostedAcceptanceContext={
 readonly backendIdentity:CompletedBackendWebTransferMetadataGuard['admission']['backendIdentity'];readonly publicConfig:PublicConfig;
 readonly runner:ReturnType<typeof requireHostedBrowserRunner>;readonly identity:HostedCommandJournalIdentity;readonly originalWeb:HostedAcceptanceWebAdmission;
 readmit:()=>Promise<void>;assertOriginalValidity:()=>void;dispose:()=>void;
 readSource:(file:HostedBrowserSourceFile)=>Promise<Buffer>;createCompanions:(recipe:HostedCommandJournalRecipe)=>Promise<HostedBrowserCompanionWriter>;
};
const preparedContexts=new WeakMap<object,{context:HostedAcceptanceContext;assertOriginalValidity:()=>void}>();
/** Only this preparation owner's exact live reference is consumable. Copied
 * fields, prototypes and serialized proof never create context authority. */
export function consumeHostedAcceptanceContext(value:unknown):HostedAcceptanceContext{
 if(!value||typeof value!=='object'||types.isProxy(value))throw failure();
 const retained=preparedContexts.get(value);if(!retained)throw failure();
 try{retained.assertOriginalValidity();if(preparedContexts.get(value)!==retained)throw failure();return retained.context;}
 catch{preparedContexts.delete(value);throw failure();}
}

/** The sole shared hosted browser preparation. A retained metadata guard is
 * authenticated by its existing owner. Its original 180-second capture lifetime
 * remains authoritative; this consumer cannot renew or replace that guard. */
export async function prepareHostedAcceptanceContext(value:unknown,ports:HostedAcceptancePorts):Promise<HostedAcceptanceContext>{
 let guard:CompletedBackendWebTransferMetadataGuard|undefined;const deadline=Date.now()+180000;
 try{
  if(!ports||typeof ports!=='object'||types.isProxy(ports))throw failure();
  const descriptors=Object.getOwnPropertyDescriptors(ports);
  if(Object.keys(descriptors).some(key=>!['readmitWeb','backendGuard'].includes(key))||Object.values(descriptors).some(row=>!('value'in row))||typeof descriptors.readmitWeb?.value!=='function')throw failure();
  const readmitWeb=descriptors.readmitWeb.value as HostedAcceptancePorts['readmitWeb'],borrowedGuard=descriptors.backendGuard?.value as unknown,borrowed=borrowedGuard!==undefined;
  const input=inputSchema().parse(JSON.parse(canonicalReleaseExecutionJson(value))),root=input.repoRoot;
  if(!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root)throw failure();
  const runner=Object.freeze(requireHostedBrowserRunner(root,input.releaseSha));
  const selection={repoRoot:root,releaseSha:input.releaseSha,ciRunId:input.ciRunId,backendRunId:input.backendRunId,backendRunAttempt:input.backendRunAttempt,artifactId:input.artifactId,transferSha256:input.transferSha256,web:input.web};
  guard=borrowed?consumeCompletedBackendWebTransferMetadataGuard(borrowedGuard,selection):await readCompletedBackendWebTransferMetadataAndGuard({...selection,githubToken:input.githubToken});
  const held=guard,admitted=held.admission,backend=admitted.backendIdentity;
  if(requireCompletedBackendPopulationEvidence(admitted).receiptSha256!==input.populationReceiptSha256)throw failure();
  const configSchema=z.object({apiUrl:origin,supabaseUrl:origin,supabasePublishableKey:z.string().startsWith('sb_publishable_').min(20)}).strict();
  const manifest=z.object({version:z.literal(2),environment:z.literal('staging'),commitSha:z.literal(input.releaseSha),database:z.object({projectRef:z.string().regex(/^[a-z]{20}$/)}),publicConfig:configSchema}).parse(admitted.manifest);
  const publicConfig=Object.freeze(manifest.publicConfig),admittedPublicConfig=configSchema.strip().parse(admitted.publicConfig);
  if(admitted.purpose!=='COMPLETED_BACKEND_WEB_HANDOVER_CONSUMPTION'||admitted.provenance!=='OFFICIAL_COMPLETED_GITHUB_ARTIFACT_AND_VERIFIED_GIT_SOURCE'||backend.repository!==runner.repository||backend.sourceSha!==input.releaseSha||backend.ciRunId!==input.ciRunId||backend.runId!==input.backendRunId||backend.runAttempt!==input.backendRunAttempt||backend.artifactId!==input.artifactId||backend.transferSha256!==input.transferSha256||!same(backend.web,{...input.web,origin:backend.web.origin})||!same(publicConfig,admittedPublicConfig)||publicConfig.supabaseUrl!=='https://'+manifest.database.projectRef+'.supabase.co'||backend.settingsSha256!==hash(canonicalReleaseExecutionJson({NEXT_PUBLIC_API_URL:publicConfig.apiUrl,NEXT_PUBLIC_SUPABASE_URL:publicConfig.supabaseUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publicConfig.supabasePublishableKey})))throw failure();
  const webOrigin=origin.parse(backend.web.origin),deploymentUrl=new URL(input.webDeployment.url);if(!deploymentUrl.hostname.endsWith('.vercel.app'))throw failure();
  let invalid=false,disposed=false,active=false,originalWeb:HostedAcceptanceWebAdmission|undefined;
  const retained:{context?:HostedAcceptanceContext}={};
  const revoke=()=>{if(retained.context)preparedContexts.delete(retained.context);};
  const invalidate=()=>{invalid=true;revoke();held.dispose();};
  const assertOriginalValidity=()=>{try{if(invalid||disposed||Date.now()>=deadline||!same(requireHostedBrowserRunner(root,input.releaseSha),runner))throw failure();held.assertOriginalValidity();if(originalWeb&&(Date.parse(originalWeb.webPackageExpiresAt)<=Date.now()||Date.parse(backend.consumptionExpiresAt)<=Date.now()))throw failure();if(Date.now()>=deadline)throw failure();}catch{invalidate();throw failure();}};
  const exactDeployment=async()=>{
   const deployment=await requestHostedBrowserJson(`https://api.vercel.com/v13/deployments/${input.webDeployment.id}?teamId=${input.web.teamId}`,'GET',{Authorization:'Bearer '+input.vercelToken});if(deployment.status!==200)throw failure();
   z.object({id:z.literal(input.webDeployment.id),projectId:z.literal(input.web.projectId),ownerId:z.literal(input.web.teamId),url:z.literal(deploymentUrl.hostname),readyState:z.literal('READY'),target:z.null().or(z.literal('preview')),meta:z.object({cuevoCommitSha:z.literal(input.releaseSha)})}).parse(deployment.value);
   const alias=await requestHostedBrowserJson(`https://api.vercel.com/v4/aliases/${new URL(webOrigin).hostname}?teamId=${input.web.teamId}`,'GET',{Authorization:'Bearer '+input.vercelToken});if(alias.status!==200)throw failure();
   z.object({alias:z.literal(new URL(webOrigin).hostname),projectId:z.literal(input.web.projectId),deploymentId:z.literal(input.webDeployment.id),redirect:z.null()}).parse(alias.value);
  };
  const readmit=async()=>{
   if(active){invalidate();throw failure();}active=true;
   try{
    assertOriginalValidity();const refreshMarker=captureCompletedBackendMetadataRefresh(held,selection);
    const raw=webAdmissionSchema.parse(await readmitWeb());
    await ensureCompletedBackendMetadataRefresh(held,selection,refreshMarker);assertOriginalValidity();
    const current=validateHostedAcceptanceWebAdmission(raw,{purpose:'PREBUILD_RELEASE_ADMISSION',sourceSha:input.releaseSha,treeSha:backend.treeSha,ciRunId:input.ciRunId,runId:runner.runId,runAttempt:runner.runAttempt,webDeploymentId:input.webDeployment.id,artifactSha256:originalWeb?.artifactSha256??raw.artifactSha256,packageSha256:originalWeb?.packageSha256??raw.packageSha256,webPackageExpiresAt:originalWeb?.webPackageExpiresAt??raw.webPackageExpiresAt,backendTransferSha256:input.transferSha256,populationReceiptSha256:input.populationReceiptSha256,apiOrigin:publicConfig.apiUrl,authOrigin:publicConfig.supabaseUrl,webOrigin,consumptionExpiresAt:backend.consumptionExpiresAt},Date.now());
    assertOriginalValidity();await exactDeployment();assertOriginalValidity();
    validateHostedAcceptanceWebAdmission(current,{...current,consumptionExpiresAt:backend.consumptionExpiresAt},Date.now());
    originalWeb??=Object.freeze(current);
   }catch{invalidate();throw failure();}finally{active=false;}
  };
  await readmit();
  for(const method of ['GET','POST'] as const){assertOriginalValidity();const testing=await requestHostedBrowserJson(webOrigin+'/api/testing/quick-login',method,{},method==='POST'?{role:'student'}:undefined);if(testing.status!==(method==='GET'?200:404)||!z.object({available:z.literal(false)}).strict().safeParse(testing.value).success)throw failure();assertOriginalValidity();}
  const seedBytes=await readHostedBrowserSource(root,'supabase/seed/identities.json');if(hash(seedBytes)!=='7464b3487adc3998d8f4ad4582ffd08ebafbdc8fd9a568433ddc687f4f03ac21')throw failure();
  const schoolId=z.object({schoolId:z.uuid()}).parse(JSON.parse(seedBytes.toString('utf8'))).schoolId;
  const identity=Object.freeze({projectRef:manifest.database.projectRef,schoolId,sourceSha:input.releaseSha,treeSha:backend.treeSha,ciRunId:input.ciRunId,runId:runner.runId,runAttempt:runner.runAttempt,backendTransferSha256:input.transferSha256,webDeploymentId:input.webDeployment.id});
  const readSource=async(file:HostedBrowserSourceFile)=>{try{assertOriginalValidity();const bytes=await readHostedBrowserSource(root,file);assertOriginalValidity();return bytes;}catch{invalidate();throw failure();}};
  const createCompanions=async(recipe:HostedCommandJournalRecipe)=>{try{assertOriginalValidity();const writer=await createHostedBrowserCompanions({repoRoot:root,recipe,identity});assertOriginalValidity();return writer;}catch{invalidate();throw failure();}};
  assertOriginalValidity();const prepared=Object.freeze({backendIdentity:backend,publicConfig,runner,identity,originalWeb:originalWeb!,readmit,assertOriginalValidity,dispose:()=>{disposed=true;revoke();if(!borrowed)held.dispose();},readSource,createCompanions});retained.context=prepared;
  preparedContexts.set(prepared,{context:prepared,assertOriginalValidity});return prepared;
 }catch{guard?.dispose();throw failure();}
}
