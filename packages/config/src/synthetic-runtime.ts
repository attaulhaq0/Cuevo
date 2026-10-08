export type HostedSyntheticRuntime = { projectRef: string; webOrigin: string; supabaseUrl: string };
/** Exact private execution generation; an absent value retains guarded legacy
 * local behavior and never implies a currently enabled hosted generation. */
export function workerReleaseGeneration(value:string|undefined):string|null{
 if(value===undefined)return null;if(!/^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw Error('Canonical positive worker release generation required.');return value;
}

/** Portable server-only authority: a deployment label alone never admits a hosted source. */
export function hostedSyntheticRuntime(input: Record<string, string | undefined>): HostedSyntheticRuntime | undefined {
  if (input.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'synthetic-staging') return undefined;
  const projectRef = input.CUEVO_SYNTHETIC_PROJECT_REF;
  const webOrigin = input.CUEVO_SYNTHETIC_WEB_ORIGIN;
  if (!projectRef || !/^[a-z]{20}$/.test(projectRef) || !webOrigin || !input.SUPABASE_URL) throw new Error('Explicit hosted synthetic project and origin binding required.');
  try {
    const web = new URL(webOrigin); const auth = new URL(input.SUPABASE_URL);
    if (web.protocol !== 'https:' || web.port || web.username || web.password || web.pathname !== '/' || web.search || web.hash
      || auth.origin !== `https://${projectRef}.supabase.co` || auth.username || auth.password || auth.pathname !== '/' || auth.search || auth.hash) throw new Error('Invalid binding.');
    return { projectRef, webOrigin: web.origin, supabaseUrl: auth.origin };
  } catch { throw new Error('Exact HTTPS hosted synthetic project and web origin required.'); }
}

/** Supabase direct and shared pooler connections must retain the exact project and restricted role. */
export function requireHostedSyntheticDatabase(databaseUrl: string | undefined, runtime: HostedSyntheticRuntime, role: 'cuevo_api' | 'cuevo_worker'): void {
  try {
    if (!databaseUrl) throw new Error('Missing target.');
    const url = new URL(databaseUrl);
    const direct = url.hostname === `db.${runtime.projectRef}.supabase.co` && url.username === role && (!url.port || url.port === '5432');
    const pooler = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `${role}.${runtime.projectRef}` && ['5432', '6543'].includes(url.port);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password || url.pathname !== '/postgres' || url.search || url.hash || !(direct || pooler)) throw new Error('Invalid target.');
  } catch { throw new Error('Exact hosted synthetic restricted database target required.'); }
}

/** A supplied remote source cannot borrow local QA/DEMO/STAGING parser behavior. */
export function requireSyntheticAnalyticsSources(input: Record<string, string | undefined>, hosted: HostedSyntheticRuntime | undefined): void {
  if (hosted) return;
  try {
    if (input.SUPABASE_URL) {
      const auth = new URL(input.SUPABASE_URL);
      if (auth.protocol !== 'http:' || !['127.0.0.1', 'localhost', 'host.docker.internal'].includes(auth.hostname) || auth.port !== '56321' || auth.username || auth.password || auth.pathname !== '/' || auth.search || auth.hash) throw new Error('Remote source.');
    }
    if (input.WORKER_DATABASE_URL || input.CUEVO_WORKER_DATABASE_URL) {
      const db = new URL(input.WORKER_DATABASE_URL ?? input.CUEVO_WORKER_DATABASE_URL!);
      const loopback = ['127.0.0.1', 'localhost'].includes(db.hostname) && db.port === '56322';
      const container = ['supabase_db_cuevo', 'db.supabase.internal'].includes(db.hostname) && db.port === '5432';
      if (!['postgres:', 'postgresql:'].includes(db.protocol) || !(loopback || container) || db.pathname !== '/postgres' || db.search || db.hash) throw new Error('Remote source.');
    }
  } catch { throw new Error('Remote synthetic analytics requires explicit hosted staging project authority.'); }
}
