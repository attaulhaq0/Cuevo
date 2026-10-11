import { createHash } from 'node:crypto';
import { z } from 'zod';
import policy from './unknown-prefix-catalogue-policy.json';
import { hostedSchemaCatalogueQuerySha256, requireCompleteHostedSchemaCatalogue, type HostedSchemaCatalogue } from './hosted-schema-catalogue';
import { unknownPrefixCataloguePolicySha256 } from './hosted-schema-reconciliation-policy';
import { canonicalReleaseExecutionJson } from '../verification/release-review';

const fail=()=>Error('Source child catalogue reference requires review; contents withheld.');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),positive=z.number().int().positive().safe(),date=z.iso.datetime({offset:true});
export const hostedChildCatalogueCategories=['column','constraint','defaultAcl','dependency','function','index','membership','policy','prerequisite','relation','role','roleSetting','schema','sequence','trigger','type'] as const;
const category=z.object({category:z.enum(hostedChildCatalogueCategories),count:z.number().int().nonnegative().max(100000),sha256:digest}).strict();
export const hostedChildCatalogueSummarySchema=z.object({version:z.literal('CUEVO_SCHEMA_CATALOGUE_V1'),serverVersion:z.literal(170011),sha256:digest,categories:z.array(category).length(16),bytes:positive.max(32*1024*1024),rows:positive.max(100000)}).strict().refine(value=>value.categories.every((row,index)=>row.category===hostedChildCatalogueCategories[index])&&value.rows===value.categories.reduce((sum,row)=>sum+row.count,0));
export type HostedChildCatalogueSummary=z.infer<typeof hostedChildCatalogueSummarySchema>;
export const sourceChildCatalogueImage=Object.freeze({tag:'public.ecr.aws/supabase/postgres:17.11.0.002',pinnedReference:'public.ecr.aws/supabase/postgres@sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53',indexDigest:'sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53',manifestDigest:'sha256:4bfbe2e6d7909bd386b1b774683899deb12efa04a3eebaa141f164ffd04ada1d',configDigest:'sha256:e671c63f6ad3a3bc0503d26bb6641bb2b8eddaabbfe1782ba56b7d2c0243b6d8',platform:'linux/amd64'});
/** Docker's classic store names the config; containerd may name its OCI index.
 * Both must resolve the exact pinned repository index and amd64 platform. */
