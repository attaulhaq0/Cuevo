import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeHostedSchemaCatalogue, compareHostedSchemaCatalogue, hostedSchemaCatalogueAuthoritySql, hostedSchemaCatalogueStructuralSql } from './hosted-schema-catalogue';
const schema = { category: 'schema', key: '["app"]', facts: { name: 'app', owner: 'postgres', acl: null } };
const relation = { category: 'relation', key: '["app","schools"]', facts: { schema: 'app', name: 'schools', kind: 'r', persistence: 'p', accessMethod: 'heap', tablespace: null, isPartition: false, populated: true, owner: 'postgres', acl: [], rls: true, forceRls: true, replicaIdentity: 'd', options: null, partitionKey: null, partitionBound: null, definition: null, parents: [] } };
const fn = {category:'function',key:'["internal","check","value uuid"]',facts:{schema:'internal',name:'check',owner:'postgres',acl:null,identity:'value uuid',arguments:'value uuid',result:'boolean',kind:'f',language:'sql',definition:'CREATE FUNCTION internal.check(value uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO \'\' AS $$ SELECT true $$',body:' SELECT true ',binary:null,volatility:'s',strict:false,parallel:'u',securityDefiner:true,leakproof:false,cost:'100',rows:'0',support:null,config:['search_path=""']}};
const acl = { grantor:'postgres',grantee:'PUBLIC',privilege:'EXECUTE',grantable:false };

test('catalog proof refuses a changed RLS flag and preserves NULL versus explicit empty ACL', () => {
 const baseline = canonicalizeHostedSchemaCatalogue([schema, relation]);
 assert.equal(compareHostedSchemaCatalogue(baseline.rows, [relation, schema]).matches, true);
 const weakened = structuredClone(relation); weakened.facts.forceRls = false;
 assert.equal(compareHostedSchemaCatalogue(baseline.rows, [schema, weakened]).matches, false);
 const explicit = structuredClone(schema); explicit.facts.acl = [] as never;
 assert.equal(compareHostedSchemaCatalogue(baseline.rows, [explicit, relation]).matches, false);
});

test('exact function body, security, search path, owner and PUBLIC grants affect catalogue proof',()=>{
 for(const [field,value] of [['body',' SELECT false '],['securityDefiner',false],['config',['search_path=public']],['owner','cuevo_api'],['acl',[acl]]]){
  const changed=structuredClone(fn);(changed.facts as Record<string,unknown>)[field as string]=value;
  assert.equal(compareHostedSchemaCatalogue([fn],[changed]).matches,false,String(field));
 }
 const explicit=structuredClone(fn);explicit.facts.acl=[] as never;
 assert.equal(compareHostedSchemaCatalogue([fn],[explicit]).matches,false);
});

test('projection refuses duplicate identities, unknown categories/schemas/fields and unsupported catalogue objects',()=>{
 assert.throws(()=>canonicalizeHostedSchemaCatalogue([schema,schema]));
 for(const changed of [{...schema,category:'future'},{...schema,facts:{...schema.facts,name:'public'}},{...schema,facts:{...schema.facts,oid:99}},{...schema,key:'["internal"]'},{category:'unsupported',key:'["app","x"]',facts:{schema:'app',kind:'operator',name:'x'}}])assert.throws(()=>canonicalizeHostedSchemaCatalogue([changed]));
 assert.throws(()=>canonicalizeHostedSchemaCatalogue(new Proxy([],{get(){throw Error('must never read proxy');}})));
 let read=false;const getter={category:'schema',key:'["app"]',get facts(){read=true;return schema.facts;}};assert.throws(()=>canonicalizeHostedSchemaCatalogue([getter]));assert.equal(read,false);
 const holes=new Array(1);assert.throws(()=>canonicalizeHostedSchemaCatalogue(holes));
});

test('body byte cap refuses multibyte payload rather than accepting the character count',()=>{
 const oversized=structuredClone(fn);oversized.facts.body='ع'.repeat(1024*1024+1);
 assert.throws(()=>canonicalizeHostedSchemaCatalogue([oversized]));
});

test('caller OIDs are refused and ACL order is canonical while grantors stay distinct',()=>{
 const first=structuredClone(fn);first.facts.acl=[acl,{...acl,grantee:'cuevo_api'}] as never;
 const reverse=structuredClone(first);(reverse.facts.acl as unknown as typeof acl[]).reverse();
 assert.equal(compareHostedSchemaCatalogue([first],[reverse]).matches,true);
 const changed=structuredClone(first);(changed.facts.acl as unknown as typeof acl[])[0].grantor='supabase_admin';
 assert.equal(compareHostedSchemaCatalogue([first],[changed]).matches,false);
});

test('fixed queries contain no caller parameters and never project application rows or credentials',()=>{
 for(const sql of [hostedSchemaCatalogueStructuralSql,hostedSchemaCatalogueAuthoritySql]){
  assert.equal(/\$[0-9]/.test(sql),false);
  assert.equal(/rolpassword|pg_authid|decrypted_secret|select\s+\*\s+from\s+(?:app|auth|storage)\./i.test(sql),false);
  assert.equal(/last_value|is_called|relfilenode/.test(sql),false);
 }
 for(const category of ['schema','relation','column','constraint','index','trigger','policy','type','sequence'])assert.ok(hostedSchemaCatalogueStructuralSql.includes("select '"+category+"'"),category);
 for(const category of ['function','defaultAcl','role','membership','dependency','prerequisite','unsupported'])assert.ok(hostedSchemaCatalogueAuthoritySql.includes("select '"+category+"'"),category);
});
