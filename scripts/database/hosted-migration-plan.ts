import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { types } from 'node:util';
import { parseReconciliationTemplate, verifyReconciledPrefix, type ReconciliationTemplate } from './hosted-schema-reconciliation';
import { replayPlan, nativeSourceMigration, posthogEnvironmentMigration, posthogIntelligenceMigration } from './replay-plan';
import {originalChildRecoveryPlanContextSchema,validateOriginalChildRecoveryPlanContext,originalChildRecoveryFingerprint,originalChildReconciledPlanProjection,type OriginalChildRecoveryPlanContext} from './hosted-original-child-recovery';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^\d{14}$/);
const projectRef = z.string().regex(/^[a-z]{20}$/);
const rowSchema = z.object({ version, sha256: digest }).strict();
const identitySchema = z.object({ sha, tree: sha }).strict();
const targetSchema = z.object({
  projectRef, boundProjectRef: projectRef, projectName: z.string(), projectStatus: z.literal('ACTIVE_HEALTHY'),
  deploymentEnvironment: z.literal('synthetic-staging'), observedAt: z.iso.datetime({ offset: true }),
  authUsers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), storageObjects: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  appSchemas: z.array(z.enum(['app', 'internal', 'authorization'])).max(3), migrationVersions: z.array(version).max(1000),
  dispatchDisabled: z.literal(true), population: z.enum(['EMPTY', 'GUARDED_SYNTHETIC','SCHEMA_ONLY']),
}).strict();
const priorSchema = z.object({ projectRef, sourceSha: sha, treeSha: sha, migrations: z.array(rowSchema).min(1).max(1000), completedSourceMigrationCount: z.number().int().positive().max(1000).optional() }).strict();
const failure = () => new Error('Hosted migration source, target or verified history requires review; contents withheld.');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export type MigrationSource = { name: string; bytes: Uint8Array };
export type CanonicalMigrationSources = {
  sources: MigrationSource[];
  provenance: { kind: 'VERIFIED_GIT_BLOBS'; sourceSha: string; treeSha: string; migrationTreeSha: string; manifestSha256: string };
};
export type HostedMigrationPlanV1 = {
  version: 1; mode: 'EMPTY_INITIAL' | 'INCREMENTAL'; provenance: 'CALLER_SUPPLIED_SOURCE';
  source: { sha: string; tree: string }; projectRef: string; observedAt: string;
  migrations: { name: string; version: string; sha256: string }[]; applied: { version: string; sha256: string }[];
  pending: { name: string; version: string; sha256: string }[];
  stages: { id: 'prefix' | 'native' | 'pre-observability' | 'remaining'; names: string[] }[];
  sourceSetSha256: string; observedHistorySha256: string;
  dispatch: 'DISABLED'; seed: 'DISABLED'; vault: 'DISABLED';
  priorCompletedRelease?: {sourceSha:string;treeSha:string;migrationCount:number};
  priorSchemaRelease?: {sourceSha:string;treeSha:string;migrationCount:number};
  runtimeOnly?:true;
  reconciliationTemplate?:ReconciliationTemplate;
  originalChildRecovery?:OriginalChildRecoveryPlanContext;
  reconciledChild?:{version:1;purpose:'CUEVO_RECONCILED_CHILD144_PLAN';observedMigrationCount:144;historySha256:string;templateSha256:string;catalogueReferenceSha256:string};
};

/** Caller-supplied source/history is planning input, never execution admission or proof of Git review. */
export function planHostedMigrations(input: { sources: MigrationSource[]; source: unknown; target: unknown; priorReceipt?: unknown; reconciliationTemplate?:unknown; originalChildRecovery?:unknown; now: number }): HostedMigrationPlanV1 {
  return planHostedMigrationsFromSources(input);
}

/** Historical rows are private to the canonical owner's verified Git acquisition.
 * Caller-supplied metadata cannot establish a formerly complete schema boundary. */
