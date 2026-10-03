export type RuntimeService = 'web' | 'api' | 'worker';
const toolchainKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'HOME', 'HOMEPATH', 'HOMEDRIVE', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'TERM', 'COLORTERM', 'CI'];
const syntheticServerKeys = ['CUEVO_DEPLOYMENT_ENVIRONMENT', 'CUEVO_SYNTHETIC_PROJECT_REF', 'CUEVO_SYNTHETIC_WEB_ORIGIN', 'CUEVO_DATABASE_TLS_CA'];
const authProvisioningKeys = ['CUEVO_AUTH_PROVISIONING_MODE', 'CUEVO_AUTH_PROVISIONING_KEY', 'CUEVO_AUTH_PROVISIONING_URL', 'CUEVO_AUTH_PROVISIONING_PROJECT_REF', 'CUEVO_AUTH_PROVISIONING_WEB_ORIGIN'];
const serviceKeys: Record<RuntimeService, string[]> = {
  web: ['NODE_ENV', 'PORT', 'HOSTNAME', 'NEXT_TELEMETRY_DISABLED', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  api: ['NODE_ENV', 'API_PORT', 'API_ALLOWED_ORIGIN', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AI_PROVIDER', 'AI_MODEL', 'AI_DATA_POLICY_STATUS', 'AI_GENERATION_MODE', 'AI_FIXTURE_ENABLED', 'AI_PROMPT_ID', 'AI_PROMPT_VERSION', 'AI_POLICY_VERSION', 'AI_TIMEOUT_MS', 'AI_MAX_OUTPUT_TOKENS', 'AI_MAX_COST', 'AI_GLOBAL_DAILY_BUDGET','OPENAI_API_KEY', 'AI_BASE_URL', 'AZURE_OPENAI_API_KEY', 'AI_INPUT_COST_PER_MILLION', 'AI_OUTPUT_COST_PER_MILLION'],
  worker: ['NODE_ENV', 'WORKER_PORT', 'WORKER_DATABASE_URL', 'ANALYTICS_FIXTURE_ENABLED', 'POSTHOG_CAPTURE_MODE', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST', 'POSTHOG_PROJECT_KEY', 'POSTHOG_PSEUDONYM_KEY', 'POSTHOG_PSEUDONYM_KEY_VERSION', 'POSTHOG_ENVIRONMENT'],
};

/** Child recipients are explicit; arbitrary parent and NODE_OPTIONS secrets never propagate. */
export function runtimeEnvironment(service: RuntimeService, input: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries([...toolchainKeys, ...serviceKeys[service], ...(service === 'web' ? [] : syntheticServerKeys), ...(service === 'worker' ? ['SUPABASE_URL'] : []), ...(service === 'api' && input.CUEVO_AUTH_PROVISIONING_MODE === 'LOCAL_SYNTHETIC' ? authProvisioningKeys : [])].filter(key => input[key] !== undefined).map(key => [key, input[key]]));
}
