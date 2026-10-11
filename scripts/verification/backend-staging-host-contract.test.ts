import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

type Subject = {
  validateStagingHostContract(value: unknown): Record<string, unknown>;
  stagingHostContractSha256(value: unknown): string;
  requireStagingHostContract(value: unknown): Record<string, unknown>;
  runtimeConnectionDescriptors(value: unknown, contract: unknown): { api: { host: string; port: number; role: string }; worker: { host: string; port: number; role: string } };
  validateApiHostObservation(contract: unknown, observation: unknown, context: unknown): { settingsSha256: string; notAfterMs: number; effectAuthority: false; hostedAcceptance: false };
  validateWebHostObservation(contract: unknown, observation: unknown, context: unknown): { settingsSha256: string; notAfterMs: number; effectAuthority: false; hostedAcceptance: false };
  validateEdgeHostObservation(contract: unknown, observation: unknown, context: unknown): { settingsSha256: string; effectAuthority: false; hostedAcceptance: false };
  validateSessionPoolerObservation(contract: unknown, observation: unknown, context: unknown): { clientCeiling: { state: string; value: number | null }; basis: string; effectAuthority: false };
  validateRuntimeConnectionSnapshot(value: unknown, contract: unknown, context: unknown): { scope: string; backendConnections: number; capacityAdequate: null; effectAuthority: false };
  validateStagingProbeBudget(contract: unknown, context: unknown): Record<string, unknown>;
  compareStagingProbeCapacity(contract: unknown, snapshot: unknown, context: unknown): { status: string; effectAuthority: false; fleetProtectionVerified: false };
};
async function subject(): Promise<Subject> {
  let loaded: Record<string, unknown> = {};
  try { loaded = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-staging-host-contract.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof loaded.validateStagingHostContract, 'function', 'The source-owned staging host contract validator must exist.');
  return loaded as unknown as Subject;
}

