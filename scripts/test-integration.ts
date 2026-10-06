import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--fileParallelism=false', '--reporter=default', '--reporter=json', '--outputFile=.local/customer-readiness/integration-results.json', 'apps/api/test/integration'], { env: { ...process.env, CUEVO_REQUIRE_INTEGRATION: '1', CUEVO_REQUIRE_LIVE_INTELLIGENCE: '0' }, stdio: 'inherit' });
process.exit(result.status ?? 1);
