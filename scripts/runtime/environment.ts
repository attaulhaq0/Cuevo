export type RuntimeService = 'web' | 'api' | 'worker';
const toolchainKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'HOME', 'HOMEPATH', 'HOMEDRIVE', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'TERM', 'COLORTERM', 'CI'];
const syntheticServerKeys = ['CUEVO_DEPLOYMENT_ENVIRONMENT', 'CUEVO_SYNTHETIC_PROJECT_REF', 'CUEVO_SYNTHETIC_WEB_ORIGIN', 'CUEVO_DATABASE_TLS_CA'];
const authProvisioningKeys = ['CUEVO_AUTH_PROVISIONING_MODE', 'CUEVO_AUTH_PROVISIONING_KEY', 'CUEVO_AUTH_PROVISIONING_URL', 'CUEVO_AUTH_PROVISIONING_PROJECT_REF', 'CUEVO_AUTH_PROVISIONING_WEB_ORIGIN'];
const testingLoginKeys = ['CUEVO_TEST_QUICK_LOGIN', 'CUEVO_TEST_LOGIN_ACCOUNTS_FILE','CUEVO_TEST_DEMO_GUIDE_FILE'];
const serviceKeys: Record<RuntimeService, string[]> = {
  web: ['NODE_ENV', 'PORT', 'HOSTNAME', 'NEXT_TELEMETRY_DISABLED', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  api: ['NODE_ENV', 'API_PORT', 'API_ALLOWED_ORIGIN', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AI_PROVIDER', 'AI_MODEL', 'AI_DATA_POLICY_STATUS', 'AI_GENERATION_MODE', 'AI_FIXTURE_ENABLED', 'AI_PROMPT_ID', 'AI_PROMPT_VERSION', 'AI_POLICY_VERSION', 'AI_TIMEOUT_MS', 'AI_MAX_OUTPUT_TOKENS', 'AI_MAX_COST', 'AI_GLOBAL_DAILY_BUDGET','OPENAI_API_KEY', 'AI_BASE_URL', 'AZURE_OPENAI_API_KEY', 'AI_INPUT_COST_PER_MILLION', 'AI_OUTPUT_COST_PER_MILLION'],
  worker: ['NODE_ENV', 'WORKER_PORT', 'WORKER_DATABASE_URL', 'CUEVO_WORKER_RELEASE_GENERATION', 'ANALYTICS_FIXTURE_ENABLED', 'POSTHOG_CAPTURE_MODE', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST', 'POSTHOG_PROJECT_KEY', 'POSTHOG_PSEUDONYM_KEY', 'POSTHOG_PSEUDONYM_KEY_VERSION', 'POSTHOG_ENVIRONMENT'],
};

/** Child recipients are explicit; arbitrary parent and NODE_OPTIONS secrets never propagate. */
export function runtimeEnvironment(service: RuntimeService, input: Record<string, string | undefined>): Record<string, string | undefined> {
  if(service==='api'&&input.CUEVO_LOCAL_DEMO_MODE!==undefined&&(['VERCEL','VERCEL_ENV','VERCEL_URL'].some(key=>input[key]!==undefined)||authProvisioningKeys.filter(key=>!(key==='CUEVO_AUTH_PROVISIONING_MODE'&&input[key]==='DISABLED')).some(key=>input[key]!==undefined&&input[key]!=='')))throw Error('Local presentation child configuration requires review.');
  const localTesting = service === 'web' && input.CUEVO_TEST_QUICK_LOGIN === '1' && ['127.0.0.1', 'localhost'].includes(input.HOSTNAME ?? '') && !input.VERCEL && !input.VERCEL_ENV && !input.VERCEL_URL && (!input.CUEVO_DEPLOYMENT_ENVIRONMENT || input.CUEVO_DEPLOYMENT_ENVIRONMENT === 'local') && ['http://127.0.0.1:56321', 'http://127.0.0.1:57421'].includes(input.NEXT_PUBLIC_SUPABASE_URL ?? '');
  return Object.fromEntries([...toolchainKeys, ...serviceKeys[service], ...(localTesting ? testingLoginKeys : []), ...(service === 'web' ? [] : syntheticServerKeys), ...(service === 'worker' ? ['SUPABASE_URL'] : []), ...(service === 'api' && input.CUEVO_LOCAL_DEMO_MODE === 'INTEGRATION_PRESENTATION' ? ['CUEVO_LOCAL_DEMO_MODE','POSTHOG_CAPTURE_MODE'] : []), ...(service === 'api' && input.CUEVO_AUTH_PROVISIONING_MODE === 'LOCAL_SYNTHETIC' ? authProvisioningKeys : [])].filter(key => input[key] !== undefined).map(key => [key, input[key]]));
}
