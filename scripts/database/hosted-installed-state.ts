import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
export const hostedSyntheticSeedSha256='7be612e9a30e916ec4b460a2ae14a2796cb3f4f542cbdec8f7db2f49c95d9903';

const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const installedPopulationKey='cuevo-initial-hosted-synthetic-population';
export const installedPopulationCommand='operator.synthetic_population.provision';
export const installedPopulationReceiptSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_INSTALLED_SYNTHETIC_POPULATION'),projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:sha,treeSha:sha,seedSha256:z.literal(hostedSyntheticSeedSha256),manifestSha256:digest}).strict();
export type InstalledPopulationReceipt=z.infer<typeof installedPopulationReceiptSchema>;
export const installedMigrationReceiptSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_COMPLETED_INSTALLED_MIGRATIONS'),projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:sha,treeSha:sha,migrationCount:z.number().int().positive().max(1000),migrations:z.array(z.object({version:z.string().regex(/^\d{14}$/),sha256:digest}).strict()).min(1).max(1000)}).strict().superRefine((value,context)=>{if(value.migrations.length!==value.migrationCount||new Set(value.migrations.map(row=>row.version)).size!==value.migrationCount)context.addIssue({code:'custom',message:'Completed migration inventory requires exact unique history.'});});
export type InstalledMigrationReceipt=z.infer<typeof installedMigrationReceiptSchema>;
export const installedSchemaReceiptSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_INSTALLED_SCHEMA_STAGE'),projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:sha,treeSha:sha,migrationCount:z.number().int().positive().max(1000),migrations:z.array(z.object({version:z.string().regex(/^\d{14}$/),sha256:digest}).strict()).min(1).max(1000),stageId:z.enum(['prefix','native','pre-observability','remaining']),stageSha256:digest}).strict().superRefine((value,context)=>{if(value.migrations.length!==value.migrationCount||new Set(value.migrations.map(row=>row.version)).size!==value.migrationCount)context.addIssue({code:'custom',message:'Installed stage requires an exact unique prefix.'});});
export type InstalledSchemaReceipt=z.infer<typeof installedSchemaReceiptSchema>;
/** Catalogue-only prerequisite; never creates extensions or grants. */
export const installedSchemaStorageQuery=`/* CUEVO_INSTALLED_SCHEMA_STORAGE */ select
 to_regclass('vault.decrypted_secrets') is not null
 and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure('vault.create_secret(text,text,text,uuid)') and n.nspname='vault' and p.proname='create_secret' and r.rolname='supabase_admin' and p.pronargdefaults >= 1)
 and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') and n.nspname='vault' and p.proname='update_secret' and r.rolname='supabase_admin' and p.pronargdefaults >= 1)
 and coalesce(has_table_privilege(session_user,to_regclass('vault.decrypted_secrets'),'SELECT'),false)
 and coalesce(has_function_privilege(session_user,to_regprocedure('vault.create_secret(text,text,text,uuid)'),'EXECUTE'),false)
 and coalesce(has_function_privilege(session_user,to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)'),'EXECUTE'),false) as available`;
export function readInstalledSchemaReceipt(value:unknown,projectRef:string):InstalledSchemaReceipt|null{const rows=z.array(z.object({decrypted_secret:z.string().max(49152)}).strict()).max(1).parse(value);if(!rows.length)return null;const receipt=installedSchemaReceiptSchema.parse(JSON.parse(rows[0].decrypted_secret));if(receipt.projectRef!==projectRef)throw Error('Installed schema stage requires review.');return receipt;}
export function readInstalledMigrationReceipt(value:unknown,projectRef:string):InstalledMigrationReceipt|null{const rows=z.array(z.object({decrypted_secret:z.string().max(49152)}).strict()).max(1).parse(value);if(!rows.length)return null;const receipt=installedMigrationReceiptSchema.parse(JSON.parse(rows[0].decrypted_secret));if(receipt.projectRef!==projectRef)throw Error('Installed migration source requires review.');return receipt;}
export function installedPopulationFingerprint(value:InstalledPopulationReceipt){return createHash('sha256').update(canonicalReleaseExecutionJson(installedPopulationReceiptSchema.parse(value))).digest('hex');}
/** Fixed private operator receipt lookup. Management access is trusted; this
 * describes original installed source, never fresh effect approval. */
export const installedPopulationQuery=`/* CUEVO_INSTALLED_POPULATION_RECEIPT */ select fingerprint,state,response from internal.idempotency_keys where school_id='10000000-0000-4000-8000-000000000001' and actor_id='20000000-0000-4000-8000-000000000001' and key='${installedPopulationKey}' and command='${installedPopulationCommand}'`;
export function readInstalledPopulationReceipt(value:unknown,projectRef:string):InstalledPopulationReceipt{
 const rows=z.array(z.object({fingerprint:digest,state:z.literal('COMPLETED'),response:installedPopulationReceiptSchema}).strict()).length(1).parse(JSON.parse(canonicalReleaseExecutionJson(value)));
 const receipt=rows[0].response;if(receipt.projectRef!==projectRef||installedPopulationFingerprint(receipt)!==rows[0].fingerprint)throw Error('Installed population original receipt requires review.');return receipt;
}