function planHostedMigrationsFromSources(input:Parameters<typeof planHostedMigrations>[0],verifiedPriorSources?:MigrationSource[],currentProjection?:MigrationSourceProjection,priorProjection?:MigrationSourceProjection):HostedMigrationPlanV1 {
  const identity = identitySchema.safeParse(input.source), target = targetSchema.safeParse(input.target);
  if (!identity.success || !target.success || !Number.isSafeInteger(input.now) || input.now < 0) throw failure();
  const current = target.data, observedAt = Date.parse(current.observedAt);
  if (current.projectRef !== current.boundProjectRef || current.projectName.toLowerCase() !== 'cuevo' || observedAt > input.now || input.now - observedAt > 86400000
    || new Set(current.migrationVersions).size !== current.migrationVersions.length || new Set(current.appSchemas).size !== current.appSchemas.length) throw failure();
  if (!Array.isArray(input.sources) || input.sources.length > 1000 || input.sources.some(row => !row || typeof row.name !== 'string' || !(row.bytes instanceof Uint8Array))) throw failure();
  let projection:MigrationSourceProjection;
  try { projection=currentProjection??migrationSourceProjection(input.sources); } catch { throw failure(); }
  const {replay,order}=projection;
  if (order.length !== input.sources.length || new Set(order).size !== order.length) throw failure();
  const migrations = projection.rows.map(({version,sha256,name})=>({version,sha256,name}));
  const originalChildRecovery=input.originalChildRecovery===undefined?undefined:validateOriginalChildRecoveryPlanContext(input.originalChildRecovery,migrations,identity.data);
  if(originalChildRecovery&&(input.reconciliationTemplate!==undefined||current.population!=='SCHEMA_ONLY'||current.authUsers!==0||current.migrationVersions.length!==144))throw failure();
  let reconciliationTemplate:ReconciliationTemplate|undefined;
  if(input.reconciliationTemplate!==undefined){reconciliationTemplate=parseReconciliationTemplate(input.reconciliationTemplate);verifyReconciledPrefix(reconciliationTemplate,migrations);if(reconciliationTemplate.recoverySource.sourceSha!==identity.data.sha||reconciliationTemplate.recoverySource.treeSha!==identity.data.tree||reconciliationTemplate.originalIdentity.projectRef!==current.projectRef||current.population!=='SCHEMA_ONLY'||current.migrationVersions.length!==120)throw failure();}
  const history = [...current.migrationVersions].sort();
  let applied: { version: string; sha256: string }[] = [];
  const initial = history.length === 0;
  if (initial) {
    if (current.population !== 'EMPTY' || current.authUsers !== 0 || current.storageObjects !== 0 || current.appSchemas.length !== 0 || input.priorReceipt !== undefined) throw failure();
  } else {
    const prior = priorSchema.safeParse(input.priorReceipt);
    const prefix = migrations.slice(0, history.length);
    if (!prior.success || !['GUARDED_SYNTHETIC','SCHEMA_ONLY'].includes(current.population) || (current.population==='SCHEMA_ONLY'?current.authUsers!==0:current.authUsers>133) || current.appSchemas.length !== 3
      || prior.data.projectRef !== current.projectRef || new Set(prior.data.migrations.map(row => row.version)).size !== prior.data.migrations.length
      || JSON.stringify(prefix.map(row => row.version).sort()) !== JSON.stringify(history)) throw failure();
    const canonicalRows = (rows: { version: string; sha256: string }[]) => JSON.stringify([...rows].sort((a, b) => a.version.localeCompare(b.version)));
    if (canonicalRows(prior.data.migrations) !== canonicalRows((originalChildRecovery?prefix.slice(0,124):prefix).map(({ version, sha256 }) => ({ version, sha256 })))) throw failure();
    if(originalChildRecovery&&(prior.data.completedSourceMigrationCount!==undefined||prior.data.sourceSha!==originalChildRecovery.installedMarker.sourceSha||prior.data.treeSha!==originalChildRecovery.installedMarker.treeSha||canonicalRows(prior.data.migrations)!==canonicalRows(originalChildRecovery.installedMarker.migrations)))throw failure();
    const boundaries = [replay.before.length, replay.before.length + 1, replay.before.length + 1 + replay.remaining.indexOf(posthogIntelligenceMigration), migrations.length];
    const completedPrior = prior.data.completedSourceMigrationCount === prior.data.migrations.length && prior.data.completedSourceMigrationCount === history.length;
    let formerSchemaBoundary=false;
    if(current.population==='SCHEMA_ONLY'&&verifiedPriorSources&&!originalChildRecovery&&!reconciliationTemplate){
      const historical=priorProjection??migrationSourceProjection(verifiedPriorSources),names=historical.order;
      formerSchemaBoundary=names.length===verifiedPriorSources.length&&names.length===history.length&&names.every((name,index)=>name===prefix[index]?.name&&historical.rows[index]?.sha256===prefix[index].sha256);
    }
    if (!boundaries.includes(history.length) && !completedPrior&&!formerSchemaBoundary&&!originalChildRecovery&&!(current.population==='SCHEMA_ONLY'&&history.length===120&&reconciliationTemplate)) throw failure();
    if(reconciliationTemplate&&(prior.data.sourceSha!==reconciliationTemplate.originalIdentity.sourceSha||prior.data.treeSha!==reconciliationTemplate.originalIdentity.treeSha||prior.data.completedSourceMigrationCount!==undefined))throw failure();
    applied = prefix.map(({ version, sha256 }) => ({ version, sha256 }));
  }
  const pending = migrations.slice(applied.length);
  const priorToIntelligence = replay.remaining.slice(0, replay.remaining.indexOf(posthogIntelligenceMigration));
  if (!priorToIntelligence.includes(posthogEnvironmentMigration)) throw failure();
  const stageSources: HostedMigrationPlanV1['stages'] = [
    { id: 'prefix', names: replay.before }, { id: 'native', names: [nativeSourceMigration] },
    { id: 'pre-observability', names: priorToIntelligence },
    { id: 'remaining', names: replay.remaining.slice(priorToIntelligence.length) },
  ];
  const stages = stageSources.map(stage => ({ ...stage, names: stage.names.filter(name => pending.some(row => row.name === name)) }));
  return { version: 1, mode: initial ? 'EMPTY_INITIAL' : 'INCREMENTAL', provenance: 'CALLER_SUPPLIED_SOURCE', source: identity.data,
    projectRef: current.projectRef, observedAt: current.observedAt, migrations, applied, pending, stages,
    sourceSetSha256: hash(JSON.stringify(migrations)), observedHistorySha256: hash(JSON.stringify(history)), dispatch: 'DISABLED', seed: 'DISABLED', vault: 'DISABLED',
    ...(reconciliationTemplate?{reconciliationTemplate}:{}),
    ...(originalChildRecovery?{originalChildRecovery,reconciledChild:originalChildReconciledPlanProjection(originalChildRecovery)}:{}),
    ...(current.population!=='SCHEMA_ONLY'&&input.priorReceipt!==undefined&&priorSchema.parse(input.priorReceipt).completedSourceMigrationCount!==undefined?{priorCompletedRelease:{sourceSha:priorSchema.parse(input.priorReceipt).sourceSha,treeSha:priorSchema.parse(input.priorReceipt).treeSha,migrationCount:priorSchema.parse(input.priorReceipt).completedSourceMigrationCount!}}:{}),
    ...(current.population==='SCHEMA_ONLY'?{priorSchemaRelease:{sourceSha:priorSchema.parse(input.priorReceipt).sourceSha,treeSha:priorSchema.parse(input.priorReceipt).treeSha,migrationCount:originalChildRecovery?124:applied.length}}:{}) };
}

