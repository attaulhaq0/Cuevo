import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const run = (script: string) => execFileSync(process.execPath, ['--import', 'tsx', resolve(script)], { stdio: 'inherit' });
run('scripts/start-supabase.ts');
execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'db', 'reset', '--local', '--network-id', 'cuevo-local', '--yes'], { stdio: 'inherit' });
run('scripts/configure-local.ts');
execFileSync(process.execPath, ['--env-file=.env.local', '--import', 'tsx', resolve('scripts/seed-auth.ts')], { stdio: 'inherit' });
