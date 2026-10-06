import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { replayPlan } from './replay-plan';

type Source = { name: string; bytes: Uint8Array };
type Project = { id: string; name: string; status: string };
type EmptyTarget = { authUsers: number; storageObjects: number; appSchemas: string[]; migrationVersions: string[] };
const referencePattern = /^[a-z]{20}$/;
const unsafe = () => new Error('Hosted synthetic planning requires an explicitly bound healthy empty Cuevo target; details withheld.');

export function validateHostedEmptyTarget(value: unknown): EmptyTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unsafe();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== 'appSchemas|authUsers|migrationVersions|storageObjects'
    || item.authUsers !== 0 || item.storageObjects !== 0
    || !Array.isArray(item.appSchemas) || item.appSchemas.length !== 0
    || !Array.isArray(item.migrationVersions) || item.migrationVersions.length !== 0) throw unsafe();
  return item as EmptyTarget;
}

/** Metadata-only planning: no migrations, credentials, Auth seed or worker activation. */
export function hostedSyntheticPlan(projectRef: string, settings: Record<string, string | undefined>, project: Project, target: unknown, sources: Source[]) {
  if (!referencePattern.test(projectRef) || settings.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'synthetic-staging'
    || settings.CUEVO_SYNTHETIC_PROJECT_REF !== projectRef || project.id !== projectRef
    || project.name.toLowerCase() !== 'cuevo' || project.status !== 'ACTIVE_HEALTHY') throw unsafe();
  validateHostedEmptyTarget(target);
  const replay = replayPlan(sources);
  const order = [...replay.before, replay.prerequisite, ...replay.remaining];
  return {
    version: 1, projectRef, mode: 'SCHEMA_PLAN_ONLY', dispatch: 'DISABLED',
    migrations: order.map(name => {
      const source = sources.find(item => item.name === name)!;
      return { name, version: name.slice(0, 14), sha256: createHash('sha256').update(source.bytes).digest('hex') };
    }),
    prerequisites: ['reviewed ordered migration application', 'restricted runtime roles and verified TLS', 'provider-owned Vault/network effective denial', 'separate synthetic identities and source seed', 'hosted private Storage/Realtime and recovery', 'exact source review and canonical CI'],
  };
}

async function readManagement(path: string, token: string, body?: { query: string }): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('https://api.supabase.com/v1/' + path, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('Hosted planning management read is unavailable; details withheld.'); }
  if (!response.ok) throw new Error('Hosted planning management read was refused; details withheld.');
  try { return await response.json(); } catch { throw new Error('Hosted planning response is invalid; details withheld.'); }
}

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--project-ref') throw new Error('Usage: hosted-synthetic-plan --project-ref <explicit Cuevo ref>. No application flag is supported.');
  const projectRef = process.argv[3];
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!referencePattern.test(projectRef) || projectRef !== process.env.CUEVO_SYNTHETIC_PROJECT_REF || process.env.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'synthetic-staging' || !token) throw unsafe();
  const projects = await readManagement('projects', token);
  if (!Array.isArray(projects)) throw unsafe();
  const project = projects.find(item => item?.id === projectRef) as Project | undefined;
  if (!project || project.name?.toLowerCase() !== 'cuevo' || project.status !== 'ACTIVE_HEALTHY') throw unsafe();
  const rows = await readManagement(`projects/${projectRef}/database/query`, token, { query: `select
    (select count(*) from auth.users) as "authUsers",
    (select count(*) from storage.objects) as "storageObjects",
    coalesce((select jsonb_agg(nspname order by nspname) from pg_namespace where nspname in ('app','internal','authorization')),'[]'::jsonb) as "appSchemas",
    case when to_regclass('supabase_migrations.schema_migrations') is null then '[]'::jsonb else null end as "migrationVersions"` });
  if (!Array.isArray(rows) || rows.length !== 1) throw unsafe();
  // Existing migration history needs a separate incremental release; this empty-target plan refuses it.
  const sources = await Promise.all((await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).map(async name => ({ name, bytes: await readFile(resolve('supabase/migrations', name)) })));
  const plan = hostedSyntheticPlan(projectRef, process.env, project, rows[0], sources);
  const directory = resolve('.local/hosted-synthetic', projectRef);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'schema-plan.json'), JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: plan.mode, projectRef, migrations: plan.migrations.length, dispatch: plan.dispatch, receipt: '.local/hosted-synthetic/' + projectRef + '/schema-plan.json' }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