const gitEnvironment = () => Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TMP', 'TEMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
function gitReader(root: string) {
  return (args: string[],input?:string) => {
    try { return execFileSync('git', ['-C', root, ...args], { input,env: gitEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, shell: false }); }
    catch { throw failure(); }
  };
}
/** Bounded immutable Git blobs for historical checks; no working/source authority is inferred. */
export function readHistoricalMigrationSources(repoRoot:string,sourceSha:string,treeSha:string):MigrationSource[]{
 if(!sha.safeParse(sourceSha).success||!sha.safeParse(treeSha).success)throw failure();const{git}=checkedRoot(repoRoot);
 if(git(['rev-parse',`${sourceSha}^{tree}`]).toString().trim()!==treeSha)throw failure();
 return readMigrationBlobBatches(git,git(['ls-tree','-r','-z',sourceSha,'--','supabase/migrations']));
}
/** Exact IDs, per-blob/total limits and framing are checked for every batch. */
function readMigrationBlobBatches(git:ReturnType<typeof gitReader>,tree:Uint8Array):MigrationSource[]{
 const entries=new TextDecoder('utf8',{fatal:true}).decode(tree).split('\0').filter(Boolean).map(entry=>{const match=/^100644 blob ([a-f0-9]{40})\tsupabase\/migrations\/(\d{14}_[a-z0-9_]+\.sql)$/.exec(entry);if(!match)throw failure();return{blob:match[1],name:match[2]};});
 if(!entries.length||entries.length>1000||new Set(entries.map(row=>row.name.slice(0,14))).size!==entries.length)throw failure();const output:MigrationSource[]=[];let total=0;
 // The admitted payload is at most 16 MiB plus bounded headers, below the
 // existing 32 MiB transport cap. Keep every original per-blob/frame check.
 {const group=entries,batch=git(['cat-file','--batch'],group.map(row=>row.blob).join('\n')+'\n');let offset=0;
  for(const row of group){const end=batch.indexOf(10,offset);if(end<0)throw failure();const match=/^([a-f0-9]{40}) blob ([0-9]+)$/.exec(batch.subarray(offset,end).toString('ascii'));if(!match||match[1]!==row.blob)throw failure();const size=Number(match[2]);if(!Number.isSafeInteger(size)||size>2*1024*1024)throw failure();total+=size;if(total>16*1024*1024)throw failure();offset=end+1;const bytes=batch.subarray(offset,offset+size);if(bytes.length!==size||batch[offset+size]!==10)throw failure();offset+=size+1;output.push({name:row.name,bytes:new Uint8Array(bytes)});}if(offset!==batch.length)throw failure();
 }
 return output;
}
function checkedRoot(repoRoot: string) {
  if (!isAbsolute(repoRoot)) throw failure();
  let actual: string;
  try { actual = realpathSync(repoRoot); } catch { throw failure(); }
  if (resolve(repoRoot) !== actual || lstatSync(repoRoot).isSymbolicLink()) throw failure();
  const git = gitReader(actual);
  if (realpathSync(git(['rev-parse', '--show-toplevel']).toString('utf8').trim()) !== actual || git(['rev-parse', '--is-shallow-repository']).toString('utf8').trim() !== 'false') throw failure();
  const grafts = git(['rev-parse', '--git-path', 'info/grafts']).toString('utf8').trim();
  try { if (readFileSync(isAbsolute(grafts) ? grafts : join(actual, grafts)).length) throw failure(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure(); }
  if (git(['for-each-ref', '--format=%(refname)', 'refs/replace']).length) throw failure();
  return { root: actual, git };
}

/** All current root/revision properties come from one bounded native query;
 * historical readers retain their independent HEAD semantics above. */
function checkedCurrentRoot(input:{repoRoot:string;sourceSha:string;treeSha:string}){
  if(!isAbsolute(input.repoRoot))throw failure();let actual:string;
  try{actual=realpathSync(input.repoRoot);}catch{throw failure();}
  if(resolve(input.repoRoot)!==actual||lstatSync(input.repoRoot).isSymbolicLink())throw failure();
  const git=gitReader(actual),text=new TextDecoder('utf8',{fatal:true}).decode(git(['rev-parse','--show-toplevel','--is-shallow-repository','--git-path','info/grafts','HEAD^{commit}',`${input.sourceSha}^{tree}`]));
  if(!text.endsWith('\n')||/[\r\0]/.test(text))throw failure();const rows=text.slice(0,-1).split('\n');
  if(rows.length!==5||rows.some(row=>!row)||realpathSync(rows[0])!==actual||rows[1]!=='false'||rows[3]!==input.sourceSha||rows[4]!==input.treeSha)throw failure();
  const grafts=rows[2];try{if(readFileSync(isAbsolute(grafts)?grafts:join(actual,grafts)).length)throw failure();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();}
  if(git(['for-each-ref','--format=%(refname)','refs/replace']).length)throw failure();return{root:actual,git};
}

/** Purpose-specific immutable Edge build inputs through the same bounded Git/history controls. No command/SQL authority escapes. */
export function readCanonicalEdgeBuildSources(repoRoot: string) {
  const { root, git } = checkedRoot(repoRoot), sourceSha = git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim(), treeSha = git(['rev-parse', '--verify', 'HEAD^{tree}']).toString().trim();
  if (!sha.safeParse(sourceSha).success || !sha.safeParse(treeSha).success) throw failure();
  const allowed = ['apps/worker/src', 'packages/contracts/src/analytics.ts', 'packages/config/src/synthetic-runtime.ts', 'package-lock.json', 'apps/worker/deno.lock'];
  const tree = git(['ls-tree', '-r', '-z', sourceSha, '--', ...allowed]), rows = tree.toString('utf8').split('\0').filter(Boolean).map(row => { const match = /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(row); if (!match) throw failure(); const path = match[2]; if (!(path.startsWith('apps/worker/src/') && path.endsWith('.ts') || allowed.slice(1).includes(path)) || path.split('/').some(part => !part || part === '.' || part === '..')) throw failure(); return { blob: match[1], path }; });
  if (!rows.length || rows.length > 1000 || new Set(rows.map(row => row.path)).size !== rows.length || !rows.some(row => row.path === 'apps/worker/src/edge.ts') || allowed.slice(1).some(path => !rows.some(row => row.path === path))) throw failure();
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', sourceSha, '--', ...allowed]); if (git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...allowed]).length) throw failure();
  let total = 0; const files = rows.map(row => { const bytes = git(['cat-file', 'blob', row.blob]); total += bytes.length; if (bytes.length > 2 * 1024 * 1024 || total > 16 * 1024 * 1024) throw failure(); let current = root; for (const part of row.path.split('/')) { current = join(current, part); if (lstatSync(current).isSymbolicLink() || realpathSync(current) !== resolve(current)) throw failure(); } const stat = lstatSync(current); if (!stat.isFile() || stat.nlink !== 1 || !readFileSync(current).equals(bytes)) throw failure(); return { path: row.path, bytes: Buffer.from(bytes), sha256: hash(bytes) }; });
  return { root, sourceSha, treeSha, files };
}

/** Real Git metadata and binary blobs are loaded independently of normalized working-file bytes. */
const normalizeMigrationBytes=(value:Uint8Array)=>Buffer.from(value.filter((byte,index)=>byte!==13||value[index+1]!==10));
function verifyMigrationBlobMetadata(git:ReturnType<typeof gitReader>,tree:Uint8Array,sources:MigrationSource[]){
 const entries=new TextDecoder('utf8',{fatal:true}).decode(tree).split('\0').filter(Boolean).map(entry=>{const match=/^100644 blob ([a-f0-9]{40})\tsupabase\/migrations\/(\d{14}_[a-z0-9_]+\.sql)$/.exec(entry);if(!match)throw failure();return{blob:match[1],name:match[2]};}),sizes=new TextDecoder('utf8',{fatal:true}).decode(git(['cat-file','--batch-check'],entries.map(row=>row.blob).join('\n')+'\n'));if(!sizes.endsWith('\n')||/[\r\0]/.test(sizes))throw failure();const rows=sizes.slice(0,-1).split('\n');if(rows.length!==entries.length)throw failure();for(const[index,row]of entries.entries()){const match=/^([a-f0-9]{40}) blob ([0-9]+)$/.exec(rows[index]),source=sources[index];if(!match||match[1]!==row.blob||!source||source.name!==row.name||Number(match[2])!==source.bytes.length)throw failure();}
}
function readCurrentMigrationSources(input: { repoRoot: string; sourceSha: string; treeSha: string },original?:{sources:MigrationSource[];tree:Uint8Array;provenance:CanonicalMigrationSources['provenance'];normalized:Map<string,Uint8Array>}) {
  if (!sha.safeParse(input.sourceSha).success || !sha.safeParse(input.treeSha).success) throw failure();
  const { root, git } = checkedCurrentRoot(input);
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', input.sourceSha, '--', 'supabase/migrations']);
  if (git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'supabase/migrations']).length) throw failure();
  for (const path of ['supabase', 'supabase/migrations']) if (lstatSync(join(root, path)).isSymbolicLink()) throw failure();
  const tree = git(['ls-tree', '-r', '-z', input.sourceSha, '--', 'supabase/migrations']);
  if(original&&!Buffer.from(tree).equals(Buffer.from(original.tree)))throw failure();
  if(original)verifyMigrationBlobMetadata(git,tree,original.sources);
  const sources = original?.sources??readMigrationBlobBatches(git,tree);
  for(const{name,bytes}of sources){
    const stat=lstatSync(join(root,'supabase/migrations',name));if(!stat.isFile()||stat.isSymbolicLink())throw failure();
    const working = readFileSync(join(root, 'supabase/migrations', name));
    // Only CRLF/LF serialization is tolerated; Git filters cannot conceal altered SQL bytes.
    const normalized=original?.normalized.get(name)??normalizeMigrationBytes(bytes);
    if (bytes.length > 2 * 1024 * 1024 || working.length > 2 * 1024 * 1024 || !Buffer.from(normalized).equals(normalizeMigrationBytes(working))) throw failure();
  }
  if (new Set(sources.map(row => row.name.slice(0, 14))).size !== sources.length) throw failure();
  const physical = readdirSync(join(root, 'supabase/migrations'));
  if (physical.length !== sources.length || physical.some(name => !sources.some(row => row.name === name))) throw failure();
  const provenance={kind:'VERIFIED_GIT_BLOBS' as const,sourceSha:input.sourceSha,treeSha:input.treeSha,migrationTreeSha:git(['rev-parse',`${input.sourceSha}:supabase/migrations`]).toString('utf8').trim(),manifestSha256:hash(tree)};
  if(original&&canonicalReleaseExecutionJson(provenance)!==canonicalReleaseExecutionJson(original.provenance))throw failure();return{sources,provenance,tree:new Uint8Array(tree)};
}
export function readCanonicalMigrationSources(input:{repoRoot:string;sourceSha:string;treeSha:string}):CanonicalMigrationSources{const{sources,provenance}=readCurrentMigrationSources(input);return{sources,provenance};}

