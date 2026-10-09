import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertReplayWorkdirs, createReplayWorkdirs, type ReplayWorkdirs } from './database/replay-workdir';
export async function startCuevoSupabase(prepared?: ReplayWorkdirs) {
  const replay = prepared ?? await createReplayWorkdirs();
  const networkName = 'cuevo-local';
  assertReplayWorkdirs(replay);
  try { execFileSync('docker', ['network', 'inspect', networkName], { stdio: 'ignore' }); }
  catch { assertReplayWorkdirs(replay); execFileSync('docker', ['network', 'create', '--subnet', '10.252.60.0/24', networkName], { stdio: 'ignore' }); }
  await mkdir('.local', { recursive: true });
  try {
    assertReplayWorkdirs(replay, replay.prefix);
    const output = execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'start', '--workdir', replay.prefix, '--network-id', networkName, '--exclude', 'studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
    await writeFile('.local/supabase-start.log', output, { mode: 0o600 });
    console.log('Cuevo local Supabase is ready. Credential output is retained only in ignored .local/supabase-start.log.');
  } catch { throw new Error('Cuevo local Supabase failed to start; inspect local Docker state without printing credentials.'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await startCuevoSupabase();
