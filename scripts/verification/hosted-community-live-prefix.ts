import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';
import { consumeHostedAcceptanceContext, type HostedAcceptanceContext } from './hosted-acceptance-context';
import { requireHostedBrowserRunner } from './backend-hosted-browser';
import { readHostedBrowserCompanionSnapshot, type HostedBrowserCompanionWriter } from './hosted-browser-evidence';
import { prepareHostedCommunityLivePrefix, type HostedCommunityLivePrefixInput } from './backend-hosted-community-artifact';
import { validateHostedCommunityLivePrefixEvidence } from './hosted-community-native';
import { hostedCommandJournalContracts, type HostedCommandJournalIdentity } from './hosted-command-journal-contracts';
import { readHostedMigrationProvider } from '../database/hosted-migration-provider';
import { createHostedMigrationDatabase } from '../database/hosted-migration-database';
import { prepareHostedNativeCa, consumeHostedNativeCa, retireHostedNativeCa, type HostedNativeCa } from './hosted-native-ca';
import {validateHostedCommunityDelivery,type HostedCommunityDeliveryInput} from './hosted-community-delivery';

const fail=()=>Error('Current Community native prefix requires review; private contents withheld.');
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const identitySchema=hostedCommandJournalContracts('community').originalSchema.shape.identity;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const expectedSchema=z.object({identity:identitySchema,prefixSnapshotSha256:digest,journalHeadSha256:digest}).strict();
export type HostedCommunityLivePrefixProofReceipt={version:1;purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF';status:'LIVE_PREFIX_NATIVE_VERIFIED';identity:HostedCommandJournalIdentity;
  prefixSnapshotSha256:string;journalHeadSha256:string;companionInventorySha256:string;nativeEvidenceSha256:string;classRoomId:string;deliveryEventIds:string[];observedAt:string;readOnly:true;sessionsClosed:true;customerReady:false;hostedAcceptance:false;referenceRestored:false};
declare const liveProofBrand:unique symbol;
export type HostedCommunityLivePrefixProof={readonly[liveProofBrand]:true};
const proofs=new WeakMap<object,{context:HostedAcceptanceContext;receipt:HostedCommunityLivePrefixProofReceipt;deadline:number;monotonicDeadline:number;lastClock:number}>();
const activeContexts=new WeakSet<object>();

/** Only an actual protected Node read can issue this one-use local capability.
 * The serialized receipt is factual evidence and cannot recreate a capability. */
export function consumeHostedCommunityLivePrefixProof(value:unknown,expected:unknown):HostedCommunityLivePrefixProofReceipt{
  if(!value||typeof value!=='object'||types.isProxy(value))throw fail();const owned=proofs.get(value);if(!owned)throw fail();
  proofs.delete(value);
  try{
    const selected=expectedSchema.parse(JSON.parse(canonicalReleaseExecutionJson(expected)));
    consumeHostedAcceptanceContext(owned.context);
    if(Date.now()<owned.lastClock||Date.now()>=owned.deadline||performance.now()>=owned.monotonicDeadline||hash(selected)!==hash({identity:owned.receipt.identity,prefixSnapshotSha256:owned.receipt.prefixSnapshotSha256,journalHeadSha256:owned.receipt.journalHeadSha256}))throw fail();
    return structuredClone(owned.receipt);
  }catch{throw fail();}
}

