import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertCuevoLocalConfig, assertCuevoLocalTarget, type LocalStatus } from './configure-local';

// This advertised bootstrap intentionally replaces only the verified local synthetic database.
const config = await readFile('supabase/config.toml', 'utf8');
assertCuevoLocalConfig(config);
const run = (script: string) => execFileSync(process.execPath, ['--import', 'tsx', resolve(script)], { stdio: 'inherit' });
run('scripts/start-supabase.ts');
const cli = resolve('node_modules/supabase/dist/supabase.js');
const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus;
assertCuevoLocalTarget(status);
console.log('Resetting the verified local Cuevo synthetic database on port 56322.');
execFileSync(process.execPath, [cli, 'db', 'reset', '--local', '--network-id', 'cuevo-local', '--yes'], { stdio: 'inherit' });
run('scripts/configure-local.ts');
execFileSync(process.execPath, ['--env-file=.env.local', '--import', 'tsx', resolve('scripts/seed-auth.ts')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--env-file=.env.local', '--import', 'tsx', resolve('scripts/seed-reference-scenarios.ts')], { stdio: 'inherit' });
