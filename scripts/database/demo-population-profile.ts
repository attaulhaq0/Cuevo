import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { z } from 'zod';
import { syntheticAuthSeedActorSchema } from '../seed-auth';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { loadLockedPack } from '../../apps/api/src/modules/curriculum/packs';

export const demoProfileId = 'DEMO_49_V1' as const;
export const demoProfileSourceSha256 = '4701def6bb97fa83d2a2e6cdc51dd7f524df2d08d8b6bc9872f7e26243ea2587';
export const demoProfileCanonicalSha256 = 'f8bfca4d5797f3d4c9fccaa465441b21f3d5bd0aa267ed700863f236f4d0df11';
const actorSourceSha256 = '0ca285a277cfc02a4a363dd8a2a7fb9bdcf100ccc0628d2dd4c4808991323a11';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const failure = () => Error('The finite synthetic demo source requires review; private input withheld.');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const curriculumSchema = z.object({ packDirectory: z.enum(['synthetic-primary-v1', 'synthetic-pathway-v1']), packId: z.enum(['synthetic-primary', 'synthetic-pathway']), version: z.literal('synthetic-1'), framework: z.string().min(1).max(200), packManifestSha256: digest, assessmentArtifactSha256: digest, assessmentModel: z.enum(['numeric', 'rubric']) }).strict();
const schoolSchema = z.object({ schoolId: z.uuid(), name: z.object({ en: z.string().min(1).max(200), ar: z.string().min(1).max(200) }).strict(), country: z.string().regex(/^[A-Z]{2}$/), languages: z.tuple([z.literal('en'), z.literal('ar')]), startingState: z.enum(['POPULATED_DEMO', 'ADMIN_ONLY_SETUP']), initialClasses: z.array(z.never()).length(0), initialCourses: z.array(z.never()).length(0), curriculum: curriculumSchema.nullable(), qualityFrameworks: z.array(z.string()).length(0) }).strict();
const profileSchema = z.object({ version: z.literal(1), kind: z.literal('CUEVO_SYNTHETIC_DEMO_POPULATION_PROFILE'), profileId: z.literal(demoProfileId), purpose: z.literal('DEMO'), synthetic: z.literal(true), schools: z.array(schoolSchema).length(3), actors: z.array(syntheticAuthSeedActorSchema).length(49), guardianRelationships: z.array(z.object({ schoolId: z.uuid(), studentActorId: z.uuid(), guardianActorId: z.uuid() }).strict()).length(20) }).strict();
export type DemoPopulationProfile = z.infer<typeof profileSchema>;

// Snapshot only bounded own data. No getter, proxy, custom array method or JSON hook supplies evidence.
function ownData(value: unknown, budget = { nodes: 0 }, depth = 0): unknown {
  if (++budget.nodes > 6000 || depth > 12) throw failure();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > 1024 || value.includes('\0')) throw failure(); return value; }
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) throw failure(); return value; }
  if (typeof value !== 'object' || types.isProxy(value)) throw failure();
  const array = Array.isArray(value);
  if (array ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length > 65 || keys.some(key => typeof key !== 'string')) throw failure();
  if (array && (value.length > 64 || keys.length !== value.length + 1)) throw failure();
  const output: Record<string, unknown> | unknown[] = array ? [] : Object.create(null);
  for (const key of keys) {
    if (key === 'length' && array) continue;
    const descriptor = descriptors[key as string];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable || array && !/^(0|[1-9]\d*)$/.test(key as string)) throw failure();
    Object.defineProperty(output, key, { value: ownData(descriptor.value, budget, depth + 1), enumerable: true });
  }
  return output;
}

/** Immutable planned population, not observed school membership or permission. */
export function decodeDemoPopulationProfile(value: unknown): DemoPopulationProfile {
  try {
    const profile = profileSchema.parse(ownData(value));
    if (Buffer.byteLength(canonicalReleaseExecutionJson(profile)) > 65536 || hash(canonicalReleaseExecutionJson(profile)) !== demoProfileCanonicalSha256) throw failure();
    const schools = new Set(profile.schools.map(school => school.schoolId));
    if (schools.size !== 3 || new Set(profile.actors.map(actor => actor.actorId)).size !== 49 || new Set(profile.actors.map(actor => actor.email)).size !== 49 || profile.actors.some(actor => !schools.has(actor.schoolId))) throw failure();
    for (const school of profile.schools) {
      const actors = profile.actors.filter(actor => actor.schoolId === school.schoolId);
      const expected = school.startingState === 'ADMIN_ONLY_SETUP' ? { admin: 1, coordinator: 0, teacher: 0, student: 0, parent: 0 } : { admin: 1, coordinator: 1, teacher: 2, student: 10, parent: 10 };
      if (Object.entries(expected).some(([role, count]) => actors.filter(actor => actor.role === role).length !== count)) throw failure();
      if (school.startingState === 'ADMIN_ONLY_SETUP' ? school.curriculum !== null : school.curriculum === null || school.curriculum.framework !== 'School Custom') throw failure();
    }
    if (new Set(profile.guardianRelationships.map(row => row.studentActorId)).size !== 20 || new Set(profile.guardianRelationships.map(row => row.guardianActorId)).size !== 20) throw failure();
    for (const row of profile.guardianRelationships) {
      const student = profile.actors.find(actor => actor.actorId === row.studentActorId), guardian = profile.actors.find(actor => actor.actorId === row.guardianActorId);
      if (student?.role !== 'student' || guardian?.role !== 'parent' || student.schoolId !== row.schoolId || guardian.schoolId !== row.schoolId) throw failure();
    }
    return profile;
  } catch { throw failure(); }
}

