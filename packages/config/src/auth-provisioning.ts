import { z } from 'zod';

export type AuthProvisioningConfig = { mode: 'DISABLED' } | {
  mode: 'LOCAL_SYNTHETIC'; url: 'http://127.0.0.1:56321'; projectRef: 'LOCAL_CUEVO';
  webOrigin: 'http://localhost:3000' | 'http://127.0.0.1:3000'; key: string;
  redirects: { invite: string; recovery: string };
};
const modeSchema = z.enum(['DISABLED', 'LOCAL_SYNTHETIC']);
const localSchema = z.object({
  CUEVO_AUTH_PROVISIONING_URL: z.literal('http://127.0.0.1:56321'),
  CUEVO_AUTH_PROVISIONING_PROJECT_REF: z.literal('LOCAL_CUEVO'),
  CUEVO_AUTH_PROVISIONING_WEB_ORIGIN: z.enum(['http://localhost:3000', 'http://127.0.0.1:3000']),
  CUEVO_AUTH_PROVISIONING_KEY: z.string().min(20).max(4096).refine(value => !/\s/.test(value) && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) && !value.startsWith('sb_publishable_')),
});
export function parseAuthProvisioningConfig(input: Record<string, string | undefined>, consumer: 'all' | 'api' | 'worker'): AuthProvisioningConfig {
  if (consumer !== 'api') return { mode: 'DISABLED' };
  const mode = modeSchema.safeParse(input.CUEVO_AUTH_PROVISIONING_MODE ?? 'DISABLED');
  if (!mode.success) throw Error('Invalid Auth provisioning configuration: CUEVO_AUTH_PROVISIONING_MODE');
  if (mode.data === 'DISABLED') return { mode: 'DISABLED' };
  if (input.NODE_ENV === 'production' || input.CUEVO_DEPLOYMENT_ENVIRONMENT !== undefined && input.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'local') throw Error('Local synthetic Auth provisioning is unavailable in hosted or production environments.');
  const parsed = localSchema.safeParse(input);
  if (!parsed.success) throw Error(`Invalid Auth provisioning configuration: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  const local = parsed.data;
  if (input.SUPABASE_URL !== local.CUEVO_AUTH_PROVISIONING_URL || input.API_ALLOWED_ORIGIN !== local.CUEVO_AUTH_PROVISIONING_WEB_ORIGIN) throw Error('Local Auth provisioning requires the exact reviewed API and Auth source origins.');
  return { mode: 'LOCAL_SYNTHETIC', url: local.CUEVO_AUTH_PROVISIONING_URL, projectRef: local.CUEVO_AUTH_PROVISIONING_PROJECT_REF, webOrigin: local.CUEVO_AUTH_PROVISIONING_WEB_ORIGIN, key: local.CUEVO_AUTH_PROVISIONING_KEY,
    redirects: { invite: `${local.CUEVO_AUTH_PROVISIONING_WEB_ORIGIN}/account/admission`, recovery: `${local.CUEVO_AUTH_PROVISIONING_WEB_ORIGIN}/account/recovery` } };
}