const ref = 'mqxdjvsyckzocokuikmx', team = 'team_Gvw1Dz7IlxIG5evqwlsNkZHb', apiProject = 'prj_QtcVui11hMayZcqBF3KAxZcLaocs', webProject = 'prj_lvJJsVg0WeZAJhCovTlHCPOi0JaR';
const sourceSha = 'a'.repeat(40), treeSha = 'b'.repeat(40), clock = Date.parse('2026-10-10T19:35:13.160Z'), poolerHost = 'aws-0-ap-southeast-1.pooler.supabase.com';
const context = () => ({ sourceSha, treeSha, now: clock, notAfterMs: clock + 15000 });
const sourceBounds = () => ({ api: { node: '24', maxDurationSeconds: 60, poolMax: 10, connectionTimeoutMs: 3000, idleTimeoutMs: 10000, statementTimeoutMs: 5000 }, worker: { poolMax: 1, connectionTimeoutMs: 3000, statementTimeoutMs: 5000, processingDeadlineMs: 20000, claimReserveMs: 15000, eventLeaseSeconds: 30, invocationLeaseSeconds: 60, deliveryTimeoutMs: 30000, recoveryIntervalSeconds: 60 } });
const tuple = (rootDirectory: string | null, framework: string | null) => ({ nodeVersion: '24.x', fluid: true, functionDefaultRegions: ['sin1'], autoAssignCustomDomains: false, ssoDeploymentType: 'all_except_custom_domains', rootDirectory, framework });
const contract = () => ({ version: 1, purpose: 'CUEVO_STAGING_HOST_CONTRACT', sourceSha, treeSha, deploymentEnvironment: 'synthetic-staging', targets: { api: { teamId: team, projectId: apiProject, origin: 'https://cuevo-api.vercel.app', target: 'preview' }, web: { teamId: team, projectId: webProject, origin: 'https://cuevo.vercel.app', target: 'preview' }, supabase: { projectRef: ref, authOrigin: `https://${ref}.supabase.co`, edgeOrigin: `https://${ref}.supabase.co/functions/v1/cuevo-worker` } }, settings: { api: tuple(null, null), web: tuple('apps/web', 'nextjs'), supabase: { region: 'ap-southeast-1', postgresEngine: '17', applicationConnection: { kind: 'session-pooler', host: poolerHost, port: 5432, database: 'postgres' } } }, sourceBounds: sourceBounds(), capacity: { postgres: { maxConnections: 60, superuserReservedConnections: 3 }, sessionPoolerClientCeiling: { state: 'UNKNOWN', value: null } }, exposure: { audience: 'PRIVATE_SYNTHETIC_OPERATORS', roleScope: 'FIVE_REFERENCE_ROLES', gatewayPolicy: 'EXISTING_PROTECTED_PREVIEW_AND_RESERVED_ORIGIN', clientAddressPolicy: 'HOSTED_VERIFICATION_PENDING', fleetProtection: 'NOT_VERIFIED' } });
const apiValue = () => ({ id: apiProject, accountId: team, rootDirectory: null, framework: null, nodeVersion: '24.x', resourceConfig: { fluid: true, functionDefaultRegions: ['sin1'], buildMachineType: 'basic', buildMachineSelection: 'fixed' }, autoAssignCustomDomains: false, ssoProtection: { deploymentType: 'all_except_custom_domains' } });
const projectValue = () => ({ id: ref, name: 'Cuevo', status: 'ACTIVE_HEALTHY', region: 'ap-southeast-1', database: { host: `db.${ref}.supabase.co`, version: '17.11.0.002', postgres_engine: '17' } });
const fixed = <T>(url: string, value: T) => ({ method: 'GET', url, startedAtMs: clock - 1000, completedAtMs: clock, value });
const apiRead = () => fixed(`https://api.vercel.com/v9/projects/${apiProject}?teamId=${team}`, apiValue());
const projectRead = () => fixed(`https://api.supabase.com/v1/projects/${ref}`, projectValue());
const poolerRead = () => fixed(`https://api.supabase.com/v1/projects/${ref}/config/database/pooler`, [{ identifier: ref, database_type: 'PRIMARY', db_host: poolerHost, db_port: 6543, db_user: `postgres.${ref}`, db_name: 'postgres', pool_mode: 'transaction', default_pool_size: null, max_client_conn: null }]);
const snapshot = () => ({ version: 1, purpose: 'CUEVO_STAGING_CONNECTION_SCALARS', source: 'SUPPLIED_FIXED_NATIVE_SCALARS', projectRef: ref, observedAtMs: clock, scope: 'ALL_BACKENDS', maxConnections: 60, superuserReservedConnections: 3, reservedConnections: null, backendConnections: 14, activeBackendConnections: 1, apiConnections: null, workerConnections: null, apiRoleConnectionLimit: null, workerRoleConnectionLimit: null, sessionPoolerClientConnections: null, effectAuthority: false });
// These are controlled reviewed-input fixtures, not selected real staging limits.
const probeBudget = () => ({ definitionSha256: 'c'.repeat(64), reviewedAtMs: clock - 1000, maximumConcurrentApiRequests: 2, maximumConcurrentWorkerInvocations: 1, maximumRequests: 8, maximumSourceCommands: 1, maximumDurationMs: 1000, maximumAdditionalBackendConnections: 4, maximumAdditionalSessionPoolerClients: 3, minimumRemainingBackendConnections: 2, maximumPoolWaiting: 0, stopOnUnexpectedUnavailable: true });

