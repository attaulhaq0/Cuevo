import { createHash } from 'node:crypto';
import { z } from 'zod';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase } from '@cuevo/config/synthetic-runtime';
import { canonicalReleaseExecutionJson } from './release-review';

const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), positive = count.refine(value => value > 0);
const ref = z.string().regex(/^[a-z]{20}$/), region = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
const origin = z.string().refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password && !url.port; }
  catch { return false; }
});
const target = z.object({ teamId: z.string().regex(/^team_[A-Za-z0-9]+$/), projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), origin, target: z.literal('preview') }).strict();
const targets = z.object({ api: target, web: target, supabase: z.object({ projectRef: ref, authOrigin: origin, edgeOrigin: z.string().max(253) }).strict() }).strict();
const vercelSettings = z.object({ nodeVersion: z.literal('24.x'), fluid: z.boolean(), functionDefaultRegions: z.array(region).min(1).max(16).refine(value => new Set(value).size === value.length), autoAssignCustomDomains: z.literal(false), ssoDeploymentType: z.enum(['all', 'all_except_custom_domains', 'preview']), rootDirectory: z.string().max(253).nullable(), framework: z.string().max(100).nullable() }).strict();
const sessionConnection = z.object({ kind: z.literal('session-pooler'), host: z.string().regex(/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/), port: z.literal(5432), database: z.literal('postgres') }).strict();
const directConnection = z.object({ kind: z.literal('direct'), host: z.string().regex(/^db\.[a-z]{20}\.supabase\.co$/), port: z.literal(5432), database: z.literal('postgres') }).strict();
const sourceBounds = z.object({
  api: z.object({ node: z.literal('24'), maxDurationSeconds: z.literal(60), poolMax: z.literal(10), connectionTimeoutMs: z.literal(3000), idleTimeoutMs: z.literal(10000), statementTimeoutMs: z.literal(5000) }).strict(),
  worker: z.object({ poolMax: z.literal(1), connectionTimeoutMs: z.literal(3000), statementTimeoutMs: z.literal(5000), processingDeadlineMs: z.literal(20000), claimReserveMs: z.literal(15000), eventLeaseSeconds: z.literal(30), invocationLeaseSeconds: z.literal(60), deliveryTimeoutMs: z.literal(30000), recoveryIntervalSeconds: z.literal(60) }).strict(),
}).strict();
const clientCeiling = z.discriminatedUnion('state', [z.object({ state: z.literal('UNKNOWN'), value: z.null() }).strict(), z.object({ state: z.literal('KNOWN'), value: positive }).strict()]);
const probeBudget = z.object({ definitionSha256: digest, reviewedAtMs: count, maximumConcurrentApiRequests: positive, maximumConcurrentWorkerInvocations: positive, maximumRequests: positive, maximumSourceCommands: count, maximumDurationMs: positive, maximumAdditionalBackendConnections: positive.nullable(), maximumAdditionalSessionPoolerClients: positive.nullable(), minimumRemainingBackendConnections: positive, maximumPoolWaiting: count, stopOnUnexpectedUnavailable: z.literal(true) }).strict();

/** Configuration is approved by the caller's canonical package. This schema
 * declares present source limits; it grants no host, school or effect authority. */
