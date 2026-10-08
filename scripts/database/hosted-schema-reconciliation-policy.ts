import { createHash } from 'node:crypto';
import { z } from 'zod';
import policy from './unknown-prefix-catalogue-policy.json';
import { hostedSchemaCatalogueQuerySha256, requireCompleteHostedSchemaCatalogue } from './hosted-schema-catalogue';
import { canonicalReleaseExecutionJson } from '../verification/release-review';

const failure=()=>Error('Fixed original prefix catalogue policy requires review; contents withheld.');
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const policyDigest='b9e574b128373c91f1b107b84e72fba9956c582db3b8ec2d597e9c28e0c3fde3';
const category=z.object({category:z.string(),count:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const summary=z.object({version:z.literal('CUEVO_SCHEMA_CATALOGUE_V1'),sha256:z.string().regex(/^[a-f0-9]{64}$/),categories:z.array(category).length(16),bytes:z.number().int().positive(),rows:z.number().int().positive()}).strict();
export const unknownPrefixCataloguePolicySha256=hash(canonicalReleaseExecutionJson(policy));
export const unknownPrefixAbsentMarkersSql=`/* CUEVO_FIXED_UNKNOWN_PREFIX_ABSENCE */ select
 exists(select 1 from pg_attribute where attrelid=to_regclass('app.private_assets') and attname='assessment_id' and attnum>0 and not attisdropped) as private_asset_assessment_column,
 exists(select 1 from pg_attribute where attrelid=to_regclass('app.submissions') and attname='response_kind' and attnum>0 and not attisdropped) as submission_response_kind,
 exists(select 1 from pg_attribute where attrelid=to_regclass('app.submissions') and attname='asset_ids' and attnum>0 and not attisdropped) as submission_asset_ids,
 exists(select 1 from pg_attribute where attrelid=to_regclass('app.submission_drafts') and attname='response_kind' and attnum>0 and not attisdropped) as draft_response_kind,
 exists(select 1 from pg_attribute where attrelid=to_regclass('app.submission_drafts') and attname='asset_ids' and attnum>0 and not attisdropped) as draft_asset_ids,
 to_regclass('app.submission_artifacts') is not null as submission_artifacts,
 to_regclass('app.portfolio_artifacts') is not null as portfolio_artifacts,
 to_regprocedure('internal.submission_asset_selection(jsonb)') is not null as submission_asset_selection,
 to_regprocedure('internal.validate_submission_assets(uuid,uuid[])') is not null as validate_submission_assets,
 to_regprocedure('internal.submission_artifact_manifest()') is not null as submission_artifact_manifest,
 to_regprocedure('internal.submission_artifact_list(uuid)') is not null as submission_artifact_list,
 to_regprocedure('internal.submitted_work_allowed(uuid)') is not null as submitted_work_allowed,
 to_regprocedure('internal.read_submitted_work(uuid)') is not null as read_submitted_work,
 to_regprocedure('internal.read_submission_asset(uuid,uuid)') is not null as read_submission_asset,
 to_regclass('internal.intervention_approved_options') is not null as later_approved_options,
 to_regclass('internal.intervention_learning_choices') is not null as later_learning_choices,
 to_regprocedure('internal.current_school_schedule_page(text,jsonb)') is not null as later_schedule_projection`;
export const unknownPrefixAbsencePolicySha256=hash(unknownPrefixAbsentMarkersSql);
/** Exact captured provider deltas remain in the source-owned manifest; no category or grant is ignored. This validates supplied metadata only. */
export function verifyUnknownPrefixCatalogueSummary(value:unknown,serverVersion:number,prefixCount:120|123=120){
 try{if(hash(JSON.stringify(policy))!==policyDigest||hostedSchemaCatalogueQuerySha256!==policy.querySha256||serverVersion!==policy.serverVersion)throw failure();
  const selected=summary.parse(JSON.parse(canonicalReleaseExecutionJson(value))),expected=prefixCount===120?policy.expected:prefixCount===123?policy.completedPrefix.expected:null;if(!expected)throw failure();
  if(selected.sha256!==expected.catalogueSha256||selected.rows!==expected.rows||selected.bytes!==expected.bytes||canonicalReleaseExecutionJson(selected.categories)!==canonicalReleaseExecutionJson(expected.categories))throw failure();
  return{evidence:'SUPPLIED_FIXED_CATALOGUE_SUMMARY_ONLY' as const,catalogueSha256:selected.sha256,cataloguePolicySha256:unknownPrefixCataloguePolicySha256,querySha256:policy.querySha256,hostedAcceptance:false as const};
 }catch{throw failure();}
}
/** Native owners must pass their complete fixed-query rows; metadata hashes alone do not certify the database. */
export function verifyUnknownPrefixCataloguePolicy(rows:unknown,serverVersion:number,prefixCount:120|123=120){const catalogue=requireCompleteHostedSchemaCatalogue(rows);return verifyUnknownPrefixCatalogueSummary({version:catalogue.version,sha256:catalogue.sha256,categories:catalogue.categories,bytes:catalogue.bytes,rows:catalogue.rows.length},serverVersion,prefixCount);}