test('actual observed staging tuple binds source, targets and unchanged limits without an unapproved probe budget', async () => {
  const api = await subject(), value = contract(), parsed = api.validateStagingHostContract(value);
  assert.deepEqual(parsed, value); assert.equal(Object.hasOwn(parsed, 'probeBudget'), false);
  assert.match(api.stagingHostContractSha256(value), /^[a-f0-9]{64}$/);
  const expected = { releaseSha: sourceSha, treeSha, deploymentEnvironment: 'synthetic-staging', targets: value.targets, stagingHostContract: value };
  assert.deepEqual(api.requireStagingHostContract(expected), value);
  for (const changed of [{ ...expected, releaseSha: 'd'.repeat(40) }, { ...expected, treeSha: 'd'.repeat(40) }, { ...expected, deploymentEnvironment: 'production' }, { ...expected, targets: { ...value.targets, api: { ...value.targets.api, teamId: 'team_Other' } } }]) assert.throws(() => api.requireStagingHostContract(changed));
  assert.throws(() => api.requireStagingHostContract({ ...expected, stagingHostContract: undefined }));
});

test('contract values stay configuration driven and do not pin the current project or region in source', async () => {
  const api = await subject(), value = contract(), otherRef = 'z'.repeat(20);
  value.targets.api.teamId = value.targets.web.teamId = 'team_ReviewedOther'; value.targets.api.projectId = 'prj_OtherApi'; value.targets.web.projectId = 'prj_OtherWeb';
  value.targets.api.origin = 'https://other-api.vercel.app'; value.targets.web.origin = 'https://other-web.vercel.app';
  value.targets.supabase = { projectRef: otherRef, authOrigin: `https://${otherRef}.supabase.co`, edgeOrigin: `https://${otherRef}.supabase.co/functions/v1/cuevo-worker` };
  value.settings.api.functionDefaultRegions = value.settings.web.functionDefaultRegions = ['fra1']; value.settings.supabase.region = 'eu-central-1'; value.settings.supabase.applicationConnection.host = 'aws-0-eu-central-1.pooler.supabase.com';
  assert.deepEqual(api.validateStagingHostContract(value), value); assert.notEqual(api.stagingHostContractSha256(value), api.stagingHostContractSha256(contract()));
});

test('wrong environment, source limits, target scope and extra private fields cannot enter canonical host configuration', async () => {
  const api = await subject();
  for (const patch of [{ deploymentEnvironment: 'production' }, { purpose: 'CUSTOMER_PRODUCTION' }, { privateToken: 'private-canary' }, { sourceBounds: { ...sourceBounds(), api: { ...sourceBounds().api, poolMax: 20 } } }, { capacity: { ...contract().capacity, sessionPoolerClientCeiling: { state: 'UNKNOWN', value: 0 } } }]) assert.throws(() => api.validateStagingHostContract({ ...contract(), ...patch }));
  const value = contract(); value.targets.web.projectId = apiProject; assert.throws(() => api.validateStagingHostContract(value));
  const shared = contract(); shared.targets.web.teamId = 'team_Other'; assert.throws(() => api.validateStagingHostContract(shared));
});

test('restricted session descriptors redact credentials and refuse another transport or project', async () => {
  const api = await subject(), urls = { apiDatabaseUrl: `postgresql://cuevo_api.${ref}:api-secret@${poolerHost}:5432/postgres`, workerDatabaseUrl: `postgresql://cuevo_worker.${ref}:worker-secret@${poolerHost}:5432/postgres` }, result = api.runtimeConnectionDescriptors(urls, contract());
  assert.equal(result.api.host, poolerHost); assert.equal(result.api.port, 5432); assert.equal(result.api.role, 'cuevo_api'); assert.equal(result.worker.role, 'cuevo_worker'); assert.doesNotMatch(JSON.stringify(result), /secret|password|postgresql/);
  for (const apiDatabaseUrl of [urls.apiDatabaseUrl.replace(':5432', ':6543'), urls.apiDatabaseUrl.replace(poolerHost, 'aws-0-other.pooler.supabase.com'), urls.apiDatabaseUrl.replace(ref, 'z'.repeat(20)), urls.workerDatabaseUrl, urls.apiDatabaseUrl + '?sslmode=disable']) assert.throws(() => api.runtimeConnectionDescriptors({ ...urls, apiDatabaseUrl }, contract()));
});