export async function verifyHostedCommunityLivePrefix(options:{context:HostedAcceptanceContext;writer:HostedBrowserCompanionWriter;repoRoot:string;capture:()=>Promise<HostedCommunityLivePrefixInput>;
  delivery:Pick<HostedCommunityDeliveryInput,'invalidations'|'rereads'>;providerToken:string;databasePassword:string;databaseCa:string}):Promise<HostedCommunityLivePrefixProof>{
  let ca:HostedNativeCa|undefined,retirementAttempted=false,context:HostedAcceptanceContext|undefined,ownsContext=false;
  try{
    if(!options||typeof options!=='object'||types.isProxy(options))throw fail();
    const descriptors=Object.getOwnPropertyDescriptors(options);
    if(Object.keys(descriptors).some(key=>!['context','writer','repoRoot','capture','delivery','providerToken','databasePassword','databaseCa'].includes(key))||Object.values(descriptors).some(row=>!('value'in row)))throw fail();
    const writer=descriptors.writer?.value as HostedBrowserCompanionWriter,capture=descriptors.capture?.value as ()=>Promise<HostedCommunityLivePrefixInput>,repoRoot=z.string().parse(descriptors.repoRoot?.value);
    const delivery=JSON.parse(canonicalReleaseExecutionJson(descriptors.delivery?.value)) as Pick<HostedCommunityDeliveryInput,'invalidations'|'rereads'>;
    if(typeof writer!=='function'||types.isProxy(writer)||typeof capture!=='function'||types.isProxy(capture))throw fail();
    context=consumeHostedAcceptanceContext(descriptors.context?.value);
    if(activeContexts.has(context)){context.dispose();throw fail();}
    if(hash(requireHostedBrowserRunner(repoRoot,context.identity.sourceSha))!==hash(context.runner))throw fail();
    activeContexts.add(context);ownsContext=true;
    const current=context;
    const credentials=z.object({providerToken:z.string().min(20).max(24576),databasePassword:z.string().min(16).max(512),databaseCa:z.string().min(20).max(65536)}).strict().parse({providerToken:descriptors.providerToken?.value,databasePassword:descriptors.databasePassword?.value,databaseCa:descriptors.databaseCa?.value});
    const captured=await capture(),files=await readHostedBrowserCompanionSnapshot(writer,captured.companions),prepared=prepareHostedCommunityLivePrefix(captured,files);
    if(hash(prepared.snapshot.identity)!==hash(current.identity))throw fail();
    await current.readmit();consumeHostedAcceptanceContext(current);
    const provider=await readHostedMigrationProvider({projectRef:current.identity.projectRef,boundProjectRef:current.identity.projectRef,providerToken:credentials.providerToken}),endpoint=provider.sessionEndpoint;
    if(provider.projectRef!==current.identity.projectRef||endpoint.projectRef!==current.identity.projectRef||endpoint.kind!=='session-pooler'||endpoint.port!==5432||endpoint.database!=='postgres')throw fail();
    consumeHostedAcceptanceContext(current);
    ca=await prepareHostedNativeCa({directory:join(repoRoot,'.local/hosted-release'),filename:'community-live-prefix-database-ca.pem',bytes:credentials.databaseCa});
    const certificate=await consumeHostedNativeCa(ca),database=await createHostedMigrationDatabase({repoRoot,projectRef:endpoint.projectRef,databaseUrl:`postgresql://postgres.${endpoint.projectRef}@${endpoint.host}:5432/postgres?sslmode=verify-full`,certificate,password:credentials.databasePassword});
    consumeHostedAcceptanceContext(current);
    // Local immutable work and CA preparation complete before the measured native
    // window. Re-admission retains original approval clocks; it never restamps them.
    await current.readmit();consumeHostedAcceptanceContext(current);const started=Date.now(),monotonicStart=performance.now();let lastClock=started;
    const within=()=>{consumeHostedAcceptanceContext(current);const now=Date.now();if(now<lastClock||now-started>=30000||performance.now()-monotonicStart>=30000)throw fail();lastClock=now;};
    const evidence=await database.readCommunityNativeEvidence(prepared.selection);within();
    const observedAt=new Date(Date.now()).toISOString(),validation=validateHostedCommunityLivePrefixEvidence({selection:prepared.selection,evidence,observedAt});
    if(validation.status!=='LIVE_PREFIX_VERIFIED'||!validation.classRoomId)throw fail();
    if(!prepared.selection.scope.group)throw fail();
    const correlated=validateHostedCommunityDelivery({commands:validation.commands,invalidations:delivery.invalidations,rereads:delivery.rereads,identity:{schoolId:current.identity.schoolId,groupId:prepared.selection.scope.group.id,observedAfter:current.originalWeb.observedAt,observedBefore:observedAt}});
    if(correlated.status!=='DELIVERY_CORRELATED'||!correlated.eventIds.length)throw fail();within();
    const after=await capture(),afterFiles=await readHostedBrowserCompanionSnapshot(writer,after.companions),repeated=prepareHostedCommunityLivePrefix(after,afterFiles);
    if(hash(repeated.snapshot)!==hash(prepared.snapshot))throw fail();within();
    await current.readmit();within();await consumeHostedNativeCa(ca);within();
    retirementAttempted=true;await retireHostedNativeCa(ca);ca=undefined;within();
    const receipt:HostedCommunityLivePrefixProofReceipt={version:1,purpose:'CUEVO_HOSTED_COMMUNITY_LIVE_PREFIX_PROOF',status:'LIVE_PREFIX_NATIVE_VERIFIED',identity:structuredClone(current.identity),
      prefixSnapshotSha256:prepared.selection.identity.prefixSnapshotSha256,journalHeadSha256:prepared.selection.identity.journalHeadSha256,companionInventorySha256:prepared.selection.identity.companionInventorySha256,
      nativeEvidenceSha256:hash(evidence),classRoomId:validation.classRoomId,deliveryEventIds:correlated.eventIds,observedAt,readOnly:true,sessionsClosed:true,customerReady:false,hostedAcceptance:false,referenceRestored:false};
    if(await writer('prefix-snapshot.json',prepared.snapshot)!==prepared.selection.identity.prefixSnapshotSha256)throw fail();within();
    if(await writer('prefix-proof.json',receipt)!==hash(receipt))throw fail();within();
    const proof=Object.freeze({}) as HostedCommunityLivePrefixProof;proofs.set(proof,{context:current,receipt,deadline:started+30000,monotonicDeadline:monotonicStart+30000,lastClock});return proof;
  }catch{throw fail();}
  finally{try{if(ca&&!retirementAttempted){retirementAttempted=true;await retireHostedNativeCa(ca);}}finally{if(context&&ownsContext)activeContexts.delete(context);}}
}
