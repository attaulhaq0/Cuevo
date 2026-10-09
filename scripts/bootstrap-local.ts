import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from './configure-local';
import { pathToFileURL } from 'node:url';
import { createReplayWorkdirs } from './database/replay-workdir';
import { startCuevoSupabase } from './start-supabase';
import { resetCuevoLocalDatabase } from './database/reset-local';

// This advertised bootstrap intentionally replaces only the verified local synthetic database.
export async function bootstrapCuevoLocal() {
  const config = await readFile('supabase/config.toml', 'utf8');
  assertCuevoLocalConfig(config);
  const run = (script: string) => execFileSync(process.execPath, ['--import', 'tsx', resolve(script)], { stdio: 'inherit' });
  const replay = await createReplayWorkdirs();
  await startCuevoSupabase(replay);
  const cli = resolve('node_modules/supabase/dist/supabase.js');
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
  assertCuevoLocalTarget(status);
  console.log('Resetting the verified local Cuevo synthetic database on port 56322.');
  await resetCuevoLocalDatabase(replay);
  run('scripts/database/harden-local-worker-transport.ts');
  run('scripts/configure-local.ts');
  execFileSync(process.execPath, ['--env-file=.env.local', '--import', 'tsx', resolve('scripts/seed-auth.ts')], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--env-file=.env.local', '--import', 'tsx', resolve('scripts/seed-reference-scenarios.ts')], { stdio: 'inherit' });
  run('scripts/runtime/drain-local-reference.ts');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await bootstrapCuevoLocal();