test('fixed API readback compares only its current project settings with exact source clocks and no authority', async () => {
  const api = await subject(), result = api.validateApiHostObservation(contract(), apiRead(), context());
  assert.equal(result.effectAuthority, false); assert.equal(result.hostedAcceptance, false); assert.equal(result.notAfterMs, clock + 15000);
  const unrelated = apiRead(); unrelated.value.resourceConfig.buildMachineType = 'unrelated-build-machine'; assert.equal(api.validateApiHostObservation(contract(), unrelated, context()).settingsSha256, result.settingsSha256);
  for (const patch of [{ nodeVersion: '22.x' }, { accountId: 'team_Other' }, { autoAssignCustomDomains: true }, { ssoProtection: null }, { resourceConfig: { fluid: false, functionDefaultRegions: ['sin1'] } }, { resourceConfig: { fluid: true, functionDefaultRegions: ['iad1'] } }, { rootDirectory: 'other' }]) assert.throws(() => api.validateApiHostObservation(contract(), { ...apiRead(), value: { ...apiValue(), ...patch } }, context()));
  for (const patch of [{ method: 'POST' }, { url: apiRead().url + '&other=1' }, { startedAtMs: clock - 30001 }, { completedAtMs: clock + 1 }]) assert.throws(() => api.validateApiHostObservation(contract(), { ...apiRead(), ...patch }, context()));
  assert.throws(() => api.validateApiHostObservation(contract(), apiRead(), { ...context(), notAfterMs: clock }));
  assert.throws(() => api.validateApiHostObservation(contract(), apiRead(), { ...context(), sourceSha: 'e'.repeat(40) }));
});

test('web host readback uses the same exact project tuple boundary with original clocks and no authority',async()=>{
 const api=await subject(),value={...apiValue(),id:webProject,rootDirectory:'apps/web',framework:'nextjs'},observation=fixed(`https://api.vercel.com/v9/projects/${webProject}?teamId=${team}`,value),result=api.validateWebHostObservation(contract(),observation,context());
 assert.equal(result.effectAuthority,false);assert.equal(result.hostedAcceptance,false);assert.equal(result.notAfterMs,clock+15000);
 for(const patch of[{id:apiProject},{accountId:'team_Other'},{rootDirectory:null},{framework:null},{nodeVersion:'22.x'},{autoAssignCustomDomains:true},{ssoProtection:null},{resourceConfig:{fluid:false,functionDefaultRegions:['sin1']}},{resourceConfig:{fluid:true,functionDefaultRegions:['iad1']}}])assert.throws(()=>api.validateWebHostObservation(contract(),{...observation,value:{...value,...patch}},context()));
 assert.throws(()=>api.validateWebHostObservation(contract(),apiRead(),context()));assert.throws(()=>api.validateApiHostObservation(contract(),observation,context()));
 for(const patch of[{startedAtMs:clock-30001},{completedAtMs:clock+1},{method:'POST'}])assert.throws(()=>api.validateWebHostObservation(contract(),{...observation,...patch},context()));
});

test('Edge project readback requires the bound Supabase identity, actual region and engine without guessing hosted runtime capacity', async () => {
  const api = await subject(), result = api.validateEdgeHostObservation(contract(), projectRead(), context()); assert.equal(result.effectAuthority, false); assert.equal(result.hostedAcceptance, false);
  for (const patch of [{ id: 'z'.repeat(20) }, { region: 'us-east-1' }, { status: 'INACTIVE' }, { database: { ...projectValue().database, postgres_engine: '16' } }, { database: { ...projectValue().database, host: 'db.other.supabase.co' } }]) assert.throws(() => api.validateEdgeHostObservation(contract(), { ...projectRead(), value: { ...projectValue(), ...patch } }, context()));
  assert.throws(() => api.validateEdgeHostObservation(contract(), { ...projectRead(), url: 'https://api.supabase.com/v1/projects/other' }, context()));
});

