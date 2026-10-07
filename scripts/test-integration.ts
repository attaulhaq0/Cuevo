import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { integrationArguments, validateCriticalIntegrationReport } from './verification/verification-profiles';
const args = process.argv.slice(2), invocation = integrationArguments(args);
const result = spawnSync(process.execPath, invocation, { env: { ...process.env, CUEVO_REQUIRE_INTEGRATION: '1', CUEVO_REQUIRE_LIVE_INTELLIGENCE: '0' }, stdio: 'inherit' });
if (result.status === 0 && args.length) validateCriticalIntegrationReport(JSON.parse(readFileSync('.local/customer-readiness/critical-integration-results.json', 'utf8')));
process.exit(result.status ?? 1);