export const stagingHostContractSchema = z.object({
  version: z.literal(1), purpose: z.literal('CUEVO_STAGING_HOST_CONTRACT'), sourceSha: sha, treeSha: sha, deploymentEnvironment: z.literal('synthetic-staging'), targets,
  settings: z.object({ api: vercelSettings, web: vercelSettings, supabase: z.object({ region, postgresEngine: z.literal('17'), applicationConnection: z.discriminatedUnion('kind', [sessionConnection, directConnection]) }).strict() }).strict(),
  sourceBounds,
  capacity: z.object({ postgres: z.object({ maxConnections: positive, superuserReservedConnections: count }).strict(), sessionPoolerClientCeiling: clientCeiling }).strict(),
  exposure: z.object({ audience: z.literal('PRIVATE_SYNTHETIC_OPERATORS'), roleScope: z.literal('FIVE_REFERENCE_ROLES'), gatewayPolicy: z.literal('EXISTING_PROTECTED_PREVIEW_AND_RESERVED_ORIGIN'), clientAddressPolicy: z.literal('HOSTED_VERIFICATION_PENDING'), fleetProtection: z.literal('NOT_VERIFIED') }).strict(),
  probeBudget: probeBudget.optional(),
}).strict().superRefine((value, context) => {
  const { api, web, supabase } = value.targets, connection = value.settings.supabase.applicationConnection;
  if (api.projectId === web.projectId || api.origin === web.origin || api.teamId !== web.teamId || supabase.authOrigin !== `https://${supabase.projectRef}.supabase.co` || supabase.edgeOrigin !== `${supabase.authOrigin}/functions/v1/cuevo-worker`
    || connection.kind === 'direct' && connection.host !== `db.${supabase.projectRef}.supabase.co` || value.capacity.postgres.superuserReservedConnections >= value.capacity.postgres.maxConnections
    || value.settings.api.rootDirectory !== null || value.settings.api.framework !== null || value.settings.web.rootDirectory !== 'apps/web' || value.settings.web.framework !== 'nextjs'
    || value.probeBudget && (value.probeBudget.maximumSourceCommands > value.probeBudget.maximumRequests || value.probeBudget.maximumConcurrentApiRequests > value.probeBudget.maximumRequests)) context.addIssue({ code: 'custom', message: 'Exact staging scope and source policy required.' });
});
export type StagingHostContract = z.infer<typeof stagingHostContractSchema>;
const fail = () => Error('Staging host contract or supplied current observation requires review; private contents withheld.');
const snapshot = (value: unknown): unknown => JSON.parse(canonicalReleaseExecutionJson(value));
const hash = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
export function validateStagingHostContract(value: unknown): StagingHostContract {
  try { return stagingHostContractSchema.parse(snapshot(value)); } catch { throw fail(); }
}
export function stagingHostContractSha256(value: unknown): string { return hash(validateStagingHostContract(value)); }

/** Historical package decoding stays with the existing package owner. An
 * omitted field cannot supply this explicit new provider-effect capability. */
export function requireStagingHostContract(value: unknown): StagingHostContract {
  try {
    const expected = z.object({ releaseSha: sha, treeSha: sha, deploymentEnvironment: z.literal('synthetic-staging'), targets, stagingHostContract: z.unknown() }).parse(snapshot(value));
    const contract = validateStagingHostContract(expected.stagingHostContract);
    if (contract.sourceSha !== expected.releaseSha || contract.treeSha !== expected.treeSha || !same(contract.targets, expected.targets)) throw fail();
    return contract;
  } catch { throw fail(); }
}

/** Existing recipient/TLS validation remains caller-owned. Reuse the portable
 * target guard and project only credentials-free restricted descriptors. */
export function runtimeConnectionDescriptors(value: unknown, contractValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), urls = z.object({ apiDatabaseUrl: z.string().max(24576), workerDatabaseUrl: z.string().max(24576) }).strict().parse(snapshot(value));
    const hosted = hostedSyntheticRuntime({ CUEVO_DEPLOYMENT_ENVIRONMENT: contract.deploymentEnvironment, CUEVO_SYNTHETIC_PROJECT_REF: contract.targets.supabase.projectRef, CUEVO_SYNTHETIC_WEB_ORIGIN: contract.targets.web.origin, SUPABASE_URL: contract.targets.supabase.authOrigin });
    if (!hosted) throw fail();
    const describe = (urlValue: string, role: 'cuevo_api' | 'cuevo_worker') => {
      requireHostedSyntheticDatabase(urlValue, hosted, role); const url = new URL(urlValue), selected = contract.settings.supabase.applicationConnection;
      if (url.hostname !== selected.host || Number(url.port || '5432') !== selected.port) throw fail();
      return { kind: selected.kind, projectRef: hosted.projectRef, host: selected.host, port: selected.port, database: selected.database, role };
    };
    return { api: describe(urls.apiDatabaseUrl, 'cuevo_api'), worker: describe(urls.workerDatabaseUrl, 'cuevo_worker') };
  } catch { throw fail(); }
}

