import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';

export const hostedSchemaCatalogueVersion = 'CUEVO_SCHEMA_CATALOGUE_V1' as const;
export const hostedSchemaCatalogueLimits = Object.freeze({ rows: 100000, bytes: 32 * 1024 * 1024, functionBytes: 2 * 1024 * 1024, combinedFunctionBytes: 16 * 1024 * 1024 });
const failure = () => new Error('Hosted schema catalogue requires review; contents withheld.');
const text = z.string().max(2 * 1024 * 1024), name = z.string().min(1).max(1000), schema = z.enum(['app', 'internal', 'authorization']);
const nullableText = text.nullable(), texts = z.array(text).max(10000), nullableTexts = texts.nullable();
const integer = z.number().int().safe(), boolean = z.boolean();
const aclEntry = z.object({ grantor: name, grantee: name, privilege: name, grantable: boolean }).strict();
const acl = z.array(aclEntry).max(10000).nullable();
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const owned = { schema, name, owner: name, acl };
const definitions = {
 schema: object({ name: schema, owner: name, acl }),
 relation: object({ ...owned, kind: z.enum(['r','p','v','m','S','i','I','c','f']), persistence: z.enum(['p','u','t']), accessMethod: nullableText, tablespace: nullableText, isPartition: boolean, populated: boolean, rls: boolean, forceRls: boolean, replicaIdentity: text, options: nullableTexts, partitionKey: nullableText, partitionBound: nullableText, definition: nullableText, parents: texts }),
 column: object({ schema, relation: name, position: integer, name, type: name, collation: nullableText, notNull: boolean, dropped: boolean, identity: text, generated: text, default: nullableText, storage: text, compression: text, acl, options: nullableTexts }),
 constraint: object({ schema, relation: nullableText, name, kind: text, definition: text, validated: boolean, deferrable: boolean, deferred: boolean, local: boolean, inheritanceCount: integer, noInherit: boolean, parent: nullableText, referencedRelation: nullableText }),
 index: object({ schema, relation: name, name, definition: text, unique: boolean, primary: boolean, exclusion: boolean, valid: boolean, ready: boolean, live: boolean, immediate: boolean, clustered: boolean, replicaIdentity: boolean, checkXmin: boolean, nullsNotDistinct: boolean, predicate: nullableText, expressions: nullableText }),
 trigger: object({ schema, relation: name, name, definition: text, enabled: text, internal: boolean, function: name, constraint: nullableText, deferrable: boolean, deferred: boolean }),
 policy: object({ schema, relation: name, name, command: text, permissive: boolean, roles: texts, using: nullableText, check: nullableText }),
 function: object({ ...owned, identity: text, arguments: text, result: nullableText, kind: z.enum(['f','p','a','w']), language: name, definition: text, body: text, binary: nullableText, volatility: text, strict: boolean, parallel: text, securityDefiner: boolean, leakproof: boolean, cost: text, rows: text, support: nullableText, config: nullableTexts }),
 type: object({ ...owned, kind: text, category: text, preferred: boolean, defined: boolean, length: integer, byValue: boolean, alignment: text, storage: text, notNull: boolean, base: nullableText, typmod: integer, collation: nullableText, default: nullableText, defaultBinary: nullableText, element: nullableText, array: nullableText, relation: nullableText, input: nullableText, output: nullableText, receive: nullableText, send: nullableText, modifierInput: nullableText, modifierOutput: nullableText, analyze: nullableText, subscript: nullableText, enumLabels: z.array(object({ label: text, order: text })).max(10000), range: object({ subtype: name, collation: nullableText, operatorClass: name, canonical: nullableText, difference: nullableText, multirange: name }).nullable() }),
 sequence: object({ ...owned, type: name, start: text, increment: text, min: text, max: text, cache: text, cycle: boolean, ownership: texts }),
 roleSetting: object({ role: name, database: text, config: texts }),
 defaultAcl: object({ owner: name, schema: schema.nullable(), kind: text, acl }),
 role: object({ name, superuser: boolean, inherit: boolean, createRole: boolean, createDb: boolean, login: boolean, replication: boolean, bypassRls: boolean, connectionLimit: integer, validUntil: nullableText, config: nullableTexts }),
 membership: object({ role: name, member: name, grantor: name, admin: boolean, inherit: boolean, set: boolean }),
 dependency: object({ objectType: name, objectSchema: nullableText, objectName: nullableText, objectIdentity: name, referenceType: name, referenceSchema: nullableText, referenceName: nullableText, referenceIdentity: name, kind: text, occurrences: integer.positive() }),
 prerequisite: object({ name, version: text, schema: name, owner: name }),
 unsupported: object({ schema, kind: name, name }),
} as const;
export type HostedSchemaCatalogueCategory = keyof typeof definitions;
export type HostedSchemaCatalogueRow = { category: HostedSchemaCatalogueCategory; key: string; facts: Record<string, unknown> };
export type HostedSchemaCatalogue = { version: typeof hostedSchemaCatalogueVersion; rows: HostedSchemaCatalogueRow[]; sha256: string; categories: { category: HostedSchemaCatalogueCategory; count: number; sha256: string }[]; bytes: number };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function safeSnapshot(value: unknown, depth = 0): unknown {
 if (depth > 12) throw failure();
 if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
 if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
 if (Array.isArray(value) && (value.length > hostedSchemaCatalogueLimits.rows || Reflect.ownKeys(value).length !== value.length + 1)) throw failure();
 if (Array.isArray(value)) for (let index=0;index<value.length;index++) if (!Object.hasOwn(value,String(index))) throw failure();
 const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
 for (const key of Reflect.ownKeys(value)) {
  if (key === 'length' && Array.isArray(value)) continue;
  const field = Object.getOwnPropertyDescriptor(value, key);
  if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure();
  Object.defineProperty(output, key, { value: safeSnapshot(field.value, depth + 1), enumerable: true });
 }
 return output;
}
function canonical(value: unknown): string {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
 return JSON.stringify(value);
}
function identity(category: HostedSchemaCatalogueCategory, f: Record<string, unknown>): unknown[] {
 switch (category) {
  case 'schema': case 'role': case 'prerequisite': return [f.name];
  case 'relation': case 'type': case 'sequence': case 'unsupported': return [f.schema, f.name];
  case 'column': return [f.schema, f.relation, f.position];
  case 'constraint': return [f.schema, f.relation, f.name];
  case 'index': case 'trigger': case 'policy': return [f.schema, f.relation, f.name];
  case 'function': return [f.schema, f.name, f.identity];
  case 'roleSetting': return [f.role, f.database];
  case 'defaultAcl': return [f.owner, f.schema, f.kind];
  case 'membership': return [f.role, f.member, f.grantor];
  case 'dependency': return [f.objectType, f.objectIdentity, f.referenceType, f.referenceIdentity, f.kind];
 }
}
/** Strict source-owned row projection only. It does not attest provenance or current hosted state. */
export function canonicalizeHostedSchemaCatalogue(value: unknown): HostedSchemaCatalogue {
 try {
  const input = z.array(object({ category: z.enum(Object.keys(definitions) as [HostedSchemaCatalogueCategory, ...HostedSchemaCatalogueCategory[]]), key: text, facts: z.unknown() })).max(hostedSchemaCatalogueLimits.rows).parse(safeSnapshot(value));
  let functionBytes = 0;
  const seen = new Set<string>();
  const rows: HostedSchemaCatalogueRow[] = input.map(row => {
   if (row.category === 'unsupported') throw failure();
   const facts = definitions[row.category].parse(row.facts) as Record<string, unknown>;
   const key = JSON.stringify(identity(row.category, facts));
   if (canonical(JSON.parse(row.key)) !== canonical(JSON.parse(key)) || seen.has(row.category + ':' + key)) throw failure();
   seen.add(row.category + ':' + key);
   if (row.category === 'function') {
    const size = Buffer.byteLength(String(facts.definition)) + Buffer.byteLength(String(facts.body));
    if (Buffer.byteLength(String(facts.definition)) > hostedSchemaCatalogueLimits.functionBytes || Buffer.byteLength(String(facts.body)) > hostedSchemaCatalogueLimits.functionBytes) throw failure();
    functionBytes += size;
   }
   for (const field of ['acl'] as const) if (Array.isArray(facts[field])) facts[field] = [...facts[field]].sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
   return { category: row.category, key, facts };
  });
  if (functionBytes > hostedSchemaCatalogueLimits.combinedFunctionBytes) throw failure();
  rows.sort((a, b) => a.category < b.category ? -1 : a.category > b.category ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const bytes = Buffer.byteLength(canonical(rows)); if (bytes > hostedSchemaCatalogueLimits.bytes) throw failure();
  const categories = (Object.keys(definitions) as HostedSchemaCatalogueCategory[]).filter(category => category !== 'unsupported').sort().map(category => { const subset = rows.filter(row => row.category === category); return { category, count: subset.length, sha256: digest(canonical(subset)) }; });
  return { version: hostedSchemaCatalogueVersion, rows, sha256: digest(canonical(rows)), categories, bytes };
 } catch { throw failure(); }
}
export function compareHostedSchemaCatalogue(reference: unknown, observed: unknown) {
 const expected = canonicalizeHostedSchemaCatalogue(reference), current = canonicalizeHostedSchemaCatalogue(observed);
 return { matches: expected.sha256 === current.sha256, expectedSha256: expected.sha256, observedSha256: current.sha256, differences: expected.categories.filter((category, index) => category.sha256 !== current.categories[index].sha256).map(category => category.category) };
}

const stableTrigger = (alias: string) => `case when ${alias}.tgisinternal and exists(select 1 from pg_constraint fk where fk.oid=${alias}.tgconstraint and fk.contype='f') and ${alias}.tgname = 'RI_ConstraintTrigger_'||case when substring(${alias}.tgname from 22 for 1)='a' then 'a' else 'c' end||'_'||${alias}.oid::text then 'CUEVO_INTERNAL_FK:'||(select kn.nspname||'.'||kc.relname||'.'||k.conname from pg_constraint k join pg_namespace kn on kn.oid=k.connamespace join pg_class kc on kc.oid=k.conrelid where k.oid=${alias}.tgconstraint)||':'||${alias}.tgfoid::regprocedure::text else ${alias}.tgname::text end`;
const stableTriggerIdentity = (alias: string) => `(${stableTrigger(alias)})||' on '||${alias}.tgrelid::regclass::text`;
export function requireCompleteHostedSchemaCatalogue(value: unknown): HostedSchemaCatalogue {
 const catalogue = canonicalizeHostedSchemaCatalogue(value);
 const names = catalogue.rows.filter(row => row.category === 'schema').map(row => row.facts.name).sort();
 if (JSON.stringify(names) !== JSON.stringify(['app','authorization','internal']) || !catalogue.rows.some(row => row.category === 'role' && row.facts.name === 'cuevo_api') || !catalogue.rows.some(row => row.category === 'role' && row.facts.name === 'cuevo_worker')) throw failure();
 return catalogue;
}
const namespaces = `('app','internal','authorization')`;
const aclSql = (expression: string) => `case when ${expression} is null then null else coalesce((select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantor::regrole::text,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) from aclexplode(${expression}) a),'[]'::jsonb) end`;
const qualified = (oid: string) => `case when ${oid}=0 then null else (${oid})::regclass::text end`;
const proc = (oid: string) => `case when ${oid}=0 then null else (${oid})::regprocedure::text end`;
const type = (oid: string) => `case when ${oid}=0 then null else format_type(${oid},null) end`;
const collation = (oid: string) => `case when ${oid}=0 then null else (${oid})::regcollation::text end`;
const fact = (category: string, key: string, fields: string, from: string) => `select '${category}'::text as category,jsonb_build_array(${key})::text as key,jsonb_build_object(${fields}) as facts ${from}`;
const relationFrom = `from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}`;

/** Both fixed chunks must run in one operator-owned REPEATABLE READ READ ONLY snapshot with search_path=pg_catalog. No parameters are accepted. */
export const hostedSchemaCatalogueStructuralSql = `/* CUEVO_SCHEMA_CATALOGUE_V1_STRUCTURAL */
${[
 fact('schema', 'n.nspname', `'name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',${aclSql('n.nspacl')}`, `from pg_namespace n where n.nspname in ${namespaces}`),
 fact('relation','n.nspname,c.relname',`'schema',n.nspname,'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,'accessMethod',(select am.amname from pg_am am where am.oid=c.relam),'tablespace',(select sp.spcname from pg_tablespace sp where sp.oid=c.reltablespace),'isPartition',c.relispartition,'populated',c.relispopulated,'owner',pg_get_userbyid(c.relowner),'acl',${aclSql('c.relacl')},'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident,'options',c.reloptions,'partitionKey',case when c.relkind='p' then pg_get_partkeydef(c.oid) else null end,'partitionBound',pg_get_expr(c.relpartbound,c.oid),'definition',case when c.relkind in('v','m') then pg_get_viewdef(c.oid,false) else null end,'parents',coalesce((select jsonb_agg(i.inhparent::regclass::text order by i.inhseqno) from pg_inherits i where i.inhrelid=c.oid),'[]'::jsonb)`,relationFrom),
 fact('column','n.nspname,c.relname,a.attnum',`'schema',n.nspname,'relation',c.relname,'position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'collation',${collation('a.attcollation')},'notNull',a.attnotnull,'dropped',a.attisdropped,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'storage',a.attstorage,'compression',a.attcompression,'acl',${aclSql('a.attacl')},'options',a.attoptions`, `from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname in ${namespaces} and a.attnum>0`),
 fact('constraint','n.nspname,c.relname,k.conname',`'schema',n.nspname,'relation',c.relname,'name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid,false),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'local',k.conislocal,'inheritanceCount',k.coninhcount,'noInherit',k.connoinherit,'parent',(select pn.nspname||'.'||p.conname from pg_constraint p join pg_namespace pn on pn.oid=p.connamespace where p.oid=k.conparentid),'referencedRelation',${qualified('k.confrelid')}`,`from pg_constraint k join pg_namespace n on n.oid=k.connamespace left join pg_class c on c.oid=k.conrelid where n.nspname in ${namespaces}`),
 fact('index','n.nspname,c.relname,x.relname',`'schema',n.nspname,'relation',c.relname,'name',x.relname,'definition',pg_get_indexdef(i.indexrelid,0,false),'unique',i.indisunique,'primary',i.indisprimary,'exclusion',i.indisexclusion,'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'immediate',i.indimmediate,'clustered',i.indisclustered,'replicaIdentity',i.indisreplident,'checkXmin',i.indcheckxmin,'nullsNotDistinct',i.indnullsnotdistinct,'predicate',pg_get_expr(i.indpred,i.indrelid),'expressions',pg_get_expr(i.indexprs,i.indrelid)`,`from pg_index i join pg_class c on c.oid=i.indrelid join pg_class x on x.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}`),
 fact('trigger',`n.nspname,c.relname,${stableTrigger('t')}`,`'schema',n.nspname,'relation',c.relname,'name',${stableTrigger('t')},'definition',replace(pg_get_triggerdef(t.oid,false),quote_ident(t.tgname),quote_ident(${stableTrigger('t')})),'enabled',t.tgenabled,'internal',t.tgisinternal,'function',t.tgfoid::regprocedure::text,'constraint',(select k.conname from pg_constraint k where k.oid=t.tgconstraint),'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred`,`from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}`),
 fact('policy','n.nspname,c.relname,p.polname',`'schema',n.nspname,'relation',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(p.polroles)r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)`,`from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}`),
 fact('type','n.nspname,t.typname',`'schema',n.nspname,'name',t.typname,'owner',pg_get_userbyid(t.typowner),'acl',${aclSql('t.typacl')},'kind',t.typtype,'category',t.typcategory,'preferred',t.typispreferred,'defined',t.typisdefined,'length',t.typlen,'byValue',t.typbyval,'alignment',t.typalign,'storage',t.typstorage,'notNull',t.typnotnull,'base',${type('t.typbasetype')},'typmod',t.typtypmod,'collation',${collation('t.typcollation')},'default',t.typdefault,'defaultBinary',case when t.typdefaultbin is null then null else pg_get_expr(t.typdefaultbin,0) end,'element',${type('t.typelem')},'array',${type('t.typarray')},'relation',${qualified('t.typrelid')},'input',${proc('t.typinput')},'output',${proc('t.typoutput')},'receive',${proc('t.typreceive')},'send',${proc('t.typsend')},'modifierInput',${proc('t.typmodin')},'modifierOutput',${proc('t.typmodout')},'analyze',${proc('t.typanalyze')},'subscript',${proc('t.typsubscript')},'enumLabels',coalesce((select jsonb_agg(jsonb_build_object('label',e.enumlabel,'order',e.enumsortorder::text) order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),'[]'::jsonb),'range',(select jsonb_build_object('subtype',format_type(r.rngsubtype,null),'collation',${collation('r.rngcollation')},'operatorClass',(select onsp.nspname||'.'||o.opcname from pg_opclass o join pg_namespace onsp on onsp.oid=o.opcnamespace where o.oid=r.rngsubopc),'canonical',${proc('r.rngcanonical')},'difference',${proc('r.rngsubdiff')},'multirange',format_type(r.rngmultitypid,null)) from pg_range r where r.rngtypid=t.oid)`,`from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${namespaces}`),
 fact('sequence','n.nspname,c.relname',`'schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',${aclSql('c.relacl')},'type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle,'ownership',coalesce((select jsonb_agg(pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) order by pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)) from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype in('a','i')),'[]'::jsonb)`,`from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}`),
].join('\nunion\n')}
order by category,key`;

export const hostedSchemaCatalogueAuthoritySql = `/* CUEVO_SCHEMA_CATALOGUE_V1_AUTHORITY */
with recursive owned_objects(classid,objid) as (
 select 'pg_namespace'::regclass,n.oid from pg_namespace n where n.nspname in ${namespaces}
 union all select 'pg_class'::regclass,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}
 union all select 'pg_proc'::regclass,p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${namespaces}
 union all select 'pg_type'::regclass,t.oid from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${namespaces}
 union all select 'pg_constraint'::regclass,k.oid from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname in ${namespaces}
 union all select 'pg_trigger'::regclass,t.oid from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}
 union all select 'pg_policy'::regclass,p.oid from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}
 union all select 'pg_attrdef'::regclass,d.oid from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}
 union all select 'pg_rewrite'::regclass,r.oid from pg_rewrite r join pg_class c on c.oid=r.ev_class join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces}
), role_roots(oid) as (select oid from pg_roles where rolname in('cuevo_api','cuevo_worker','postgres','supabase_admin','anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin','dashboard_user') union select n.nspowner from pg_namespace n where n.nspname in ${namespaces} union select c.relowner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${namespaces} union select p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${namespaces} union select a.grantee from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl)a where n.nspname in ${namespaces} and a.grantee<>0 union select a.grantor from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl)a where n.nspname in ${namespaces} union select a.grantee from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl)a where n.nspname in ${namespaces} and a.grantee<>0 union select a.grantor from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl)a where n.nspname in ${namespaces} union select a.grantee from pg_namespace n cross join lateral aclexplode(n.nspacl)a where n.nspname in ${namespaces} and a.grantee<>0 union select a.grantor from pg_namespace n cross join lateral aclexplode(n.nspacl)a where n.nspname in ${namespaces} union select t.typowner from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ${namespaces} union select a.grantee from pg_type t join pg_namespace n on n.oid=t.typnamespace cross join lateral aclexplode(t.typacl)a where n.nspname in ${namespaces} and a.grantee<>0 union select a.grantee from pg_attribute c join pg_class r on r.oid=c.attrelid join pg_namespace n on n.oid=r.relnamespace cross join lateral aclexplode(c.attacl)a where n.nspname in ${namespaces} and a.grantee<>0 union select d.defaclrole from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ${namespaces}), relevant_roles(oid) as (select oid from role_roots union select case when m.roleid=r.oid then m.member else m.roleid end from relevant_roles r join pg_auth_members m on m.roleid=r.oid or m.member=r.oid)
${[
 fact('function','n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)',`'schema',n.nspname,'name',p.proname,'owner',pg_get_userbyid(p.proowner),'acl',${aclSql('p.proacl')},'identity',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'kind',p.prokind,'language',l.lanname,'definition',case when p.prokind='a' then null else pg_get_functiondef(p.oid) end,'body',p.prosrc,'binary',p.probin,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'cost',p.procost::text,'rows',p.prorows::text,'support',${proc('p.prosupport')},'config',p.proconfig`,`from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in ${namespaces}`),
 fact('defaultAcl','pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype',`'owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'kind',d.defaclobjtype,'acl',${aclSql('d.defaclacl')}`,`from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ${namespaces} or d.defaclnamespace=0 and d.defaclrole in(select oid from relevant_roles)`),
 fact('role','r.rolname',`'name',r.rolname,'superuser',r.rolsuper,'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'login',r.rolcanlogin,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'connectionLimit',r.rolconnlimit,'validUntil',r.rolvaliduntil::text,'config',r.rolconfig`,`from pg_roles r where r.oid in(select oid from relevant_roles)`),
 fact('roleSetting','r.rolname,coalesce(d.datname,\'ALL_DATABASES\')',`'role',r.rolname,'database',coalesce(d.datname,'ALL_DATABASES'),'config',s.setconfig`,`from pg_db_role_setting s join pg_roles r on r.oid=s.setrole left join pg_database d on d.oid=s.setdatabase where s.setrole in(select oid from relevant_roles) and (s.setdatabase=0 or d.datname=current_database())`),
 fact('membership','g.rolname,r.rolname,a.rolname',`'role',g.rolname,'member',r.rolname,'grantor',a.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option`,`from pg_auth_members m join pg_roles g on g.oid=m.roleid join pg_roles r on r.oid=m.member join pg_roles a on a.oid=m.grantor where m.roleid in(select oid from relevant_roles) or m.member in(select oid from relevant_roles)`),
 fact('dependency',`o.type,case when ot.oid is null then o.identity else ${stableTriggerIdentity('ot')} end,r.type,case when rt.oid is null then r.identity else ${stableTriggerIdentity('rt')} end,d.deptype`,`'objectType',o.type,'objectSchema',o.schema,'objectName',o.name,'objectIdentity',case when ot.oid is null then o.identity else ${stableTriggerIdentity('ot')} end,'referenceType',r.type,'referenceSchema',r.schema,'referenceName',r.name,'referenceIdentity',case when rt.oid is null then r.identity else ${stableTriggerIdentity('rt')} end,'kind',d.deptype,'occurrences',count(*)::int`,`from pg_depend d join owned_objects x on x.classid=d.classid and x.objid=d.objid cross join lateral pg_identify_object(d.classid,d.objid,d.objsubid)o cross join lateral pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)r left join pg_trigger ot on d.classid='pg_trigger'::regclass and ot.oid=d.objid left join pg_trigger rt on d.refclassid='pg_trigger'::regclass and rt.oid=d.refobjid group by o.type,o.schema,o.name,o.identity,r.type,r.schema,r.name,r.identity,d.deptype,ot.oid,rt.oid`),
 fact('prerequisite','e.extname',`'name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner)`,`from pg_extension e join pg_namespace n on n.oid=e.extnamespace`),
 fact('unsupported','n.nspname,o.oprname',`'schema',n.nspname,'kind','operator','name',o.oprname`,`from pg_operator o join pg_namespace n on n.oid=o.oprnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,c.collname',`'schema',n.nspname,'kind','collation','name',c.collname`,`from pg_collation c join pg_namespace n on n.oid=c.collnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,c.conname',`'schema',n.nspname,'kind','conversion','name',c.conname`,`from pg_conversion c join pg_namespace n on n.oid=c.connamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,o.opcname',`'schema',n.nspname,'kind','operator class','name',o.opcname`,`from pg_opclass o join pg_namespace n on n.oid=o.opcnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,o.opfname',`'schema',n.nspname,'kind','operator family','name',o.opfname`,`from pg_opfamily o join pg_namespace n on n.oid=o.opfnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,c.cfgname',`'schema',n.nspname,'kind','text search configuration','name',c.cfgname`,`from pg_ts_config c join pg_namespace n on n.oid=c.cfgnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,d.dictname',`'schema',n.nspname,'kind','text search dictionary','name',d.dictname`,`from pg_ts_dict d join pg_namespace n on n.oid=d.dictnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,p.prsname',`'schema',n.nspname,'kind','text search parser','name',p.prsname`,`from pg_ts_parser p join pg_namespace n on n.oid=p.prsnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,t.tmplname',`'schema',n.nspname,'kind','text search template','name',t.tmplname`,`from pg_ts_template t join pg_namespace n on n.oid=t.tmplnamespace where n.nspname in ${namespaces}`),
 fact('unsupported','n.nspname,s.stxname',`'schema',n.nspname,'kind','extended statistics','name',s.stxname`,`from pg_statistic_ext s join pg_namespace n on n.oid=s.stxnamespace where n.nspname in ${namespaces}`),
].join('\nunion\n')}
order by category,key`;
export const hostedSchemaCatalogueQuerySha256 = digest(hostedSchemaCatalogueStructuralSql + '\n' + hostedSchemaCatalogueAuthoritySql);
