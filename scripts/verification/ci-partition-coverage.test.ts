import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash}from'node:crypto';
import {statelessVerificationSteps} from './steps';
import {criticalIntegrationFiles, fullIntegrationFiles} from './verification-profiles';
const root=resolve(import.meta.dirname,'../..');
async function subject(){let value:Record<string,unknown>={};try{value=await import(pathToFileURL(resolve(import.meta.dirname,'ci-partition-coverage.ts')).href);}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof value.readCiPartitionCoverage,'function','fixed CI partition union guard must exist');return value as typeof import('./ci-partition-coverage');}

test('fixed conservative partitions cover every original source and integration file exactly once',async()=>{
 const api=await subject(),coverage=api.readCiPartitionCoverage(root);
 const source=statelessVerificationSteps.flatMap(step=>[...step.args].filter(path=>path.endsWith('.test.ts'))).sort(),integration=fullIntegrationFiles();
 assert.deepEqual(coverage.source.flatMap(part=>part.files).sort(),source);assert.deepEqual(coverage.integration.flatMap(part=>part.files).sort(),integration);
 assert.equal(coverage.source.length,3);assert.equal(coverage.integration.length,2);assert.equal(coverage.effectAuthority,false);assert.equal(coverage.timeTargetAchieved,false);
 assert.deepEqual((coverage as unknown as {nonTestChecks:unknown}).nonTestChecks,statelessVerificationSteps.filter(step=>!(step.args as readonly string[]).includes('--test')).map(step=>({name:step.name,commandSha256:createHash('sha256').update(JSON.stringify([...step.args])).digest('hex')})));
 const heavyOwners=['scripts/database/hosted-schema-reconciliation-executor.test.ts','scripts/database/hosted-schema-continuation-native.test.ts','scripts/verification/backend-release-prepare.test.ts'];
 assert.equal(new Set(heavyOwners.map(path=>coverage.source.find(part=>part.files.includes(path))?.id)).size,3,'large native, continuation and package fixtures need independent whole-file owners');
 for(const part of coverage.integration)assert.deepEqual(api.ciPartitionFiles(coverage,'integration',part.id,'critical'),part.files.filter(path=>(criticalIntegrationFiles as readonly string[]).includes(path)));
 assert.match(coverage.manifestSha256,/^[a-f0-9]{64}$/);
 const measured=coverage.integration.map(part=>part.files.map(path=>coverage.measurements.integration.find(row=>row.path===path)?.durationMs??0).reduce((sum,time)=>sum+time,0));
 assert.ok(Math.abs(measured[0]-measured[1])<10000,'known whole-file measurements must balance rather than alphabetical halves');
 assert.equal(coverage.measurements.source.every(row=>row.durationMs===null),true,'unknown file measurements stay unknown');
});

test('missing duplicate unknown partition and wrong-scope substitutions cannot certify coverage',async()=>{
 const api=await subject(),coverage=api.readCiPartitionCoverage(root),original=JSON.parse(await readFile(resolve(root,'scripts/verification/ci-partitions.json'),'utf8'));
 const source=coverage.source.flatMap(part=>part.files).sort(),integration=coverage.integration.flatMap(part=>part.files).sort();
 for(const mode of ['missing-partition','duplicate-partition','missing-file','duplicate-file','unknown-file','wrong-scope','extra-field','unknown-exclusion']){
  const changed=structuredClone(original);if(mode==='missing-partition')changed.source.pop();if(mode==='duplicate-partition')changed.source[1].id=changed.source[0].id;if(mode==='missing-file')changed.integration[0].files.pop();if(mode==='duplicate-file')changed.source[1].files.push(changed.source[0].files[0]);if(mode==='unknown-file')changed.integration[0].files.push('apps/api/test/integration/unreviewed.test.ts');if(mode==='wrong-scope')changed.source[0].files[0]=integration[0];if(mode==='extra-field')changed.skipUnknown=true;
  if(mode==='unknown-exclusion')changed.separateSource.push({file:'scripts/verification/unreviewed.test.ts',reason:'SEPARATE_PILOT_ACCEPTANCE'});
  assert.throws(()=>api.validateCiPartitionCoverage(changed,{sourceFiles:source,integrationFiles:integration,criticalFiles:[...criticalIntegrationFiles]}),mode);
 }
 assert.throws(()=>api.ciPartitionFiles(coverage,'source','unknown','full'));assert.throws(()=>api.ciPartitionFiles(coverage,'source',coverage.source[0].id,'critical'));
 for(const mode of ['missing-checks','wrong-check','extra-check','wrong-command']){const changed=structuredClone(original);if(mode==='missing-checks')delete changed.nonTestChecks;if(mode==='wrong-check')changed.nonTestChecks[0].name='invented';if(mode==='extra-check')changed.nonTestChecks.push(changed.nonTestChecks[0]);if(mode==='wrong-command')changed.nonTestChecks[0].commandSha256='a'.repeat(64);assert.throws(()=>api.validateCiPartitionCoverage(changed,{sourceFiles:source,integrationFiles:integration,criticalFiles:[...criticalIntegrationFiles]}),mode);}
 const changed=structuredClone(coverage);changed.source[0].files.push(changed.source[1].files[0]);assert.throws(()=>api.ciPartitionFiles(changed,'source',changed.source[0].id,'full'));
 const swapped=structuredClone(coverage),first=swapped.integration[0].files[0],second=swapped.integration[1].files[0];swapped.integration[0].files[0]=second;swapped.integration[1].files[0]=first;for(const part of swapped.integration)part.files.sort();assert.throws(()=>api.ciPartitionFiles(swapped,'integration',swapped.integration[0].id,'full'),'same union must not authorize caller-reassigned partitions');
});