declare const canonicalMigrationOperationBrand:unique symbol;
export type CanonicalMigrationOperation={readonly[canonicalMigrationOperationBrand]:true};
export type CanonicalMigrationOperationInput={repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1};
export type CanonicalMigrationOperationRead=CanonicalMigrationSources&{replay:ReturnType<typeof replayPlan>;order:string[];rows:HostedMigrationPlanV1['migrations'];groups:string[][];boundaries:number[]};
type MigrationSourceProjection=Omit<CanonicalMigrationOperationRead,'sources'|'provenance'>;
function migrationSourceProjection(sources:MigrationSource[]):MigrationSourceProjection{const replay=replayPlan(sources),order=[...replay.before,replay.prerequisite,...replay.remaining],rows=order.map(name=>({name,version:name.slice(0,14),sha256:hash(sources.find(row=>row.name===name)!.bytes)})),stop=replay.remaining.indexOf(posthogIntelligenceMigration),groups=[replay.before,[nativeSourceMigration],replay.remaining.slice(0,stop),replay.remaining.slice(stop)],boundaries=groups.map((_,index)=>groups.slice(0,index+1).flat().length);if(stop<0)throw failure();return{replay,order,rows,groups,boundaries};}
export type CanonicalMigrationPriorKind='PRIOR_SCHEMA'|'PRIOR_COMPLETED';
type RetainedHistoricalMigrationSource=MigrationSourceProjection&{sources:MigrationSource[];tree:Uint8Array;provenance:CanonicalMigrationSources['provenance']};
const canonicalMigrationOperations=new WeakMap<object,{binding:string;original:ReturnType<typeof readCurrentMigrationSources>&{normalized:Map<string,Uint8Array>};projection:Omit<CanonicalMigrationOperationRead,'sources'|'provenance'>;historical?:Partial<Record<CanonicalMigrationPriorKind,RetainedHistoricalMigrationSource>>;invalid:boolean;busy:boolean}>();
function migrationOperationInput(value:CanonicalMigrationOperationInput){
 const input=z.object({repoRoot:z.string(),sourceSha:sha,treeSha:sha,plan:z.unknown()}).strict().parse(jsonSnapshot(value)),canonical=canonicalHostedMigrationPlan(input.plan as HostedMigrationPlanV1),plan=JSON.parse(canonical.json) as HostedMigrationPlanV1;
 if(!isAbsolute(input.repoRoot)||resolve(input.repoRoot)!==input.repoRoot||plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha)throw failure();return{input:{...input,plan},binding:canonicalReleaseExecutionJson({repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256})};
}
/** Original immutable SQL/replay data only; every read repeats current source checks. */
export function prepareCanonicalMigrationOperation(value:CanonicalMigrationOperationInput):CanonicalMigrationOperation{
 try{const{input}=migrationOperationInput(value),loaded=readCurrentMigrationSources(input);return registerMigrationOperation(input,loaded,migrationSourceProjection(loaded.sources));}catch{throw failure();}
}
function registerMigrationOperation(value:CanonicalMigrationOperationInput,loaded:ReturnType<typeof readCurrentMigrationSources>,projection:MigrationSourceProjection,prior?:RetainedHistoricalMigrationSource):CanonicalMigrationOperation{
 const{input,binding}=migrationOperationInput(value);if(canonicalReleaseExecutionJson(projection.rows)!==canonicalReleaseExecutionJson(input.plan.migrations)||loaded.provenance.sourceSha!==input.sourceSha||loaded.provenance.treeSha!==input.treeSha)throw failure();const sources=loaded.sources.map(row=>({name:row.name,bytes:new Uint8Array(row.bytes)})),original={...loaded,sources,tree:new Uint8Array(loaded.tree),provenance:{...loaded.provenance},normalized:new Map(sources.map(row=>[row.name,new Uint8Array(normalizeMigrationBytes(row.bytes))]))},token=Object.freeze(Object.create(null)) as CanonicalMigrationOperation,historical:Partial<Record<CanonicalMigrationPriorKind,RetainedHistoricalMigrationSource>>={};
 if(prior){const kind=input.plan.priorSchemaRelease?'PRIOR_SCHEMA':input.plan.priorCompletedRelease?'PRIOR_COMPLETED':undefined,selected=kind==='PRIOR_SCHEMA'?input.plan.priorSchemaRelease:input.plan.priorCompletedRelease;if(!kind||!selected||selected.sourceSha!==prior.provenance.sourceSha||selected.treeSha!==prior.provenance.treeSha)throw failure();historical[kind]=structuredClone(prior);}
 canonicalMigrationOperations.set(token,{binding,original,projection:structuredClone(projection),historical,invalid:false,busy:false});return token;
}
/** Caller objects and arrays never establish a retained source owner. */
export function readCanonicalMigrationOperation(value:unknown,expected:CanonicalMigrationOperationInput):CanonicalMigrationOperationRead{
 if(!value||typeof value!=='object'||types.isProxy(value))throw failure();const held=canonicalMigrationOperations.get(value);if(!held)throw failure();if(held.invalid||held.busy){held.invalid=true;throw failure();}held.busy=true;
 try{const{input,binding}=migrationOperationInput(expected);if(binding!==held.binding)throw failure();readCurrentMigrationSources(input,held.original);if(held.invalid)throw failure();return structuredClone({sources:held.original.sources,provenance:held.original.provenance,...held.projection});}catch{held.invalid=true;throw failure();}finally{held.busy=false;}
}
export function disposeCanonicalMigrationOperation(value:unknown):void{if(!value||typeof value!=='object'||types.isProxy(value))throw failure();const held=canonicalMigrationOperations.get(value);if(!held)throw failure();held.invalid=true;}

