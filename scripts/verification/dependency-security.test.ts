import assert from 'node:assert/strict';
import test from 'node:test';
import { auditArguments, dependencyAuditResult } from './dependency-security-policy';

const report=(counts:Record<string,number>={})=>JSON.stringify({metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0,...counts}}});
test('build tools and runtime dependencies both have required moderate-or-higher audit scope',()=>{
 assert.deepEqual(auditArguments('build-and-runtime'),['audit','--json','--audit-level=moderate']);
 assert.deepEqual(auditArguments('runtime'),['audit','--omit=dev','--json','--audit-level=moderate']);
 assert.deepEqual(dependencyAuditResult('build-and-runtime',report(),0),{check:'dependency-security',scope:'build-and-runtime',info:0,low:0,moderate:0,high:0,critical:0,total:0});
 for(const severity of ['moderate','high','critical'])assert.throws(()=>dependencyAuditResult('build-and-runtime',report({[severity]:1,total:1}),1));
});
test('missing malformed partial or inconsistent advisory results are unavailable, never clean',()=>{
 for(const value of ['', 'null','{}',JSON.stringify({error:{message:'private'}}),JSON.stringify({metadata:{vulnerabilities:{high:0}}}),report({high:-1,total:-1}),report({high:0.5,total:0.5}),report({total:1})]){
  assert.throws(()=>dependencyAuditResult('runtime',value,0),error=>error instanceof Error&&!error.message.includes('private'));
 }
 for(const code of [null,1,2])assert.throws(()=>dependencyAuditResult('runtime',report(),code));
});
test('low advisory counts are reported with threshold distinction and no raw report content',()=>{
 const value=JSON.parse(report({low:1,total:1}));value.vulnerabilities={privatePackage:{name:'private package',via:['credential-string']}};
 const result=dependencyAuditResult('runtime',JSON.stringify(value),0);assert.equal(result.low,1);assert.equal(result.total,1);assert.ok(!JSON.stringify(result).includes('credential-string'));
});