test('actual filesystem discovery refuses hidden new tests and missing registered files',async()=>{
 const api=await subject(),directory=await mkdtemp(join(tmpdir(),'cuevo-ci-coverage-'));
 try{
  await mkdir(join(directory,'scripts/verification'),{recursive:true});await mkdir(join(directory,'apps/api/test/integration'),{recursive:true});
  const fixture={version:1,purpose:'CUEVO_FIXED_CI_PARTITIONS',source:[{id:'source-native',files:['scripts/verification/a.test.ts']},{id:'source-contracts',files:['scripts/verification/b.test.ts']},{id:'source-delivery',files:['scripts/verification/c.test.ts']}],integration:[{id:'integration-learning',files:['apps/api/test/integration/a.test.ts']},{id:'integration-state',files:['apps/api/test/integration/b.test.ts']}],nonTestChecks:statelessVerificationSteps.filter(step=>!(step.args as readonly string[]).includes('--test')).map(step=>({name:step.name,commandSha256:createHash('sha256').update(JSON.stringify([...step.args])).digest('hex')})),separateSource:[],separateIntegration:[],measurements:{source:[],integration:[],provenance:{sourceSha:'a'.repeat(40),runId:'51',runAttempt:1,basis:'ORIGINAL_CASE_FILE_DURATION'}}};
  for(const path of [...fixture.source,...fixture.integration].flatMap(part=>part.files))await writeFile(join(directory,path),'// controlled authored owner\n');
  fixture.measurements.source=fixture.source.flatMap(part=>part.files).map(path=>({path,durationMs:null})) as never[];fixture.measurements.integration=fixture.integration.flatMap(part=>part.files).map(path=>({path,durationMs:null})) as never[];
  const expected={sourceFiles:fixture.source.flatMap(part=>part.files),integrationFiles:fixture.integration.flatMap(part=>part.files),criticalFiles:[fixture.integration[0].files[0]]};
 assert.doesNotThrow(()=>api.validateCiPartitionDiscovery(directory,fixture,expected));
  await writeFile(join(directory,'apps/api/test/integration/hidden.test.ts'),'// new authored owner\n');assert.throws(()=>api.validateCiPartitionDiscovery(directory,fixture,expected));await rm(join(directory,'apps/api/test/integration/hidden.test.ts'));
  await writeFile(join(directory,'scripts/verification/hidden.test.ts'),'// new authored source test\n');assert.throws(()=>api.validateCiPartitionDiscovery(directory,fixture,expected));await rm(join(directory,'scripts/verification/hidden.test.ts'));
  await rm(join(directory,fixture.source[0].files[0]));assert.throws(()=>api.validateCiPartitionDiscovery(directory,fixture,expected));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('manifest descriptor traps private fields and forged measurement identities are refused',async()=>{
 const api=await subject(),coverage=api.readCiPartitionCoverage(root),manifest=JSON.parse(await readFile(resolve(root,'scripts/verification/ci-partitions.json'),'utf8')),expected={sourceFiles:coverage.source.flatMap(part=>part.files),integrationFiles:coverage.integration.flatMap(part=>part.files),criticalFiles:[...criticalIntegrationFiles]};
 let traps=0;assert.throws(()=>api.validateCiPartitionCoverage(new Proxy(manifest,{ownKeys(){traps++;return[];}}),expected));assert.throws(()=>api.validateCiPartitionCoverage({...manifest,get source(){traps++;return manifest.source;}},expected));assert.equal(traps,0);
 const changed=structuredClone(manifest);changed.measurements.source[0].durationMs=-1;assert.throws(()=>api.validateCiPartitionCoverage(changed,expected));
 changed.measurements.source[0].durationMs=null;changed.measurements.integration[0].path='apps/api/test/integration/unknown.test.ts';assert.throws(()=>api.validateCiPartitionCoverage(changed,expected));
});
