import{execFileSync}from'node:child_process';
import{readFileSync,lstatSync}from'node:fs';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{assertCuevoLocalConfig,assertCuevoLocalTarget,type LocalStatus}from'../configure-local';
import{validateOutageDatabaseContainer}from'../verification/runtime-outage-rules';
import{requireWorkerTransportFixtureTarget,requireWorkerTransportFixtureSource,workerTransportFixtureReceipt,workerTransportFixture,workerTransportFixtureContainer}from'./worker-transport-fixture-policy';

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
  const path=resolve(root,workerTransportFixture);if(lstatSync(resolve(root,'scripts/database/test-fixtures')).isSymbolicLink()||lstatSync(path).isSymbolicLink())throw Error('Fixture path cannot be redirected.');
  const sql=readFileSync(path,'utf8');requireWorkerTransportFixtureSource(sql);
  const output=execFileSync('docker',['exec','-i',workerTransportFixtureContainer,'psql','-X','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:2_000_000,windowsHide:true});
  console.log(JSON.stringify(workerTransportFixtureReceipt(output)));
 }catch{throw Error('Local provider transport fixture failed or was unavailable; private diagnostics withheld.');}
}
