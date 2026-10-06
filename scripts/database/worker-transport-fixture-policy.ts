import {assertCuevoLocalConfig,assertCuevoLocalTarget,type LocalStatus}from'../configure-local';
import{validateOutageDatabaseContainer}from'../verification/runtime-outage-rules';

export const workerTransportFixture='scripts/database/test-fixtures/worker-transport-trust.sql';
export const workerTransportFixtureContainer='supabase_db_cuevo';
export const workerTransportFixtureAssertions=175;
export function requireWorkerTransportFixtureTarget(config:string,status:LocalStatus,container:unknown,identity:unknown){
 assertCuevoLocalConfig(config);assertCuevoLocalTarget(status);validateOutageDatabaseContainer(container);
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||!('database'in identity)||identity.database!=='postgres'||!('sessionUser'in identity)||identity.sessionUser!=='supabase_admin'||!('currentUser'in identity)||identity.currentUser!=='supabase_admin'||!('version'in identity)||typeof identity.version!=='number'||!Number.isInteger(identity.version)||identity.version<170000||identity.version>=180000)throw Error('Exact local provider fixture SQL identity required.');
}
export function requireWorkerTransportFixtureSource(sql:string){
 if(!/^begin;\s/i.test(sql)||!/(?:^|\n)rollback;\s*$/i.test(sql)||/\bcommit\s*;|\b(?:net\.http_(?:post|get|delete)|vault\.(?:create_secret|update_secret))\s*\(/i.test(sql)||/select\s+\*\s*from\s+(?:vault\.|net\.)/i.test(sql))throw Error('Provider fixture must be rollback-only and contain no secret or network execution.');
}
export function workerTransportFixtureReceipt(stdout:string){
 const lines=stdout.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(lines.some(line=>/^not ok\b|^ERROR:|^FATAL:|^Bail out!/i.test(line)))throw Error('Local provider fixture reported a failed SQL assertion.');
 const assertions=lines.filter(line=>/^ok \d+\b/.test(line));
 const plans=lines.filter(line=>/^1\.\.\d+$/.test(line));
 if(plans.length!==1||Number(plans[0]!.slice(3))!==workerTransportFixtureAssertions||assertions.length!==workerTransportFixtureAssertions||assertions.some((line,index)=>Number(line.match(/^ok (\d+)/)![1])!==index+1))throw Error('Complete local provider fixture TAP evidence required.');
 return {check:'worker-transport-trust',assertions:assertions.length,status:'PASSED' as const};
}