export function prepareDemoPopulationInput(value: unknown) {
  const profile = decodeDemoPopulationProfile(value);
  return { version: 1 as const, kind: 'DEMO_POPULATION_PLANNED_INPUT' as const, profileId: demoProfileId, profileSha256: demoProfileCanonicalSha256,
    plannedSchoolCount: profile.schools.length, plannedMemberCount: profile.actors.length, plannedStudentCount: profile.actors.filter(actor => actor.role === 'student').length, plannedGuardianRelationshipCount: profile.guardianRelationships.length,
    schoolIds: profile.schools.map(school => school.schoolId), actorSourceSha256, executionAuthorized: false as const, populationInstalled: null, currentApproval: null,
    targetProjectRef: null, targetSelection: 'PROPOSE_EXISTING_UNUSED_STAGING_REQUIRES_FRESH_NATIVE_CHECKS' as const };
}
export type DemoPopulationPlannedInput = ReturnType<typeof prepareDemoPopulationInput>;
const authInputSchema = z.object({ version: z.literal(1), kind: z.literal('DEMO_AUTH_PLANNED_INPUT'), profileId: z.literal(demoProfileId), profileSha256: z.literal(demoProfileCanonicalSha256), actorSourceSha256: z.literal(actorSourceSha256), actors: z.array(syntheticAuthSeedActorSchema).length(49), accountsExist: z.null(), currentApproval: z.null(), targetProjectRef: z.null(), executionAuthorized: z.literal(false) }).strict();
export type DemoAuthPlannedInput = z.infer<typeof authInputSchema>;
export function prepareDemoAuthInput(value: unknown): DemoAuthPlannedInput {
  const profile = decodeDemoPopulationProfile(value);
  return { version: 1, kind: 'DEMO_AUTH_PLANNED_INPUT', profileId: demoProfileId, profileSha256: demoProfileCanonicalSha256, actorSourceSha256,
    actors: profile.actors, accountsExist: null, currentApproval: null, targetProjectRef: null, executionAuthorized: false };
}
export function decodeDemoAuthInput(value: unknown): DemoAuthPlannedInput {
  try {
    const input = authInputSchema.parse(ownData(value));
    if (hash(canonicalReleaseExecutionJson(input.actors)) !== actorSourceSha256) throw failure();
    return input;
  } catch { throw failure(); }
}

/** Explicit source reads only. The existing curriculum loader verifies all pack
 * artifacts; no curriculum import, seed, Auth or provider function is invoked. */
export async function readDemoPopulationProfile() {
  const source = new URL('../../supabase/seed/demo-population-v1.json', import.meta.url), info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw failure();
  const bytes = await readFile(source);
  if (hash(bytes) !== demoProfileSourceSha256) throw failure();
  const profile = decodeDemoPopulationProfile(JSON.parse(bytes.toString('utf8'))), packBindings = [];
  const root = fileURLToPath(new URL('../../supabase/seed/curriculum/', import.meta.url));
  for (const school of profile.schools) {
    const selection = school.curriculum; if (!selection) continue;
    const manifestBytes = await readFile(new URL('../../supabase/seed/curriculum/' + selection.packDirectory + '/manifest.json', import.meta.url));
    if (hash(manifestBytes) !== selection.packManifestSha256) throw failure();
    const bundle = await loadLockedPack(root, selection.packDirectory);
    if (canonicalReleaseExecutionJson(bundle.manifest) !== canonicalReleaseExecutionJson(JSON.parse(manifestBytes.toString('utf8'))) || bundle.pack.packId !== selection.packId || bundle.pack.version !== selection.version || bundle.pack.framework !== selection.framework || bundle.manifest.files['assessment.json'] !== selection.assessmentArtifactSha256 || !bundle.assessment.models.includes(selection.assessmentModel)) throw failure();
    if (bundle.assessment.numeric.maxScore !== 10 || bundle.assessment.numeric.normalization !== null || bundle.assessment.rubric.criteria.map(row => row.key).join(',') !== 'explanation,checking') throw failure();
    packBindings.push({ schoolId: school.schoolId, country: school.country, packId: selection.packId, version: selection.version, assessmentModel: selection.assessmentModel,
      numeric: bundle.assessment.numeric, rubricCriteria: bundle.assessment.rubric.criteria.map(row => row.key), customerReady: false as const, productionApproved: false as const });
  }
  return { profile, profileSha256: demoProfileCanonicalSha256, sourceSha256: demoProfileSourceSha256, packBindings };
}