test('official shared host with documented session port preserves null defaults as UNKNOWN', async () => {
  const api = await subject(), result = api.validateSessionPoolerObservation(contract(), poolerRead(), context());
  assert.deepEqual(result.clientCeiling, { state: 'UNKNOWN', value: null }); assert.equal(result.basis, 'SUPPLIED_PRIMARY_HOST_AND_DOCUMENTED_SESSION_PORT'); assert.equal(result.effectAuthority, false);
  const missing = poolerRead(); delete (missing.value[0] as Partial<typeof missing.value[0]>).max_client_conn; delete (missing.value[0] as Partial<typeof missing.value[0]>).default_pool_size;
  assert.deepEqual(api.validateSessionPoolerObservation(contract(), missing, context()).clientCeiling, result.clientCeiling);
  for (const value of [[...poolerRead().value, ...poolerRead().value], [{ ...poolerRead().value[0], db_host: 'aws-0-other.pooler.supabase.com' }], [{ ...poolerRead().value[0], db_user: 'postgres.other' }], [{ ...poolerRead().value[0], db_port: 5432 }], [{ ...poolerRead().value[0], default_pool_size: 0 }]]) assert.throws(() => api.validateSessionPoolerObservation(contract(), { ...poolerRead(), value }, context()));
});

test('transaction-reported client ceiling cannot substitute for the selected session-mode ceiling', async () => {
  const api = await subject(), value = { ...contract(), capacity: { ...contract().capacity, sessionPoolerClientCeiling: { state: 'KNOWN', value: 20 } } }, reported = { ...poolerRead(), value: [{ ...poolerRead().value[0], max_client_conn: 20 }] };
  assert.throws(() => api.validateSessionPoolerObservation(value, reported, context()));
  assert.deepEqual(api.validateSessionPoolerObservation(contract(), reported, context()).clientCeiling, { state: 'UNKNOWN', value: null });
});

test('dated scalar snapshot validates known settings and role-limit states without treating14 as usable fleet capacity', async () => {
  const api = await subject(), result = api.validateRuntimeConnectionSnapshot(snapshot(), contract(), context()); assert.equal(result.scope, 'ALL_BACKENDS'); assert.equal(result.backendConnections, 14); assert.equal(result.capacityAdequate, null); assert.equal(result.effectAuthority, false);
  const role = { ...snapshot(), apiRoleConnectionLimit: -1, workerRoleConnectionLimit: 4 }; assert.doesNotThrow(() => api.validateRuntimeConnectionSnapshot(role, contract(), context()));
  for (const patch of [{ maxConnections: 61 }, { superuserReservedConnections: 4 }, { activeBackendConnections: 15 }, { apiRoleConnectionLimit: -2 }, { observedAtMs: clock + 1 }, { rawActivity: 'private query' }, { effectAuthority: true }]) assert.throws(() => api.validateRuntimeConnectionSnapshot({ ...snapshot(), ...patch }, contract(), context()));
});

test('disjoint known runtime-role connections cannot exceed the reported backend total together', async () => {
  const api = await subject();
  assert.throws(() => api.validateRuntimeConnectionSnapshot({ ...snapshot(), apiConnections: 8, workerConnections: 7 }, contract(), context()));
  assert.doesNotThrow(() => api.validateRuntimeConnectionSnapshot({ ...snapshot(), apiConnections: 8, workerConnections: 6 }, contract(), context()));
  assert.equal(api.validateRuntimeConnectionSnapshot({ ...snapshot(), apiConnections: 8, workerConnections: null }, contract(), context()).capacityAdequate, null);
});

