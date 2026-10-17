import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertReplayWorkdirs, createReplayWorkdirs, type ReplayWorkdirs } from './database/replay-workdir';
import { startFailureDiagnostic, type StartFailureStage } from './database/start-local-diagnostic';
export async function startCuevoSupabase(prepared?: ReplayWorkdirs) {
  const replay = prepared ?? await createReplayWorkdirs();
  const networkName = 'cuevo-local';
  assertReplayWorkdirs(replay);
  try { execFileSync('docker', ['network', 'inspect', networkName], { stdio: 'ignore' }); }
  catch { assertReplayWorkdirs(replay); execFileSync('docker', ['network', 'create', '--subnet', '10.252.60.0/24', networkName], { stdio: 'ignore' }); }
  await mkdir('.local', { recursive: true });
  let stage: StartFailureStage = 'BEFORE_START_GUARD';
  try {
    assertReplayWorkdirs(replay, replay.prefix);
    stage = 'CLI_START_FAILURE';
    const output = execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'start', '--workdir', replay.prefix, '--network-id', networkName, '--exclude', 'studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
    stage = 'POST_START_LOG_WRITE_FAILURE';
    await writeFile('.local/supabase-start.log', output, { mode: 0o600 });
    stage = 'POST_START_CONFIRMATION_FAILURE';
    console.log('Cuevo local Supabase is ready. Credential output is retained only in ignored .local/supabase-start.log.');
  } catch (error) {
    try {
      const diagnostic = startFailureDiagnostic(error, stage);
      let sourceSha: string | null = null, treeSha: string | null = null;
      try {
        sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        treeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (!/^[a-f0-9]{40}$/.test(sourceSha) || !/^[a-f0-9]{40}$/.test(treeSha)) { sourceSha = null; treeSha = null; }
      } catch { sourceSha = null; treeSha = null; }
      const operation = replay.root.split(/[\\/]/).at(-1)!;
      const env = process.env;
      const ci = env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? '') && /^[1-9][0-9]{0,18}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') && /^[a-zA-Z0-9_-]{1,80}$/.test(env.GITHUB_JOB ?? '') && /^[a-zA-Z0-9_-]{1,80}$/.test(env.CUEVO_VERIFICATION_SCOPE ?? '') && /^[a-f0-9-]{36}$/.test(env.CUEVO_VERIFICATION_RUN_ID ?? '') && sourceSha === env.CUEVO_VERIFICATION_SOURCE_SHA
        ? { repository: env.GITHUB_REPOSITORY!, runId: env.GITHUB_RUN_ID!, attempt: Number(env.GITHUB_RUN_ATTEMPT), job: env.GITHUB_JOB!, scope: env.CUEVO_VERIFICATION_SCOPE!, verificationRunId: env.CUEVO_VERIFICATION_RUN_ID! } : null;
      if (/^operation-[a-zA-Z0-9_-]{1,80}$/.test(operation)) {
        assertReplayWorkdirs(replay, replay.prefix);
        await writeFile(resolve(replay.root, 'start-diagnostic.json'), JSON.stringify({ version: 1, purpose: 'CUEVO_LOCAL_START_DIAGNOSTIC', context: { sourceSha, treeSha, operation, ci }, cliVersion: '2.120.0', ...diagnostic, observedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
      }
    } catch { /* A missing diagnostic never replaces the original startup failure. */ }
    throw new Error('Cuevo local Supabase failed to start; inspect local Docker state without printing credentials.');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await startCuevoSupabase();
