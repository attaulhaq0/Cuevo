import{execFileSync}from'node:child_process';
import{readFileSync,lstatSync}from'node:fs';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{assertCuevoLocalConfig,assertCuevoLocalTarget,type LocalStatus}from'../configure-local';
import{validateOutageDatabaseContainer}from'../verification/runtime-outage-rules';
import{requireWorkerTransportFixtureTarget,requireWorkerTransportFixtureSource,workerTransportFixtureReceipt,workerTransportFixture,workerTransportFixtureContainer}from'./worker-transport-fixture-policy';
import { initialRuntimeRolesSql } from './hosted-runtime-role-membership';

/** Explicit local test tooling only; never a migration or runtime credential path. */
export function runWorkerTransportFixtures(){
 try{
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),cli=resolve(root,'node_modules/supabase/dist/supabase.js');
  const status=JSON.parse(execFileSync(process.execPath,[cli,'status','-o','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000,maxBuffer:2_000_000,windowsHide:true}))as LocalStatus;
  const config=readFileSync(resolve(root,'supabase/config.toml'),'utf8');
  const container=JSON.parse(execFileSync('docker',['inspect',workerTransportFixtureContainer],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000,maxBuffer:2_000_000,windowsHide:true}))[0];
  assertCuevoLocalConfig(config);assertCuevoLocalTarget(status);validateOutageDatabaseContainer(container);
  const identitySql="select json_build_object('database',current_database(),'sessionUser',session_user,'currentUser',current_user,'version',current_setting('server_version_num')::integer);";
  const identity=JSON.parse(execFileSync('docker',['exec',workerTransportFixtureContainer,'psql','-X','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',identitySql],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000,maxBuffer:100000,windowsHide:true}));
  requireWorkerTransportFixtureTarget(config,status,container,identity);
  // Existing runtime logins are restored by rollback. Exercise the actual
  // canonical and managed pg_auth_members rows in this admitted CI database.
  const roleCases=[
   ['foreign-inbound-member','create role cuevo_foreign_membership_fixture; grant cuevo_api to cuevo_foreign_membership_fixture;','revoke cuevo_api from cuevo_foreign_membership_fixture; drop role cuevo_foreign_membership_fixture;'],
   ['runtime-role-parent','create role cuevo_parent_membership_fixture; grant cuevo_parent_membership_fixture to cuevo_api;','revoke cuevo_parent_membership_fixture from cuevo_api; drop role cuevo_parent_membership_fixture;'],
   ['owner-inheritance','grant cuevo_api to postgres with inherit true;','grant cuevo_api to postgres with inherit false;'],
   ['managed-set-access','grant cuevo_worker to postgres with set true;','grant cuevo_worker to postgres with set false;'],
   ['already-configured-login','alter role cuevo_api login;','alter role cuevo_api nologin;'],
   ['runtime-bypassrls','alter role cuevo_worker bypassrls;','alter role cuevo_worker nobypassrls;'],
  ] as const;
  const roleSql=`begin;\nset local search_path=extensions,pg_catalog;\nselect plan(${roleCases.length+1});\nalter role cuevo_api nologin;\nalter role cuevo_worker nologin;\nselect is((${initialRuntimeRolesSql}),true,'canonical and managed owner memberships');\n${roleCases.map(([label,change,restore])=>`${change}\nselect is((${initialRuntimeRolesSql}),false,'${label}');\n${restore}`).join('\n')}\nselect * from finish();\nrollback;\n`;
  requireWorkerTransportFixtureSource(roleSql);
  const roleOutput=execFileSync('docker',['exec','-i',workerTransportFixtureContainer,'psql','-X','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:roleSql,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,maxBuffer:100000,windowsHide:true});
  const roleLines=roleOutput.split(/\r?\n/).map(line=>line.trim()),roleAssertions=roleLines.filter(line=>/^ok \d+\b/.test(line));
  if(roleLines.some(line=>/^not ok\b|^ERROR:|^FATAL:|^Bail out!|^# Looks like/i.test(line))||roleLines.filter(line=>line===`1..${roleCases.length+1}`).length!==1||roleAssertions.length!==roleCases.length+1||roleAssertions.some((line,index)=>Number(line.match(/^ok (\d+)/)![1])!==index+1))throw Error('Complete native role membership assertions required.');
  console.log(JSON.stringify({check:'runtime-role-memberships',assertions:roleAssertions.length,status:'PASSED'}));
  const path=resolve(root,workerTransportFixture);if(lstatSync(resolve(root,'scripts/database/test-fixtures')).isSymbolicLink()||lstatSync(path).isSymbolicLink())throw Error('Fixture path cannot be redirected.');
  const sql=readFileSync(path,'utf8');requireWorkerTransportFixtureSource(sql);
  const output=execFileSync('docker',['exec','-i',workerTransportFixtureContainer,'psql','-X','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:2_000_000,windowsHide:true});
  console.log(JSON.stringify(workerTransportFixtureReceipt(output)));
 }catch{throw Error('Local provider transport fixture failed or was unavailable; private diagnostics withheld.');}
}