const currentContext = z.object({ sourceSha: sha, treeSha: sha, now: count, notAfterMs: positive }).strict();
type CurrentContext = z.infer<typeof currentContext>;
function context(value: unknown, contract: StagingHostContract): CurrentContext {
  const parsed = currentContext.parse(snapshot(value));
  if (parsed.sourceSha !== contract.sourceSha || parsed.treeSha !== contract.treeSha || parsed.now >= parsed.notAfterMs) throw fail();
  return parsed;
}
const fixedGet = z.object({ method: z.literal('GET'), url: z.string().max(1024), startedAtMs: count, completedAtMs: count, value: z.unknown() }).strict();
function read(value: unknown, url: string, ctx: CurrentContext) {
  const parsed = fixedGet.parse(snapshot(value));
  if (parsed.url !== url || parsed.startedAtMs > parsed.completedAtMs || parsed.completedAtMs > ctx.now || ctx.now - parsed.startedAtMs >= 30000) throw fail();
  return { ...parsed, notAfterMs: Math.min(ctx.notAfterMs, parsed.startedAtMs + 30000) };
}
const noAuthority = { effectAuthority: false as const, hostedAcceptance: false as const };
const actualVercel = z.object({ id: z.string(), accountId: z.string(), nodeVersion: z.string(), resourceConfig: z.object({ fluid: z.boolean(), functionDefaultRegions: z.array(z.string()).min(1).max(16) }), autoAssignCustomDomains: z.boolean(), ssoProtection: z.object({ deploymentType: z.string() }), rootDirectory: z.string().nullable(), framework: z.string().nullable() });

/** Only the selected API project's current GET is needed here. Transports,
 * response limits, official origin and final native lease remain caller-owned. */
export function validateApiHostObservation(contractValue: unknown, observation: unknown, contextValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), ctx = context(contextValue, contract), selected = contract.targets.api;
    const observed = read(observation, `https://api.vercel.com/v9/projects/${selected.projectId}?teamId=${selected.teamId}`, ctx), raw = actualVercel.parse(observed.value);
    const settings = { nodeVersion: raw.nodeVersion, fluid: raw.resourceConfig.fluid, functionDefaultRegions: raw.resourceConfig.functionDefaultRegions, autoAssignCustomDomains: raw.autoAssignCustomDomains, ssoDeploymentType: raw.ssoProtection.deploymentType, rootDirectory: raw.rootDirectory, framework: raw.framework };
    if (raw.id !== selected.projectId || raw.accountId !== selected.teamId || !same(settings, contract.settings.api)) throw fail();
    return { purpose: 'SUPPLIED_CURRENT_API_HOST_SETTINGS' as const, contractSha256: stagingHostContractSha256(contract), settingsSha256: hash(settings), observedAtMs: observed.startedAtMs, verifiedAtMs: observed.completedAtMs, notAfterMs: observed.notAfterMs, ...noAuthority };
  } catch { throw fail(); }
}
const actualProject = z.object({ id: ref, status: z.literal('ACTIVE_HEALTHY'), region, database: z.object({ host: z.string(), version: z.string().regex(/^17\.\d+(?:\.\d+){0,2}$/), postgres_engine: z.literal('17') }) });
export function validateEdgeHostObservation(contractValue: unknown, observation: unknown, contextValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), ctx = context(contextValue, contract), project = contract.targets.supabase.projectRef;
    const observed = read(observation, `https://api.supabase.com/v1/projects/${project}`, ctx), raw = actualProject.parse(observed.value);
    if (raw.id !== project || raw.region !== contract.settings.supabase.region || raw.database.postgres_engine !== contract.settings.supabase.postgresEngine || raw.database.host !== `db.${project}.supabase.co`) throw fail();
    const settings = { projectRef: raw.id, region: raw.region, postgresEngine: raw.database.postgres_engine, directHost: raw.database.host };
    return { purpose: 'SUPPLIED_CURRENT_EDGE_HOST_SETTINGS' as const, contractSha256: stagingHostContractSha256(contract), settingsSha256: hash(settings), observedAtMs: observed.startedAtMs, verifiedAtMs: observed.completedAtMs, notAfterMs: observed.notAfterMs, ...noAuthority };
  } catch { throw fail(); }
}

