import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { DemoPopulationProfile } from './demo-population-profile';
import { syntheticAuthSeedReceiptSchema } from '../seed-auth';

const modulePath = './demo-population-profile';
const owner: typeof import('./demo-population-profile') | null = existsSync(new URL('./demo-population-profile.ts', import.meta.url)) ? await import(modulePath) : null;
const profilePath = new URL('../../supabase/seed/demo-population-v1.json', import.meta.url);
const requireOwner = () => { assert.ok(owner, 'The finite demo profile decoder is missing.'); return owner; };
const fixture = (): DemoPopulationProfile => {
  assert.ok(existsSync(profilePath), 'The immutable49-member demo source is missing.');
  return requireOwner().decodeDemoPopulationProfile(JSON.parse(readFileSync(profilePath, 'utf8')));
};
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

test('finite source has exactly three schools,49 members and20 students', () => {
  const p = fixture(); assert.equal(p.schools.length, 3); assert.equal(p.actors.length, 49);
  assert.equal(p.actors.filter(actor => actor.role === 'student').length, 20);
  assert.equal(p.purpose, 'DEMO'); assert.equal(p.synthetic, true);
});
test('both populated schools have exactly the approved24-member role roster', () => {
  const p = fixture();
  for (const school of p.schools.filter(school => school.startingState === 'POPULATED_DEMO')) {
    const actors = p.actors.filter(actor => actor.schoolId === school.schoolId);
    assert.equal(actors.length, 24);
    for (const [role, count] of [['admin', 1], ['coordinator', 1], ['teacher', 2], ['student', 10], ['parent', 10]] as const) assert.equal(actors.filter(actor => actor.role === role).length, count);
  }
});
test('setup school has only its administrator and no curriculum,quality,class or course defaults', () => {
  const p = fixture(), school = p.schools.find(school => school.startingState === 'ADMIN_ONLY_SETUP')!;
  assert.deepEqual(p.actors.filter(actor => actor.schoolId === school.schoolId).map(actor => actor.role), ['admin']);
  assert.equal(school.curriculum, null); assert.deepEqual(school.qualityFrameworks, []);
  assert.deepEqual(school.initialClasses, []); assert.deepEqual(school.initialCourses, []);
});
test('all20 intended guardian relationships bind one parent and student within the same school', () => {
  const p = fixture(); assert.equal(p.guardianRelationships.length, 20);
  assert.equal(new Set(p.guardianRelationships.map(row => row.studentActorId)).size, 20);
  assert.equal(new Set(p.guardianRelationships.map(row => row.guardianActorId)).size, 20);
  for (const row of p.guardianRelationships) {
    const student = p.actors.find(actor => actor.actorId === row.studentActorId)!, guardian = p.actors.find(actor => actor.actorId === row.guardianActorId)!;
    assert.equal(student.role, 'student'); assert.equal(guardian.role, 'parent');
    assert.equal(student.schoolId, row.schoolId); assert.equal(guardian.schoolId, row.schoolId);
  }
});
test('new school and actor identities do not overlap the original133 reference', () => {
  const p = fixture(), original = JSON.parse(readFileSync(new URL('../../supabase/seed/identities.json', import.meta.url), 'utf8')) as { schoolId: string; denialSchoolId: string; actors: { actorId: string; email: string }[] };
  assert.equal(original.actors.length, 133);
  assert.ok(p.schools.every(school => ![original.schoolId, original.denialSchoolId].includes(school.schoolId)));
  assert.ok(p.actors.every(actor => !original.actors.some(old => old.actorId === actor.actorId || old.email === actor.email)));
});
test('country,curriculum and quality remain separate explicit axes', () => {
  const p = fixture(), populated = p.schools.filter(school => school.startingState === 'POPULATED_DEMO');
  assert.deepEqual(populated.map(school => school.country), ['QA', 'PK']);
  assert.deepEqual(populated.map(school => school.curriculum!.assessmentModel), ['numeric', 'rubric']);
  assert.ok(populated.every(school => school.curriculum!.framework === 'School Custom' && school.qualityFrameworks.length === 0));
});
test('locked source preparation verifies both existing packs and actual numeric/rubric rules', async () => {
  const p = await requireOwner().readDemoPopulationProfile();
  assert.equal(p.profile.actors.length, 49); assert.equal(p.packBindings.length, 2);
  assert.deepEqual(p.packBindings.map(binding => binding.assessmentModel), ['numeric', 'rubric']);
  assert.deepEqual(p.packBindings[0].numeric, { maxScore: 10, normalization: null });
  assert.deepEqual(p.packBindings[1].rubricCriteria, ['explanation', 'checking']);
  assert.ok(p.packBindings.every(binding => binding.customerReady === false && binding.productionApproved === false));
});
test('population preparation describes planned counts and leaves effects and installed state unproved', () => {
  const descriptor = requireOwner().prepareDemoPopulationInput(fixture());
  assert.equal(descriptor.kind, 'DEMO_POPULATION_PLANNED_INPUT'); assert.equal(descriptor.plannedSchoolCount, 3); assert.equal(descriptor.plannedMemberCount, 49);
  assert.equal(descriptor.executionAuthorized, false); assert.equal(descriptor.populationInstalled, null); assert.equal(descriptor.currentApproval, null);
  assert.equal(descriptor.targetProjectRef, null); assert.equal(descriptor.targetSelection, 'PROPOSE_EXISTING_UNUSED_STAGING_REQUIRES_FRESH_NATIVE_CHECKS');
});
test('Auth preparation is exactly49 bound planned identities and no completion receipt', () => {
  const input = requireOwner().prepareDemoAuthInput(fixture());
  assert.equal(input.kind, 'DEMO_AUTH_PLANNED_INPUT'); assert.equal(input.actors.length, 49); assert.equal(input.accountsExist, null); assert.equal(input.executionAuthorized, false);
  assert.deepEqual(requireOwner().decodeDemoAuthInput(input), input);
  assert.equal(syntheticAuthSeedReceiptSchema.safeParse(input).success, false);
});
test('existing hosted owners forward the same pure preparation functions', async () => {
  const profileOwner = requireOwner();
  const [population, auth] = await Promise.all([import('./hosted-synthetic-population'), import('./hosted-synthetic-auth')]);
  assert.equal(population.prepareHostedDemoPopulationInput, profileOwner.prepareDemoPopulationInput);
  assert.equal(auth.prepareHostedDemoAuthInput, profileOwner.prepareDemoAuthInput);
  assert.equal(population.prepareHostedDemoPopulationInput(fixture()).populationInstalled, null);
  assert.equal(auth.prepareHostedDemoAuthInput(fixture()).accountsExist, null);
});
test('original133 Auth receipt decoder preserves its own shape and rejects mixed-profile actors', () => {
  const original = JSON.parse(readFileSync(new URL('../../supabase/seed/identities.json', import.meta.url), 'utf8')) as { actors: { actorId: string; email: string }[] };
  const actors = original.actors.map(actor => ({ actorId: actor.actorId, emailSha256: sha(actor.email), state: 'NOT_ATTEMPTED' }));
  const receipt = { version: 1, evidence: 'SOURCE_LOCKED_SYNTHETIC_AUTH_ATTEMPTS', status: 'OUTCOME_UNKNOWN', manifestSha256: 'a'.repeat(64), originalKey: 'SIMULATED_ORIGINAL_REFERENCE_KEY', created: 0, actors };
  assert.deepEqual(syntheticAuthSeedReceiptSchema.parse(receipt), receipt);
  const planned = requireOwner().prepareDemoAuthInput(fixture());
  assert.equal(syntheticAuthSeedReceiptSchema.safeParse({ ...receipt, actors: [...actors, ...planned.actors] }).success, false);
});
test('mixed133+49 and partial or extra demo actors are refused', () => {
  const p = fixture(), old = JSON.parse(readFileSync(new URL('../../supabase/seed/identities.json', import.meta.url), 'utf8')) as { actors: unknown[] };
  for (const actors of [[...p.actors, ...old.actors], p.actors.slice(1), [...p.actors, p.actors[0]]]) assert.throws(() => requireOwner().decodeDemoPopulationProfile({ ...p, actors }));
});
test('duplicate actor,email and wrong-school guardian bindings are refused', () => {
  for (const mutate of [(p: DemoPopulationProfile) => { p.actors[1].actorId = p.actors[0].actorId; }, (p: DemoPopulationProfile) => { p.actors[1].email = p.actors[0].email; },
    (p: DemoPopulationProfile) => { p.guardianRelationships[0].guardianActorId = p.actors.find(actor => actor.schoolId === p.schools[1].schoolId && actor.role === 'parent')!.actorId; }]) {
    const p = fixture(); mutate(p); assert.throws(() => requireOwner().decodeDemoPopulationProfile(p));
  }
});
test('source changes and borrowed national or quality claims are refused', () => {
  const p = fixture();
  assert.throws(() => requireOwner().decodeDemoPopulationProfile({ ...p, profileId: 'UNREVIEWED_PROFILE' }));
  p.schools[0].curriculum!.framework = 'Official national framework'; assert.throws(() => requireOwner().decodeDemoPopulationProfile(p));
  const changed = fixture(); changed.schools[0].qualityFrameworks.push('QNSA'); assert.throws(() => requireOwner().decodeDemoPopulationProfile(changed));
});
test('setup school cannot borrow learner,course,class or curriculum defaults', () => {
  const p = fixture(), index = p.schools.findIndex(school => school.startingState === 'ADMIN_ONLY_SETUP');
  const changed = structuredClone(p); changed.schools[index].curriculum = changed.schools[0].curriculum;
  assert.throws(() => requireOwner().decodeDemoPopulationProfile(changed));
  assert.throws(() => requireOwner().decodeDemoPopulationProfile({ ...p, schools: p.schools.map((school, i) => i === index ? { ...school, initialClasses: [{ name: 'UNAPPROVED_CLASS' }] } : school) }));
});
test('Auth planned input cannot be relabelled,borrow original133 actors or grant execution', () => {
  const input = requireOwner().prepareDemoAuthInput(fixture());
  for (const value of [{ ...input, executionAuthorized: true }, { ...input, accountsExist: true }, { ...input, profileSha256: 'f'.repeat(64) }, { ...input, actors: input.actors.slice(1) }]) assert.throws(() => requireOwner().decodeDemoAuthInput(value));
});
test('getters,proxies and custom array prototypes cannot supply profile evidence', () => {
  const p = fixture(); let touched = 0;
  Object.defineProperty(p, 'actors', { enumerable: true, get() { touched++; throw Error('PRIVATE_GETTER'); } });
  assert.throws(() => requireOwner().decodeDemoPopulationProfile(p));
  assert.throws(() => requireOwner().decodeDemoPopulationProfile(new Proxy({}, { ownKeys() { touched++; return []; } })));
  const inherited = fixture(); Object.setPrototypeOf(inherited.actors, Object.create(Array.prototype, { map: { get() { touched++; return Array.prototype.map; } } }));
  assert.throws(() => requireOwner().decodeDemoPopulationProfile(inherited)); assert.equal(touched, 0);
});
test('profile decoder preserves supplied data and source pins without clocks or credentials', () => {
  const p = fixture(), before = JSON.stringify(p), descriptor = requireOwner().prepareDemoPopulationInput(p);
  assert.equal(JSON.stringify(p), before); assert.equal(descriptor.profileSha256, requireOwner().demoProfileCanonicalSha256);
  assert.equal(sha(readFileSync(profilePath)), requireOwner().demoProfileSourceSha256);
  assert.equal(Object.hasOwn(descriptor, 'observedAt'), false); assert.equal(Object.hasOwn(descriptor, 'password'), false);
});
