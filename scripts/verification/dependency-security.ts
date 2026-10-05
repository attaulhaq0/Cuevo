import{spawnSync}from'node:child_process';
import{existsSync}from'node:fs';
import{createRequire}from'node:module';
import{dirname,resolve}from'node:path';
import{auditArguments,dependencyAuditResult,type AuditScope}from'./dependency-security-policy';
const require=createRequire(import.meta.url);
const candidates=[process.env.npm_execpath,resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
let npmCli=candidates.find(path=>path&&path.endsWith('npm-cli.js')&&existsSync(path));
if(!npmCli){try{npmCli=require.resolve('npm/bin/npm-cli.js');}catch{throw Error('Installed npm audit runtime is unavailable.');}}
for(const scope of ['build-and-runtime','runtime']as AuditScope[]){
 const result=spawnSync(process.execPath,[npmCli,...auditArguments(scope)],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000,windowsHide:true});
 if(result.error||result.signal)throw Error('Dependency security scan did not complete.');
 console.log(JSON.stringify(dependencyAuditResult(scope,result.stdout,result.status)));
}