/** Closed original prior inventories selected only by the exact bound plan. */
export function readCanonicalMigrationPriorSources(value:unknown,expected:CanonicalMigrationOperationInput,kind:CanonicalMigrationPriorKind):CanonicalMigrationSources|null{
 if(!value||typeof value!=='object'||types.isProxy(value))throw failure();const held=canonicalMigrationOperations.get(value);if(!held)throw failure();if(held.invalid||held.busy){held.invalid=true;throw failure();}held.busy=true;
 try{const{input,binding}=migrationOperationInput(expected);if(binding!==held.binding||!['PRIOR_SCHEMA','PRIOR_COMPLETED'].includes(kind))throw failure();readCurrentMigrationSources(input,held.original);const prior=kind==='PRIOR_SCHEMA'?input.plan.priorSchemaRelease:input.plan.priorCompletedRelease;if(!prior){if(held.invalid)throw failure();return null;}const{git}=checkedRoot(input.repoRoot);if(git(['rev-parse',`${prior.sourceSha}^{tree}`]).toString().trim()!==prior.treeSha||prior.migrationCount!==(kind==='PRIOR_SCHEMA'&&input.plan.originalChildRecovery?124:input.plan.applied.length))throw failure();git(['merge-base','--is-ancestor',prior.sourceSha,input.sourceSha]);const tree=git(['ls-tree','-r','-z',prior.sourceSha,'--','supabase/migrations']);let original=held.historical?.[kind];
  if(!original){if(prior.sourceSha===held.original.provenance.sourceSha&&prior.treeSha===held.original.provenance.treeSha){if(!Buffer.from(tree).equals(Buffer.from(held.original.tree)))throw failure();original={sources:held.original.sources,tree:held.original.tree,provenance:held.original.provenance,...held.projection};verifyMigrationBlobMetadata(git,tree,original.sources);}else{const sources=readMigrationBlobBatches(git,tree).map(row=>({name:row.name,bytes:new Uint8Array(row.bytes)})),projection=migrationSourceProjection(sources);original={sources,tree:new Uint8Array(tree),provenance:{kind:'VERIFIED_GIT_BLOBS',sourceSha:prior.sourceSha,treeSha:prior.treeSha,migrationTreeSha:git(['rev-parse',`${prior.sourceSha}:supabase/migrations`]).toString().trim(),manifestSha256:hash(tree)},...projection};}held.historical??={};held.historical[kind]=original;}else{if(!Buffer.from(tree).equals(Buffer.from(original.tree))||git(['rev-parse',`${prior.sourceSha}:supabase/migrations`]).toString().trim()!==original.provenance.migrationTreeSha)throw failure();verifyMigrationBlobMetadata(git,tree,original.sources);}
  if(kind==='PRIOR_SCHEMA')validatePriorSchemaRows(input.plan,original.sources,original);else{if(original.sources.length!==prior.migrationCount||original.order.length!==prior.migrationCount||canonicalReleaseExecutionJson(original.rows)!==canonicalReleaseExecutionJson(input.plan.migrations.slice(0,prior.migrationCount)))throw failure();}
  if(held.invalid)throw failure();return structuredClone({sources:original.sources,provenance:original.provenance});
 }catch{held.invalid=true;throw failure();}finally{held.busy=false;}
}
function readOperationPriorFacade(value:unknown,repoRoot:string,plan:HostedMigrationPlanV1,kind:CanonicalMigrationPriorKind){if(!value||typeof value!=='object'||types.isProxy(value))throw failure();const held=canonicalMigrationOperations.get(value);if(!held)throw failure();try{const checked=JSON.parse(canonicalHostedMigrationPlan(plan).json) as HostedMigrationPlanV1;return readCanonicalMigrationPriorSources(value,{repoRoot,sourceSha:checked.source.sha,treeSha:checked.source.tree,plan:checked},kind)?.sources??null;}catch{held.invalid=true;throw failure();}}

/** Revalidate a completed historical inventory independently at every native
 * consumer. A caller count alone never widens an unknown partial stage. */
export function readVerifiedCompletedMigrationSources(repoRoot:string,plan:HostedMigrationPlanV1,operation?:CanonicalMigrationOperation):MigrationSource[]|null{
 if(operation!==undefined)return readOperationPriorFacade(operation,repoRoot,plan,'PRIOR_COMPLETED');
 if(!plan.priorCompletedRelease)return null;
 const {git}=checkedRoot(repoRoot),prior=plan.priorCompletedRelease;
 if(git(['rev-parse',`${prior.sourceSha}^{tree}`]).toString().trim()!==prior.treeSha||prior.migrationCount!==plan.applied.length)throw failure();
 git(['merge-base','--is-ancestor',prior.sourceSha,plan.source.sha]);
 const sources=readHistoricalMigrationSources(repoRoot,prior.sourceSha,prior.treeSha);
 if(sources.length!==prior.migrationCount)throw failure();
 const history=plan.migrations.slice(0,prior.migrationCount);
 const original=new Map(sources.map(source=>[source.name,source.bytes]));
 for(const row of history){const bytes=original.get(row.name);if(!bytes||hash(bytes)!==row.sha256)throw failure();}
 return sources;
}
export function verifyCompletedMigrationPrefix(repoRoot:string,plan:HostedMigrationPlanV1,operation?:CanonicalMigrationOperation):boolean{
 return readVerifiedCompletedMigrationSources(repoRoot,plan,operation)!==null;
}