export function verifySourceChildCatalogueImage(value:unknown){try{const v=z.object({Id:z.union([z.literal(sourceChildCatalogueImage.indexDigest),z.literal(sourceChildCatalogueImage.configDigest)]),RepoDigests:z.array(z.string()).min(1).max(20),Os:z.literal('linux'),Architecture:z.literal('amd64')}).parse(JSON.parse(canonicalReleaseExecutionJson(value)));if(!v.RepoDigests.includes(sourceChildCatalogueImage.pinnedReference)||new Set(v.RepoDigests).size!==v.RepoDigests.length)throw fail();return sourceChildCatalogueImage;}catch{throw fail();}}
export function summarizeSourceChildCatalogue(value:unknown):HostedChildCatalogueSummary{const c=requireCompleteHostedSchemaCatalogue(value);return hostedChildCatalogueSummarySchema.parse({version:c.version,serverVersion:170011,sha256:c.sha256,categories:c.categories,bytes:c.bytes,rows:c.rows.length});}
const same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
/** Only the ten already reviewed exact row replacements; never category filtering. */
export function applySourceChildCatalogueProviderDeltas(value:unknown):HostedSchemaCatalogue{
 try{const input=requireCompleteHostedSchemaCatalogue(value),rows=new Map(input.rows.map(row=>[row.category+':'+row.key,row]));
  if(policy.exactProviderDeltas.length!==10||hash(JSON.stringify(policy))!=='b9e574b128373c91f1b107b84e72fba9956c582db3b8ec2d597e9c28e0c3fde3'||hostedSchemaCatalogueQuerySha256!==policy.querySha256)throw fail();
  for(const delta of policy.exactProviderDeltas){const actual=rows.get(delta.id)??null;if(!same(actual,delta.expected))throw fail();rows.delete(delta.id);if(delta.observed!==null)rows.set(delta.id,delta.observed as typeof input.rows[number]);}
  return requireCompleteHostedSchemaCatalogue([...rows.values()]);
 }catch{throw fail();}
}
export function deriveSourceChildCatalogueBaseline(prefix123:unknown,prefix144:unknown){
 try{const scratch123=summarizeSourceChildCatalogue(prefix123),scratch144=summarizeSourceChildCatalogue(prefix144),expected123=policy.completedPrefix.scratch;
  if(scratch123.sha256!==expected123.catalogueSha256||scratch123.bytes!==expected123.bytes||scratch123.rows!==expected123.rows||!same(scratch123.categories,expected123.categories))throw fail();
  const provider123=summarizeSourceChildCatalogue(applySourceChildCatalogueProviderDeltas(prefix123).rows),expected=policy.completedPrefix.expected;
  if(provider123.sha256!==expected.catalogueSha256||provider123.bytes!==expected.bytes||provider123.rows!==expected.rows||!same(provider123.categories,expected.categories))throw fail();
  const provider144=summarizeSourceChildCatalogue(applySourceChildCatalogueProviderDeltas(prefix144).rows);
  return{scratch123,provider123,scratch144,provider144,policySha256:unknownPrefixCataloguePolicySha256,querySha256:hostedSchemaCatalogueQuerySha256};
 }catch{throw fail();}
}
export const hostedChildCatalogueReceiptSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_SOURCE_CHILD144_CATALOGUE'),repository:z.literal('attaulhaq0/Cuevo'),sourceSha:sha,treeSha:sha,baselineSourceSha:z.literal('1a493ad735798bb6d3fa0ffaabc779e62149ac37'),baselineTreeSha:z.literal('a207a7ec44dd29d61adc0490b85fedbf1e696fcd'),runId:z.string().regex(/^[1-9][0-9]*$/),runAttempt:positive,producerJob:z.literal('database-checks'),producerStep:z.literal('Build exact source child144 catalogue reference'),migrationCount:z.literal(144),migrationRowsSha256:z.literal('54b0bffc96d8f5f6386eff4ca851997d1926e9a0c44797351c192c1ea0d96198'),sourceInventorySha256:digest,querySha256:digest,policySha256:digest,producerSha256:digest,bootstrapSha256:digest,serviceSchemaSha256:z.object({auth:digest,storage:digest,realtime:digest}).strict(),image:z.literal(sourceChildCatalogueImage.tag),imageId:z.literal(sourceChildCatalogueImage.indexDigest),imageReference:z.literal(sourceChildCatalogueImage.pinnedReference),imageManifestSha256:z.literal(sourceChildCatalogueImage.manifestDigest),imageConfigSha256:z.literal(sourceChildCatalogueImage.configDigest),imagePlatform:z.literal(sourceChildCatalogueImage.platform),sourceLockSha256:digest,nodeVersion:z.literal('v24.16.0'),nodeBinarySha256:digest,scratch123:hostedChildCatalogueSummarySchema,provider123:hostedChildCatalogueSummarySchema,scratch144:hostedChildCatalogueSummarySchema,catalogueSummary:hostedChildCatalogueSummarySchema,startedAt:date,capturedAt:date,cleanupCompletedAt:date,cleanupConfirmed:z.literal(true),sourceFrozen:z.literal(true),hostedAcceptance:z.literal(false),effectAuthority:z.literal(false)}).strict();
export type HostedChildCatalogueReceipt=z.infer<typeof hostedChildCatalogueReceiptSchema>;
export function parseHostedChildCatalogueReceipt(value:unknown):HostedChildCatalogueReceipt{
 try{if(Buffer.byteLength(canonicalReleaseExecutionJson(value))>49152)throw fail();const r=hostedChildCatalogueReceiptSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),p=policy.completedPrefix;
  if(r.querySha256!==hostedSchemaCatalogueQuerySha256||r.policySha256!==unknownPrefixCataloguePolicySha256||Date.parse(r.startedAt)>Date.parse(r.capturedAt)||Date.parse(r.capturedAt)>Date.parse(r.cleanupCompletedAt)||r.sourceSha===r.baselineSourceSha)throw fail();
  for(const[actual,expected]of [[r.scratch123,p.scratch],[r.provider123,p.expected]]as const)if(actual.sha256!==expected.catalogueSha256||actual.rows!==expected.rows||actual.bytes!==expected.bytes||!same(actual.categories,expected.categories))throw fail();
  return r;
 }catch{throw fail();}
}
export const sourceChildCatalogueReceiptSha256=(value:unknown)=>hash(canonicalReleaseExecutionJson(parseHostedChildCatalogueReceipt(value)));
