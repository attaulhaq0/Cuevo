import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--fileParallelism=false', 'apps/api/test/school-learning-api.test.ts', 'apps/api/test/academic-api.test.ts'], { env: { ...process.env, CUEVO_REQUIRE_INTEGRATION: '1' }, stdio: 'inherit' });
process.exit(result.status ?? 1);
