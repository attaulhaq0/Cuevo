import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostedChildCatalogueCategories, hostedChildCatalogueSummarySchema, applySourceChildCatalogueProviderDeltas, parseHostedChildCatalogueReceipt } from './hosted-child-catalogue-reference';
import policy from './unknown-prefix-catalogue-policy.json';

test('child catalogue summary requires every exact category once in canonical order and remains small', () => {
 const value={version:'CUEVO_SCHEMA_CATALOGUE_V1',serverVersion:170011,sha256:'a'.repeat(64),rows:16,bytes:160,categories:hostedChildCatalogueCategories.map(category=>({category,count:1,sha256:'a'.repeat(64)}))};
 assert.equal(hostedChildCatalogueSummarySchema.parse(value).categories.length,16);
 for(const mutation of [()=>({...value,categories:value.categories.slice(1)}),()=>({...value,categories:[...value.categories].reverse()}),()=>({...value,categories:[...value.categories.slice(1),value.categories[1]]}),()=>({...value,rows:17}),()=>({...value,serverVersion:170012}),()=>({...value,privateRows:[]})])assert.equal(hostedChildCatalogueSummarySchema.safeParse(mutation()).success,false);
 assert.ok(Buffer.byteLength(JSON.stringify(value))<49152);
});

test('source child delta transform refuses missing, changed, duplicate or already transformed authority rows', () => {
 const rows=policy.exactProviderDeltas.filter(delta=>delta.expected!==null).map(delta=>delta.expected);
 for(const mutated of [rows,rows.slice(1),[...rows,rows[0]],policy.exactProviderDeltas.filter(delta=>delta.observed!==null).map(delta=>delta.observed)])assert.throws(()=>applySourceChildCatalogueProviderDeltas(mutated),/requires review/);
});

test('exact provider transform applies each reviewed replacement and preserves unrelated runtime authority',()=>{
 const role=(name:string)=>({category:'role',key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:true,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}});
 const schemas=['app','authorization','internal'].map(name=>({category:'schema',key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}}));
 const input=[...schemas,role('cuevo_api'),role('cuevo_worker'),...policy.exactProviderDeltas.filter(delta=>delta.expected!==null).map(delta=>delta.expected)];
 const observed=applySourceChildCatalogueProviderDeltas(input);
 assert.deepEqual(observed.rows.filter(row=>row.category==='schema'),schemas);
 assert.ok(observed.rows.some(row=>row.category==='role'&&row.facts.name==='cuevo_api'));
 for(const delta of policy.exactProviderDeltas)assert.deepEqual(observed.rows.find(row=>row.category+':'+row.key===delta.id)??null,delta.observed);
 for(const mode of ['missing','changed','duplicate','insert-present']){const rows=structuredClone(input);if(mode==='missing')rows.pop();if(mode==='changed')(rows.at(-1)!.facts as Record<string,unknown>).config=['search_path=public'];if(mode==='duplicate')rows.push(rows.at(-1)!);if(mode==='insert-present')rows.push(policy.exactProviderDeltas.at(-1)!.observed as typeof rows[number]);assert.throws(()=>applySourceChildCatalogueProviderDeltas(rows),/requires review/,mode);}
});

test('catalogue receipt refuses user baselines, raw catalogue rows and missing source or cleanup identities',()=>{
 for(const value of [{},{version:1,purpose:'CUEVO_SOURCE_CHILD144_CATALOGUE',catalogue:{rows:[]}},{hostedAcceptance:true},{cleanupConfirmed:false}])assert.throws(()=>parseHostedChildCatalogueReceipt(value),/requires review/);
});