/** Internal rows come only from this owner's actual original Git acquisition. */
function validatePriorSchemaRows(plan:HostedMigrationPlanV1,sources:MigrationSource[],retained?:RetainedHistoricalMigrationSource):void{
 const prior=plan.priorSchemaRelease;if(!prior||prior.migrationCount!==(plan.originalChildRecovery?124:plan.applied.length))throw failure();const replay=retained?.replay??replayPlan(sources);
 if(plan.originalChildRecovery){const context=validateOriginalChildRecoveryPlanContext(plan.originalChildRecovery,plan.migrations,plan.source),fingerprint=originalChildRecoveryFingerprint(context.template);if(plan.applied.length!==144||!plan.reconciledChild||plan.reconciledChild.templateSha256!==fingerprint.templateSha256||plan.reconciledChild.historySha256!==context.template.afterHistorySha256||prior.sourceSha!==context.installedMarker.sourceSha||prior.treeSha!==context.installedMarker.treeSha)throw failure();const historical=retained?.replay??replayPlan(sources),rows=retained?.rows??[...historical.before,historical.prerequisite,...historical.remaining].map(name=>({name,version:name.slice(0,14),sha256:hash(sources.find(source=>source.name===name)!.bytes)}));if(canonicalReleaseExecutionJson(rows.slice(0,180))!==canonicalReleaseExecutionJson(context.template.stageRows))throw failure();}
 const order=[...replay.before,replay.prerequisite,...replay.remaining],boundaries=[replay.before.length,replay.before.length+1,replay.before.length+1+replay.remaining.indexOf(posthogIntelligenceMigration),order.length];
 if(!boundaries.includes(prior.migrationCount)){if(prior.migrationCount!==120||!plan.reconciliationTemplate)throw failure();const template=parseReconciliationTemplate(plan.reconciliationTemplate);verifyReconciledPrefix(template,plan.migrations);if(template.recoverySource.sourceSha!==plan.source.sha||template.recoverySource.treeSha!==plan.source.tree||template.originalIdentity.sourceSha!==prior.sourceSha||template.originalIdentity.treeSha!==prior.treeSha)throw failure();}
 else if(plan.reconciliationTemplate)throw failure();
 for(const[index,row]of plan.migrations.slice(0,prior.migrationCount).entries())if(row.name!==order[index]||(retained?retained.rows[index]?.sha256:hash(sources.find(source=>source.name===row.name)!.bytes))!==row.sha256)throw failure();
}
/** Fresh historical bytes and exact prefix semantics only; no native authority. */
export function readVerifiedPriorSchemaSources(repoRoot:string,plan:HostedMigrationPlanV1,operation?:CanonicalMigrationOperation):MigrationSource[]|null{
 if(operation!==undefined)return readOperationPriorFacade(operation,repoRoot,plan,'PRIOR_SCHEMA');
 if(!plan.priorSchemaRelease)return null;
 const{git}=checkedRoot(repoRoot),prior=plan.priorSchemaRelease;
 if(git(['rev-parse',`${prior.sourceSha}^{tree}`]).toString().trim()!==prior.treeSha||prior.migrationCount!==(plan.originalChildRecovery?124:plan.applied.length))throw failure();
 git(['merge-base','--is-ancestor',prior.sourceSha,plan.source.sha]);
 const sources=readHistoricalMigrationSources(repoRoot,prior.sourceSha,prior.treeSha);validatePriorSchemaRows(plan,sources);return sources;
}
/** A verified historical stage prefix never becomes whole-source completion. */
export function verifyPriorSchemaPrefix(repoRoot:string,plan:HostedMigrationPlanV1,operation?:CanonicalMigrationOperation):boolean{
 return readVerifiedPriorSchemaSources(repoRoot,plan,operation)!==null;
}

