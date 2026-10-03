import { resolve } from 'node:path';
import { runtimeEnvironment, type RuntimeService } from './environment';
import { spawnOwnedProcess, stopOwnedProcesses } from './process';
import { readFile } from 'node:fs/promises';
import { loadDevelopmentEnvironment } from './posthog-local';

process.loadEnvFile(resolve('.env.local'));
const developmentEnvironment = await loadDevelopmentEnvironment(process.env, () => readFile(resolve('.env.posthog.local'), 'utf8'));
const commands: Record<RuntimeService, string[]> = {
  web: [resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3000'],
  api: [resolve('node_modules/tsx/dist/cli.mjs'), 'watch', 'src/main.ts'],
  worker: [resolve('node_modules/tsx/dist/cli.mjs'), 'watch', 'src/main.ts'],
};
const children = (['web', 'api', 'worker'] as RuntimeService[]).map(service => spawnOwnedProcess(process.execPath,
  commands[service], { cwd: resolve(`apps/${service}`), env: runtimeEnvironment(service, developmentEnvironment), stdio: 'inherit' }));
let ending = false;
const stop = () => { if (ending) return; ending = true; void stopOwnedProcesses(children).catch(() => { console.error('Owned runtime shutdown requires review.'); process.exitCode = 1; }); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
for (const child of children) {
  child.on('error', () => { stop(); process.exitCode = 1; });
  child.on('exit', code => { if (!ending) { stop(); process.exitCode = code ?? 1; } });
}
