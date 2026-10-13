import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { assertReplayWorkdirs, createReplayWorkdirs, type ReplayWorkdirs } from './replay-workdir';
import { posthogEnvironmentMigration, posthogIntelligenceMigration } from './replay-plan';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from '../configure-local';
import { runPrefixResetCommand } from './reset-local-diagnostic';

export async function resetCuevoLocalDatabase(prepared?: ReplayWorkdirs) {
  assertCuevoLocalConfig(await readFile('supabase/config.toml', 'utf8'));
  const cli = resolve('node_modules/supabase/dist/supabase.js');
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
  assertCuevoLocalTarget(status);
  const stage = prepared ?? await createReplayWorkdirs();
  console.log('Resetting only verified local Cuevo with reviewed immutable migration dependency order.');
  let sourceSha: string | null = null, treeSha: string | null = null;
  try {
    sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    treeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!/^[a-f0-9]{40}$/.test(sourceSha) || !/^[a-f0-9]{40}$/.test(treeSha)) { sourceSha = null; treeSha = null; }
  } catch { sourceSha = null; treeSha = null; }
  const operation = stage.root.split(/[\\/]/).at(-1)!;
  const env = process.env;
  const ci = env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? '') && /^[1-9][0-9]{0,18}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') && /^[a-zA-Z0-9_-]{1,80}$/.test(env.GITHUB_JOB ?? '') && /^[a-zA-Z0-9_-]{1,80}$/.test(env.CUEVO_VERIFICATION_SCOPE ?? '') && /^[a-f0-9-]{36}$/.test(env.CUEVO_VERIFICATION_RUN_ID ?? '') && sourceSha === env.CUEVO_VERIFICATION_SOURCE_SHA
    ? { repository: env.GITHUB_REPOSITORY!, runId: env.GITHUB_RUN_ID!, attempt: Number(env.GITHUB_RUN_ATTEMPT), job: env.GITHUB_JOB!, scope: env.CUEVO_VERIFICATION_SCOPE!, verificationRunId: env.CUEVO_VERIFICATION_RUN_ID! } : null;
  assertReplayWorkdirs(stage, stage.prefix);
  await runPrefixResetCommand(process.execPath, [cli, 'db', 'reset', '--local', '--no-seed', '--network-id', 'cuevo-local', '--workdir', stage.prefix, '--yes'], {
    spawn,
    write: async diagnostic => {
      if (!/^operation-[a-zA-Z0-9_-]{1,80}$/.test(operation)) return;
      assertReplayWorkdirs(stage, stage.prefix);
      await writeFile(resolve(stage.root, 'reset-diagnostic.json'), JSON.stringify({ version: 1, purpose: 'CUEVO_LOCAL_PREFIX_RESET_DIAGNOSTIC', context: { sourceSha, treeSha, operation, ci }, cliVersion: '2.119.0', ...diagnostic, observedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
    },
  });
  assertReplayWorkdirs(stage, stage.prerequisite);
  execFileSync(process.execPath, [cli, 'migration', 'up', '--include-all', '--local', '--network-id', 'cuevo-local', '--workdir', stage.prerequisite], { stdio: 'inherit' });
  const environmentStage = resolve(stage.root, 'posthog-environment');
  await mkdir(resolve(environmentStage, 'supabase/migrations'), { recursive: true });
  await writeFile(resolve(environmentStage, 'supabase/config.toml'), (await readFile('supabase/config.toml', 'utf8')).replace(/(\[db\.seed\][\s\S]*?enabled\s*=\s*)true/, '$1false'));
  for (const file of stage.files.filter(file => file.name.slice(0, 14) < posthogIntelligenceMigration.slice(0, 14) || file.name === posthogEnvironmentMigration)) await writeFile(resolve(environmentStage, 'supabase/migrations', file.name), file.bytes);
  assertReplayWorkdirs(stage, environmentStage);
  execFileSync(process.execPath, [cli, 'migration', 'up', '--include-all', '--local', '--network-id', 'cuevo-local', '--workdir', environmentStage], { stdio: 'inherit' });
  assertReplayWorkdirs(stage);
  execFileSync(process.execPath, [cli, 'migration', 'up', '--include-all', '--local', '--network-id', 'cuevo-local'], { stdio: 'inherit' });
  const pool = new Pool({ connectionString: status.DB_URL });
  try {
    const expected = stage.files.map(file => file.name.slice(0, 14)).sort();
    const applied = (await pool.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version);
    if (JSON.stringify(expected) !== JSON.stringify(applied)) throw Error('Complete migration history does not match reviewed sources');
    const validation = await pool.query("select current_setting('check_function_bodies')='on'and to_regprocedure('internal.curriculum_open_work_count(uuid,uuid)')is not null and to_regclass('internal.academic_result_sources')is not null as ready");
    if (validation.rows[0]?.ready !== true) throw Error('Complete migration dependency validation failed');
    const seed = await readFile('supabase/seed/seed.sql', 'utf8');
    assertReplayWorkdirs(stage);
    await pool.query(seed);
  } finally { await pool.end(); }
  console.log('Complete original migrations and synthetic seed applied. Replay evidence: ' + stage.root);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await resetCuevoLocalDatabase();