/** A release entry also requires all tracked and untracked authored source to match the admitted commit. */
type CanonicalHostedPlanInput={repoRoot:string;sourceSha:string;treeSha:string;target:unknown;priorReceipt?:unknown;reconciliationTemplate?:unknown;originalChildRecovery?:unknown;now:number};
function captureCanonicalHostedMigrationPlan(input:CanonicalHostedPlanInput){
  const loaded=readCurrentMigrationSources(input),projection=migrationSourceProjection(loaded.sources);
  const { git } = checkedRoot(input.repoRoot);
  git(['diff', '--quiet', '--no-ext-diff', '--no-textconv', input.sourceSha, '--']);
  if (git(['ls-files', '--others', '--exclude-standard', '-z']).length) throw failure();
  const prior=input.priorReceipt===undefined?undefined:priorSchema.parse(input.priorReceipt);
  let priorSources:MigrationSource[]|undefined;
  let capturedPrior:RetainedHistoricalMigrationSource|undefined;
  if(prior){
    if (git(['rev-parse', '--verify', `${prior.sourceSha}^{commit}`]).toString('utf8').trim() !== prior.sourceSha
      || git(['rev-parse', `${prior.sourceSha}^{tree}`]).toString('utf8').trim() !== prior.treeSha) throw failure();
    git(['merge-base', '--is-ancestor', prior.sourceSha, input.sourceSha]);
    const sameSource=prior.sourceSha===input.sourceSha&&prior.treeSha===input.treeSha;priorSources=sameSource?loaded.sources:readHistoricalMigrationSources(input.repoRoot,prior.sourceSha,prior.treeSha);
    const priorProjection=sameSource?projection:migrationSourceProjection(priorSources),tree=git(['ls-tree','-r','-z',prior.sourceSha,'--','supabase/migrations']),migrationTreeSha=git(['rev-parse',`${prior.sourceSha}:supabase/migrations`]).toString().trim();if(sameSource){if(!Buffer.from(tree).equals(Buffer.from(loaded.tree))||migrationTreeSha!==loaded.provenance.migrationTreeSha)throw failure();verifyMigrationBlobMetadata(git,tree,loaded.sources);}capturedPrior={sources:priorSources,tree:new Uint8Array(tree),provenance:{kind:'VERIFIED_GIT_BLOBS',sourceSha:prior.sourceSha,treeSha:prior.treeSha,migrationTreeSha,manifestSha256:hash(tree)},...priorProjection};
  }
  const plan = planHostedMigrationsFromSources({ sources: loaded.sources, source: { sha: input.sourceSha, tree: input.treeSha }, target: input.target, priorReceipt: input.priorReceipt, reconciliationTemplate:input.reconciliationTemplate,originalChildRecovery:input.originalChildRecovery, now: input.now },priorSources,projection,capturedPrior);
  if (prior&&priorSources) {
    const priorByName=new Map(priorSources.map(source=>[source.name,source.bytes]));
    if (prior.completedSourceMigrationCount !== undefined) {
      if (priorSources.length !== prior.completedSourceMigrationCount || prior.migrations.length !== priorSources.length) throw failure();
    }
    for (const row of prior.migrations) {
      const current = plan.migrations.find(value => value.version === row.version);
      const bytes=current?priorByName.get(current.name):undefined;
      if (!bytes || hash(bytes) !== row.sha256) throw failure();
    }
    if(plan.priorSchemaRelease)validatePriorSchemaRows(plan,priorSources,capturedPrior);
  }
  else if(plan.priorSchemaRelease)verifyPriorSchemaPrefix(input.repoRoot,plan);
  return {result:{plan,sourceProvenance:loaded.provenance,priorReceiptProvenance:input.priorReceipt===undefined?'NOT_APPLICABLE' as const:'VERIFIED_PRIOR_GIT_SOURCE_HASHES_ONLY' as const},loaded,projection,capturedPrior};
}
type RuntimePlanInput={repoRoot:string;sourceSha:string;treeSha:string;target:unknown;priorReceipt:unknown;now:number};
type CanonicalMigrationPreparationMode='HOSTED_MIGRATIONS'|'INSTALLED_RUNTIME_READ_ONLY'|'PENDING_RUNTIME_CONFIRMATION'|'RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE';
export type CanonicalMigrationPreparationInput=(CanonicalHostedPlanInput&{mode:'HOSTED_MIGRATIONS'})|(RuntimePlanInput&{mode:Exclude<CanonicalMigrationPreparationMode,'HOSTED_MIGRATIONS'>});
function captureCanonicalMigrationPreparation(value:CanonicalMigrationPreparationInput){
 const common={repoRoot:z.string(),sourceSha:sha,treeSha:sha,target:z.unknown(),now:z.number().int().safe().nonnegative()},schema=z.union([z.object({...common,mode:z.literal('HOSTED_MIGRATIONS'),priorReceipt:z.unknown().optional(),reconciliationTemplate:z.unknown().optional(),originalChildRecovery:z.unknown().optional()}).strict(),z.object({...common,mode:z.enum(['INSTALLED_RUNTIME_READ_ONLY','PENDING_RUNTIME_CONFIRMATION','RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE']),priorReceipt:z.unknown()}).strict()]),input=schema.parse(jsonSnapshot(value));
 let target=input.target;if(input.mode!=='HOSTED_MIGRATIONS'){const active=targetSchema.extend({population:z.literal('ACTIVE_SYNTHETIC'),dispatchDisabled:z.boolean()}).parse(input.target),prior=priorSchema.parse(input.priorReceipt);if(active.authUsers!==133||prior.completedSourceMigrationCount!==prior.migrations.length||active.migrationVersions.length!==prior.migrations.length||input.mode!=='RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE'&&(prior.sourceSha!==input.sourceSha||prior.treeSha!==input.treeSha))throw failure();target={...active,population:'GUARDED_SYNTHETIC',dispatchDisabled:true};}
 const captured=captureCanonicalHostedMigrationPlan({...input,target});if(input.mode!=='HOSTED_MIGRATIONS'){if(captured.result.plan.pending.length||captured.result.plan.stages.some(stage=>stage.names.length)||captured.result.plan.migrations.length!==priorSchema.parse(input.priorReceipt).migrations.length)throw failure();captured.result.plan={...captured.result.plan,runtimeOnly:true};canonicalHostedMigrationPlan(captured.result.plan);}return{...captured,input};
}
function planningSources(captured:ReturnType<typeof captureCanonicalMigrationPreparation>){return{result:captured.result,sources:captured.loaded.sources};}
/** Compatibility facade delegates the same private canonical preparation core. */
export function createCanonicalHostedMigrationPlanAndSources(input:CanonicalHostedPlanInput){return planningSources(captureCanonicalMigrationPreparation({...jsonSnapshot(input) as CanonicalHostedPlanInput,mode:'HOSTED_MIGRATIONS'}));}
/** Private actual acquisition becomes an owner only after the final mode plan is known. */
export function createCanonicalMigrationPreparationAndOperation(value:CanonicalMigrationPreparationInput){const captured=captureCanonicalMigrationPreparation(value),plan=captured.result.plan,binding={repoRoot:captured.input.repoRoot,sourceSha:captured.input.sourceSha,treeSha:captured.input.treeSha,plan},operation=registerMigrationOperation(binding,captured.loaded,captured.projection,captured.capturedPrior);try{readCanonicalMigrationOperation(operation,binding);return{result:structuredClone(captured.result),sources:structuredClone(captured.loaded.sources),operation};}catch{disposeCanonicalMigrationOperation(operation);throw failure();}}

/** Public planning results retain their original serialized shape. Raw source
 * observations belong only to this synchronous preparation call. */
export function createCanonicalHostedMigrationPlan(input:Parameters<typeof createCanonicalHostedMigrationPlanAndSources>[0]){return createCanonicalHostedMigrationPlanAndSources(input).result;}

/** Active installed-runtime inspection has no schema execution authority. */
export function createCanonicalInstalledRuntimePlanAndSources(input:{repoRoot:string;sourceSha:string;treeSha:string;target:unknown;priorReceipt:unknown;now:number;operation:'INSTALLED_RUNTIME_READ_ONLY'}){
 const checked=jsonSnapshot(input) as typeof input;if(checked.operation!=='INSTALLED_RUNTIME_READ_ONLY')throw failure();
 const{operation:_operation,...metadata}=checked;void _operation;return planningSources(captureCanonicalMigrationPreparation({...metadata,mode:'INSTALLED_RUNTIME_READ_ONLY'}));
}
/** Pending confirmation reuses exact complete-source no-op verification; this
 * plan cannot establish activation or permit SQL execution. */
export function createCanonicalPendingRuntimeConfirmationPlanAndSources(input:{repoRoot:string;sourceSha:string;treeSha:string;target:unknown;priorReceipt:unknown;now:number;operation:'PENDING_RUNTIME_CONFIRMATION'}){
 const checked=jsonSnapshot(input) as typeof input;if(checked.operation!=='PENDING_RUNTIME_CONFIRMATION')throw failure();const{operation:_operation,...metadata}=checked;void _operation;return planningSources(captureCanonicalMigrationPreparation({...metadata,mode:'PENDING_RUNTIME_CONFIRMATION'}));
}
/** An operating update can have different repository provenance while retaining
 * the exact installed migration set. No SQL authority comes from this plan. */
