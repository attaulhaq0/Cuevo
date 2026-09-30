import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const networkName = 'cuevo-local';
try { execFileSync('docker', ['network', 'inspect', networkName], { stdio: 'ignore' }); }
catch { execFileSync('docker', ['network', 'create', '--subnet', '10.252.60.0/24', networkName], { stdio: 'ignore' }); }
await mkdir('.local', { recursive: true });
try {
  const output = execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'start', '--network-id', networkName, '--exclude', 'studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
  await writeFile('.local/supabase-start.log', output, { mode: 0o600 });
  console.log('Cuevo local Supabase is ready. Credential output is retained only in ignored .local/supabase-start.log.');
} catch { throw new Error('Cuevo local Supabase failed to start; inspect local Docker state without printing credentials.'); }
