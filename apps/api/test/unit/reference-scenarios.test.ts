import{describe,it,expect}from'vitest';import{fixtureId,validateFixtureDatabase,scenarioLearners,referenceScenarioScores}from'../../../../scripts/seed-reference-scenarios';
describe('guarded deterministic reference seed',()=>{
 it('refuses hosted or unrelated database targets before any source write',()=>{for(const url of['postgres://postgres:secret@remote.invalid:5432/postgres','postgres://postgres:local@127.0.0.1:54322/postgres','https://127.0.0.1:56322/postgres'])expect(()=>validateFixtureDatabase(url)).toThrow();expect(validateFixtureDatabase('postgresql://cuevo_api:local@127.0.0.1:56322/postgres').port).toBe('56322');});
 it.each([
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres?host=remote.invalid',
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres?port=5432',
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres?user=another_role',
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres?password=another_password',
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres?options=-c%20search_path%3Dpublic',
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres#another-target',
  'postgresql://cuevo_api:local@127.0.0.1:56322/another_database',
  'postgresql://cuevo_api:local@127.0.0.1:56322/',
 ])('rejects connection overrides or a different database before Pool construction: %s',url=>{
  expect(()=>validateFixtureDatabase(url)).toThrow('Reference fixtures require the guarded local Cuevo database.');
 });
 it.each([
  'postgresql://cuevo_api:local@127.0.0.1:56322/postgres',
  'postgres://cuevo_worker:local@localhost:56322/postgres',
  'postgresql://postgres:local@127.0.0.1:56322/postgres',
 ])('preserves an exact local database URL and its existing role variant: %s',url=>{
  expect(validateFixtureDatabase(url).toString()).toBe(url);
 });
 it('keeps every source77 learner case distinct and missing work separate from zero',()=>{expect(Object.values(scenarioLearners)).toEqual([12,18,24,30,36,42,48]);expect(referenceScenarioScores.D).toEqual([null,null,null]);expect(referenceScenarioScores.E).toEqual([3,7]);expect(referenceScenarioScores.F).toEqual([3,3]);const ids=Array.from({length:50},(_,index)=>fixtureId(4,index+1));expect(new Set(ids).size).toBe(50);expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);});
});