const actualPooler = z.object({ identifier: ref, database_type: z.enum(['PRIMARY', 'READ_REPLICA']), db_host: sessionConnection.shape.host, db_port: z.number().int(), db_user: z.string(), db_name: z.string(), pool_mode: z.enum(['transaction', 'session']), default_pool_size: positive.nullable().optional(), max_client_conn: positive.nullable().optional() });
/** The official PRIMARY host plus documented5432 mechanics describe a session
 * recipe. A transaction6543 response is not a session readiness/capacity proof. */
export function validateSessionPoolerObservation(contractValue: unknown, observation: unknown, contextValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), ctx = context(contextValue, contract), project = contract.targets.supabase.projectRef, selected = contract.settings.supabase.applicationConnection;
    if (selected.kind !== 'session-pooler') throw fail();
    const observed = read(observation, `https://api.supabase.com/v1/projects/${project}/config/database/pooler`, ctx), rows = z.array(actualPooler).max(20).parse(observed.value), primary = rows.filter(row => row.database_type === 'PRIMARY' && row.identifier === project);
    if (primary.length !== 1) throw fail(); const raw = primary[0];
    if (raw.db_host !== selected.host || raw.db_user !== `postgres.${project}` || raw.db_name !== 'postgres' || raw.pool_mode === 'session' && raw.db_port !== 5432 || raw.pool_mode === 'transaction' && raw.db_port !== 6543) throw fail();
    const ceiling = raw.pool_mode !== 'session' || raw.max_client_conn == null ? { state: 'UNKNOWN' as const, value: null } : { state: 'KNOWN' as const, value: raw.max_client_conn };
    if (contract.capacity.sessionPoolerClientCeiling.state === 'KNOWN' && !same(ceiling, contract.capacity.sessionPoolerClientCeiling)) throw fail();
    return { basis: 'SUPPLIED_PRIMARY_HOST_AND_DOCUMENTED_SESSION_PORT' as const, clientCeiling: ceiling, transactionPoolSize: raw.default_pool_size == null ? { state: 'UNKNOWN' as const, value: null } : { state: 'KNOWN' as const, value: raw.default_pool_size }, endpoint: selected, observedAtMs: observed.startedAtMs, verifiedAtMs: observed.completedAtMs, notAfterMs: observed.notAfterMs, ...noAuthority };
  } catch { throw fail(); }
}

const roleLimit = count.or(z.literal(-1)).nullable();
export const stagingConnectionSnapshotSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_STAGING_CONNECTION_SCALARS'), source: z.literal('SUPPLIED_FIXED_NATIVE_SCALARS'), projectRef: ref, observedAtMs: count, scope: z.enum(['ALL_BACKENDS', 'CLUSTER_CLIENT_BACKENDS']), maxConnections: positive, superuserReservedConnections: count, reservedConnections: count.nullable(), backendConnections: count, activeBackendConnections: count, apiConnections: count.nullable(), workerConnections: count.nullable(), apiRoleConnectionLimit: roleLimit, workerRoleConnectionLimit: roleLimit, sessionPoolerClientConnections: count.nullable(), effectAuthority: z.literal(false) }).strict().superRefine((value, context) => {
  if (value.activeBackendConnections > value.backendConnections || value.apiConnections !== null && value.apiConnections > value.backendConnections || value.workerConnections !== null && value.workerConnections > value.backendConnections
    || value.apiConnections !== null && value.workerConnections !== null && value.apiConnections + value.workerConnections > value.backendConnections
    || value.superuserReservedConnections + (value.reservedConnections ?? 0) >= value.maxConnections) context.addIssue({ code: 'custom', message: 'Exact fixed native scalar states required.' });
});
export function validateRuntimeConnectionSnapshot(value: unknown, contractValue: unknown, contextValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), ctx = context(contextValue, contract), observed = stagingConnectionSnapshotSchema.parse(snapshot(value));
    if (observed.projectRef !== contract.targets.supabase.projectRef || observed.observedAtMs > ctx.now || ctx.now - observed.observedAtMs >= 30000 || observed.maxConnections !== contract.capacity.postgres.maxConnections || observed.superuserReservedConnections !== contract.capacity.postgres.superuserReservedConnections) throw fail();
    return { ...observed, notAfterMs: Math.min(ctx.notAfterMs, observed.observedAtMs + 30000), capacityAdequate: null, hostedAcceptance: false as const };
  } catch { throw fail(); }
}