test('probes require explicit reviewed inputs while artifact setting checks need no fabricated workload', async () => {
  const api = await subject(), expected = { ...context(), definitionSha256: 'c'.repeat(64) }; assert.throws(() => api.validateStagingProbeBudget(contract(), expected));
  const value = { ...contract(), probeBudget: probeBudget() }; assert.deepEqual(api.validateStagingProbeBudget(value, expected), probeBudget());
  assert.throws(() => api.validateStagingProbeBudget(value, { ...expected, definitionSha256: 'd'.repeat(64) }));
  assert.throws(() => api.validateStagingProbeBudget({ ...value, probeBudget: { ...probeBudget(), maximumConcurrentApiRequests: 0 } }, expected));
  assert.equal(api.validateApiHostObservation(contract(), apiRead(), context()).effectAuthority, false);
});

test('capacity arithmetic reports UNKNOWN for non-client or unobserved limits and never grants fleet protection', async () => {
  const api = await subject(), value = { ...contract(), probeBudget: probeBudget() }, expected = { ...context(), definitionSha256: 'c'.repeat(64) };
  assert.equal(api.compareStagingProbeCapacity(value, snapshot(), expected).status, 'UNKNOWN');
  const observed = { ...snapshot(), scope: 'CLUSTER_CLIENT_BACKENDS', reservedConnections: 0, sessionPoolerClientConnections: 1, apiConnections: 1, workerConnections: 0, apiRoleConnectionLimit: -1, workerRoleConnectionLimit: -1 };
  assert.equal(api.compareStagingProbeCapacity(value, observed, expected).status, 'UNKNOWN');
  const known = { ...value, capacity: { ...value.capacity, sessionPoolerClientCeiling: { state: 'KNOWN', value: 20 } } };
  const result = api.compareStagingProbeCapacity(known, observed, expected); assert.equal(result.status, 'WITHIN_SUPPLIED_LIMITS'); assert.equal(result.effectAuthority, false); assert.equal(result.fleetProtectionVerified, false);
  assert.equal(api.compareStagingProbeCapacity(known, { ...observed, backendConnections: 56 }, expected).status, 'OVER_SUPPLIED_LIMITS');
  assert.equal(api.compareStagingProbeCapacity(known, { ...observed, apiRoleConnectionLimit: null }, expected).status, 'UNKNOWN');
  assert.equal(api.compareStagingProbeCapacity(known, { ...observed, apiRoleConnectionLimit: 1 }, expected).status, 'OVER_SUPPLIED_LIMITS');
});

test('probe connection estimates must cover simultaneous worker pools without inventing an API fleet estimate', async () => {
  const api = await subject(), expected = { ...context(), definitionSha256: 'c'.repeat(64) }, observed = { ...snapshot(), scope: 'CLUSTER_CLIENT_BACKENDS', reservedConnections: 0, sessionPoolerClientConnections: 1, apiConnections: 1, workerConnections: 0, apiRoleConnectionLimit: -1, workerRoleConnectionLimit: -1 };
  const value = { ...contract(), capacity: { ...contract().capacity, sessionPoolerClientCeiling: { state: 'KNOWN', value: 20 } }, probeBudget: { ...probeBudget(), maximumConcurrentWorkerInvocations: 100, maximumAdditionalBackendConnections: 1, maximumAdditionalSessionPoolerClients: 1 } };
  assert.equal(api.compareStagingProbeCapacity(value, observed, expected).status, 'UNKNOWN');
  const direct = { ...value, settings: { ...value.settings, supabase: { ...value.settings.supabase, applicationConnection: { kind: 'direct', host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres' } } } };
  assert.equal(api.compareStagingProbeCapacity(direct, observed, expected).status, 'UNKNOWN');
  const clientsOnly = { ...value, probeBudget: { ...probeBudget(), maximumConcurrentWorkerInvocations: 4, maximumAdditionalBackendConnections: 4, maximumAdditionalSessionPoolerClients: 1 } };
  assert.equal(api.compareStagingProbeCapacity(clientsOnly, observed, expected).status, 'UNKNOWN');
  const missingEstimate = { ...clientsOnly, probeBudget: { ...probeBudget(), maximumAdditionalBackendConnections: null } };
  assert.equal(api.compareStagingProbeCapacity(missingEstimate, observed, expected).status, 'UNKNOWN');
});
