import assert from 'node:assert/strict';
import test from 'node:test';
import policy from './unknown-prefix-catalogue-policy.json';
import {verifyUnknownPrefixCataloguePolicy,verifyUnknownPrefixCatalogueSummary} from './hosted-schema-reconciliation-policy';
const summary={version:'CUEVO_SCHEMA_CATALOGUE_V1',sha256:policy.expected.catalogueSha256,categories:policy.expected.categories,bytes:policy.expected.bytes,rows:policy.expected.rows};
test('the exact123 completion summary is distinct from the original partial receipt',()=>{const completed={version:'CUEVO_SCHEMA_CATALOGUE_V1',sha256:policy.completedPrefix.expected.catalogueSha256,categories:policy.completedPrefix.expected.categories,bytes:policy.completedPrefix.expected.bytes,rows:policy.completedPrefix.expected.rows};assert.equal(verifyUnknownPrefixCatalogueSummary(completed,170011,123).catalogueSha256,'b703b1064c03905a896c9fb7c5690097369ded7afef293bbf60e5b91c4632b7f');assert.throws(()=>verifyUnknownPrefixCatalogueSummary(completed,170011,120));assert.throws(()=>verifyUnknownPrefixCatalogueSummary({...completed,rows:completed.rows-1},170011,123));assert.throws(()=>verifyUnknownPrefixCatalogueSummary({...completed,categories:completed.categories.map(row=>row.category==='function'?{...row,sha256:'0'.repeat(64)}:row)},170011,123));});
test('fixed source-owned catalogue summary refuses changed coverage roles bytes or runtime',()=>{
 const result=verifyUnknownPrefixCatalogueSummary(summary,170011);assert.equal(result.catalogueSha256,policy.expected.catalogueSha256);assert.equal(result.hostedAcceptance,false);assert.equal(result.evidence,'SUPPLIED_FIXED_CATALOGUE_SUMMARY_ONLY');
 for(const changed of[{...summary,sha256:'0'.repeat(64)},{...summary,categories:summary.categories.slice(1)},{...summary,categories:summary.categories.map((row,index)=>index?row:{...row,count:row.count-1})},{...summary,bytes:summary.bytes-1},{...summary,rows:summary.rows-1},{...summary,nativeVerified:true}])assert.throws(()=>verifyUnknownPrefixCatalogueSummary(changed,170011));
 assert.throws(()=>verifyUnknownPrefixCatalogueSummary(summary,170010));assert.throws(()=>verifyUnknownPrefixCataloguePolicy([],170011));
});