const probeContext = currentContext.extend({ definitionSha256: digest }).strict();
/** Explicit reviewed budgets are required only by probe consumers. This pure
 * check cannot select a workload or authorize its school/source mutations. */
export function validateStagingProbeBudget(contractValue: unknown, contextValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), ctx = probeContext.parse(snapshot(contextValue));
    context({ sourceSha: ctx.sourceSha, treeSha: ctx.treeSha, now: ctx.now, notAfterMs: ctx.notAfterMs }, contract);
    if (!contract.probeBudget || contract.probeBudget.definitionSha256 !== ctx.definitionSha256 || contract.probeBudget.reviewedAtMs > ctx.now) throw fail();
    return contract.probeBudget;
  } catch { throw fail(); }
}

/** Arithmetic on supplied limits is not current native admission, an instance
 * cap, a readiness pass or deployment-wide protection. Unknown stays unknown. */
export function compareStagingProbeCapacity(contractValue: unknown, snapshotValue: unknown, contextValue: unknown) {
  try {
    const contract = validateStagingHostContract(contractValue), ctx = probeContext.parse(snapshot(contextValue)), budget = validateStagingProbeBudget(contract, ctx);
    const observed = validateRuntimeConnectionSnapshot(snapshotValue, contract, { sourceSha: ctx.sourceSha, treeSha: ctx.treeSha, now: ctx.now, notAfterMs: ctx.notAfterMs });
    const result = (status: 'UNKNOWN' | 'OVER_SUPPLIED_LIMITS' | 'WITHIN_SUPPLIED_LIMITS') => ({ status, effectAuthority: false as const, fleetProtectionVerified: false as const, hostedAcceptance: false as const });
    if (observed.scope !== 'CLUSTER_CLIENT_BACKENDS' || observed.reservedConnections === null) return result('UNKNOWN');
    // The reviewed estimate must at least cover one source-owned pool per
    // simultaneous worker. API requests do not establish an API instance count.
    const workerDemand = budget.maximumConcurrentWorkerInvocations * contract.sourceBounds.worker.poolMax;
    if (!Number.isSafeInteger(workerDemand) || budget.maximumAdditionalBackendConnections === null || budget.maximumAdditionalBackendConnections < workerDemand) return result('UNKNOWN');
    const remaining = observed.maxConnections - observed.superuserReservedConnections - observed.reservedConnections - observed.backendConnections - budget.maximumAdditionalBackendConnections;
    if (remaining < budget.minimumRemainingBackendConnections) return result('OVER_SUPPLIED_LIMITS');
    if (contract.settings.supabase.applicationConnection.kind === 'session-pooler') {
      if (budget.maximumAdditionalSessionPoolerClients === null || budget.maximumAdditionalSessionPoolerClients < workerDemand) return result('UNKNOWN');
      if (contract.capacity.sessionPoolerClientCeiling.state !== 'KNOWN' || observed.sessionPoolerClientConnections === null) return result('UNKNOWN');
      if (observed.sessionPoolerClientConnections + budget.maximumAdditionalSessionPoolerClients > contract.capacity.sessionPoolerClientCeiling.value) return result('OVER_SUPPLIED_LIMITS');
    }
    const roleChecks = [[observed.apiRoleConnectionLimit, observed.apiConnections, budget.maximumAdditionalBackendConnections], [observed.workerRoleConnectionLimit, observed.workerConnections, budget.maximumConcurrentWorkerInvocations]] as const;
    if (roleChecks.some(([limit, current]) => limit === null || current === null)) return result('UNKNOWN');
    if (roleChecks.some(([limit, current, additional]) => limit !== null && current !== null && limit !== -1 && current + additional > limit)) return result('OVER_SUPPLIED_LIMITS');
    return result('WITHIN_SUPPLIED_LIMITS');
  } catch { throw fail(); }
}
