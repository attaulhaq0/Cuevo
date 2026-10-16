import {types} from 'node:util';
import {snapshotHostedMigrationMetadata} from './hosted-migration-journal-contracts';
import {readInactiveCronDefinitionContext,readNativeInactiveCronDefinitionAcknowledgementMetadata,readNativeReboundInactiveCronDefinitionAcknowledgementMetadata} from './hosted-inactive-cron-definition-contracts';

const fail=()=>Error('Inactive Cron configuration admission requires review; private contents withheld.');
/** Reads a native-owned acknowledgement token before admitting only the next
 * configuration boundary. Actual configuration writes must consume this same
 * token again under fresh approved native authority; no executor is exposed. */
export async function admitInactiveCronDefinitionConfiguration(value:unknown){
 try{
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail();
  const fields=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string')||JSON.stringify(Object.keys(fields).sort())!==JSON.stringify(['acknowledgement','context'])||Object.values(fields).some(field=>!('value'in field)||!field.enumerable))throw fail();
  const context=readInactiveCronDefinitionContext(fields.context.value),native=await import('./hosted-migration-database');
  const projection=snapshotHostedMigrationMetadata(await native.readNativeInactiveCronDefinitionAcknowledgement(fields.acknowledgement.value,context)),expiresAtMs=projection&&typeof projection==='object'?Object.getOwnPropertyDescriptor(projection,'packageExpiresAtMs')?.value:undefined;
  const receipt=readNativeInactiveCronDefinitionAcknowledgementMetadata(projection,{context,now:Date.now(),expiresAtMs});
  return{version:1 as const,purpose:'CUEVO_INACTIVE_CRON_DEFINITION_CONFIGURATION_ADMISSION' as const,evidence:'NATIVE_ACKNOWLEDGEMENT_READ_ONLY' as const,contextSha256:context.contextSha256,identity:context.identity,journalPayloadSha256:receipt.durable.localPayloadSha256,journalChainSha256:receipt.durable.localChainSha256,currentNativeProofBeganAtMs:receipt.currentNativeProofBeganAtMs,currentObservedAtMs:receipt.currentObservedAtMs,packageExpiresAtMs:receipt.packageExpiresAtMs,effectScope:'SQL_CRON_CONFIGURATION_ONLY' as const,effectAuthority:false as const,foundationAccepted:false as const,activationAuthorized:false as const,configurationExecution:'NOT_EXECUTED' as const};
 }catch{throw fail();}
}
/** The original acknowledgement remains historical; a fresh private token
 * verifies current authority without reopening any DDL/journal execution. */
export async function admitReboundInactiveCronDefinitionConfiguration(value:unknown){
 try{
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail();const fields=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string')||JSON.stringify(Object.keys(fields).sort())!==JSON.stringify(['acknowledgement','currentContext','originalContext'])||Object.values(fields).some(field=>!('value'in field)||!field.enumerable))throw fail();
  const originalContext=readInactiveCronDefinitionContext(fields.originalContext.value),currentContext=readInactiveCronDefinitionContext(fields.currentContext.value),native=await import('./hosted-migration-database'),projection=snapshotHostedMigrationMetadata(await native.readNativeReboundInactiveCronDefinitionAcknowledgement(fields.acknowledgement.value,{originalContext,currentContext})),expiresAtMs=projection&&typeof projection==='object'?Object.getOwnPropertyDescriptor(projection,'packageExpiresAtMs')?.value:undefined;
  const receipt=readNativeReboundInactiveCronDefinitionAcknowledgementMetadata(projection,{originalContext,currentContext,now:Date.now(),expiresAtMs});
  return{version:2 as const,purpose:'CUEVO_INACTIVE_CRON_DEFINITION_CONFIGURATION_ADMISSION' as const,evidence:'NATIVE_PERSISTED_ACKNOWLEDGEMENT_READ_ONLY' as const,originalContextSha256:originalContext.contextSha256,currentContextSha256:currentContext.contextSha256,originalIdentity:originalContext.identity,currentIdentity:currentContext.identity,journalPayloadSha256:receipt.durable.localPayloadSha256,journalChainSha256:receipt.durable.localChainSha256,currentNativeProofBeganAtMs:receipt.currentNativeProofBeganAtMs,currentObservedAtMs:receipt.currentObservedAtMs,packageExpiresAtMs:receipt.packageExpiresAtMs,effectScope:'SQL_CRON_CONFIGURATION_ONLY' as const,effectAuthority:false as const,foundationAccepted:false as const,activationAuthorized:false as const,configurationExecution:'NOT_EXECUTED' as const};
 }catch{throw fail();}
}
