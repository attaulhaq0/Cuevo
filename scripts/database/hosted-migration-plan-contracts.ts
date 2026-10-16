import {z} from 'zod';
const projectRef=z.string().regex(/^[a-z]{20}$/),version=z.string().regex(/^\d{14}$/);
/** Shared planning metadata only; it never grants native execution authority. */
export const hostedMigrationPlanningTargetSchema=z.object({
 projectRef,boundProjectRef:projectRef,projectName:z.string(),projectStatus:z.literal('ACTIVE_HEALTHY'),
 deploymentEnvironment:z.literal('synthetic-staging'),observedAt:z.iso.datetime({offset:true}),
 authUsers:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),storageObjects:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
 appSchemas:z.array(z.enum(['app','internal','authorization'])).max(3),migrationVersions:z.array(version).max(1000),
 dispatchDisabled:z.literal(true),population:z.enum(['EMPTY','GUARDED_SYNTHETIC','SCHEMA_ONLY']),
}).strict();