export function createCanonicalRuntimeRolloutPlanAndSources(input:{repoRoot:string;sourceSha:string;treeSha:string;target:unknown;priorReceipt:unknown;now:number;operation:'RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE'}){
 const checked=jsonSnapshot(input) as typeof input;if(checked.operation!=='RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE')throw failure();
 const{operation:_operation,...metadata}=checked;void _operation;return planningSources(captureCanonicalMigrationPreparation({...metadata,mode:'RUNTIME_ROLLOUT_NO_SCHEMA_CHANGE'}));
}
export function createCanonicalInstalledRuntimePlan(input:Parameters<typeof createCanonicalInstalledRuntimePlanAndSources>[0]){return createCanonicalInstalledRuntimePlanAndSources(input).result;}
export function createCanonicalPendingRuntimeConfirmationPlan(input:Parameters<typeof createCanonicalPendingRuntimeConfirmationPlanAndSources>[0]){return createCanonicalPendingRuntimeConfirmationPlanAndSources(input).result;}
export function createCanonicalRuntimeRolloutPlan(input:Parameters<typeof createCanonicalRuntimeRolloutPlanAndSources>[0]){return createCanonicalRuntimeRolloutPlanAndSources(input).result;}
const plannedRowSchema = rowSchema.extend({ name: z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/) }).strict();
const planSchema = z.object({
  version: z.literal(1), mode: z.enum(['EMPTY_INITIAL', 'INCREMENTAL']), provenance: z.literal('CALLER_SUPPLIED_SOURCE'), source: identitySchema,
  projectRef, observedAt: z.iso.datetime({ offset: true }), migrations: z.array(plannedRowSchema).min(1).max(1000), applied: z.array(rowSchema).max(1000), pending: z.array(plannedRowSchema).max(1000),
  stages: z.array(z.object({ id: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), names: z.array(z.string()).max(1000) }).strict()).length(4),
  priorCompletedRelease: z.object({sourceSha:sha,treeSha:sha,migrationCount:z.number().int().positive().max(1000)}).strict().optional(),
  priorSchemaRelease: z.object({sourceSha:sha,treeSha:sha,migrationCount:z.number().int().positive().max(1000)}).strict().optional(),
  runtimeOnly:z.literal(true).optional(),
  reconciliationTemplate:z.unknown().optional(),
  originalChildRecovery:originalChildRecoveryPlanContextSchema.optional(),
  reconciledChild:z.object({version:z.literal(1),purpose:z.literal('CUEVO_RECONCILED_CHILD144_PLAN'),observedMigrationCount:z.literal(144),historySha256:digest,templateSha256:digest,catalogueReferenceSha256:digest}).strict().optional(),
  sourceSetSha256: digest, observedHistorySha256: digest, dispatch: z.literal('DISABLED'), seed: z.literal('DISABLED'), vault: z.literal('DISABLED'),
}).strict();
function jsonSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 20) throw failure();
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw failure();
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw failure();
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure();
    Object.defineProperty(result, key, { value: jsonSnapshot(field.value, depth + 1), enumerable: true, configurable: true, writable: true });
  }
  return result;
}
/** Canonical JSON is a validated metadata serialization, never Git, hosted or release admission. */
export function canonicalHostedMigrationPlan(plan: HostedMigrationPlanV1) {
  const value = planSchema.parse(jsonSnapshot(plan));
  if (value.sourceSetSha256 !== hash(JSON.stringify(value.migrations)) || value.observedHistorySha256 !== hash(JSON.stringify(value.applied.map(row => row.version).sort()))
    || new Set(value.migrations.map(row => row.version)).size !== value.migrations.length || value.migrations.some(row => row.name.slice(0, 14) !== row.version)
    || JSON.stringify(value.pending) !== JSON.stringify(value.migrations.slice(value.applied.length))
    || JSON.stringify(value.applied) !== JSON.stringify(value.migrations.slice(0, value.applied.length).map(({ version, sha256 }) => ({ version, sha256 })))
    || value.stages.map(stage => stage.id).join('|') !== 'prefix|native|pre-observability|remaining'
    || JSON.stringify(value.stages.flatMap(stage => stage.names)) !== JSON.stringify(value.pending.map(row => row.name))) throw failure();
  if(value.priorCompletedRelease&&value.priorCompletedRelease.migrationCount!==value.applied.length)throw failure();
  if(value.priorSchemaRelease&&(value.priorSchemaRelease.migrationCount!==(value.originalChildRecovery?124:value.applied.length)||value.priorCompletedRelease))throw failure();
  if(value.originalChildRecovery){const context=validateOriginalChildRecoveryPlanContext(value.originalChildRecovery,value.migrations,value.source);if(value.mode!=='INCREMENTAL'||value.applied.length!==144||value.runtimeOnly||value.reconciliationTemplate||!value.priorSchemaRelease||value.priorSchemaRelease.sourceSha!==context.installedMarker.sourceSha||value.priorSchemaRelease.treeSha!==context.installedMarker.treeSha||!value.reconciledChild||canonicalReleaseExecutionJson(value.reconciledChild)!==canonicalReleaseExecutionJson(originalChildReconciledPlanProjection(context)))throw failure();}else if(value.reconciledChild||value.priorSchemaRelease?.migrationCount===144)throw failure();
  if(value.reconciliationTemplate!==undefined){const template=parseReconciliationTemplate(value.reconciliationTemplate);verifyReconciledPrefix(template,value.migrations);if(value.applied.length!==120||!value.priorSchemaRelease||template.recoverySource.sourceSha!==value.source.sha||template.recoverySource.treeSha!==value.source.tree||template.originalIdentity.sourceSha!==value.priorSchemaRelease.sourceSha||template.originalIdentity.treeSha!==value.priorSchemaRelease.treeSha||template.originalIdentity.projectRef!==value.projectRef||value.runtimeOnly)throw failure();value.reconciliationTemplate=template;}
  if(value.priorSchemaRelease?.migrationCount===120&&value.reconciliationTemplate===undefined)throw failure();
  if(value.runtimeOnly&&(!value.priorCompletedRelease||value.pending.length||value.stages.some(stage=>stage.names.length)))throw failure();
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return '[' + item.map(canonical).join(',') + ']';
    if (item !== null && typeof item === 'object') return '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + canonical((item as Record<string, unknown>)[key])).join(',') + '}';
    return JSON.stringify(item);
  };
  const json = canonical(value);
  if (Buffer.byteLength(json) > 1024 * 1024) throw failure();
  return { json, sha256: hash(json) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 5 || process.argv[2] !== '--input') throw failure();
  const inputBytes = readFileSync(resolve(process.argv[3]));
  if (inputBytes.length > 1024 * 1024) throw failure();
  const input = JSON.parse(inputBytes.toString('utf8')) as Parameters<typeof createCanonicalHostedMigrationPlan>[0];
  if (process.argv[4] !== '--metadata-only') throw failure();
  const result = createCanonicalHostedMigrationPlan(input);
  console.log(JSON.stringify({ ...canonicalHostedMigrationPlan(result.plan), sourceProvenance: result.sourceProvenance }));
}
