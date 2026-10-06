import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {parseDemoGuideManifest,type DemoGuideManifest}from'../../../shared/session/demo-guide';

const roles = ['admin', 'coordinator', 'teacher', 'student', 'parent'] as const;
type Role = typeof roles[number];
type Actor = { actorId: string; schoolId: string; role: string; email: string };
type Account = Actor & { password: string };
type Environment = Record<string, string | undefined>;
type Dependencies = { read: (path: string) => Promise<string>; real: (path: string) => Promise<string>; fetch: typeof fetch; cwd: () => string; entry: () => string | undefined; standaloneConfig: () => string | undefined };
const defaults: Dependencies = { read: path => readFile(path, 'utf8'), real: realpath, fetch: (...args) => fetch(...args), cwd: () => process.cwd(), entry: () => process.argv[1], standaloneConfig: () => process.env.__NEXT_PRIVATE_STANDALONE_CONFIG };
const headers = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', 'Content-Type': 'application/json' };
const empty = (status = 404) => Response.json({ available: false }, { status, headers });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** This endpoint enables only an explicit local synthetic testing shortcut.
 * Real provider session verification and the ordinary membership API still
 * decide the actual role, school and permitted workspaces. */
export function quickLoginTarget(request: Request, env: Environment): { auth: string; key: string } | null {
  if (env.CUEVO_TEST_QUICK_LOGIN !== '1' || !['127.0.0.1', 'localhost'].includes(env.HOSTNAME ?? '') || env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL || env.CUEVO_DEPLOYMENT_ENVIRONMENT && env.CUEVO_DEPLOYMENT_ENVIRONMENT !== 'local') return null;
  const url = new URL(request.url), host = request.headers.get('host');
  const expectedHost = ['localhost', '127.0.0.1'].includes(env.HOSTNAME ?? '') && env.PORT === '3000' ? 'localhost:3000' : env.HOSTNAME === '127.0.0.1' && env.PORT === '54131' ? '127.0.0.1:54131' : null;
  const auth = expectedHost === 'localhost:3000' ? 'http://127.0.0.1:56321' : expectedHost === '127.0.0.1:54131' ? 'http://127.0.0.1:57421' : null;
  if (!auth || !expectedHost || host !== expectedHost || url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== env.PORT || request.headers.has('forwarded')) return null;
  const forwarding = { 'x-forwarded-host': expectedHost, 'x-forwarded-proto': 'http', 'x-forwarded-port': env.PORT };
  if (Object.entries(forwarding).some(([name, value]) => request.headers.has(name) && request.headers.get(name) !== value) || request.headers.has('x-forwarded-for') && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.headers.get('x-forwarded-for')!)) return null;
  if (request.method === 'POST' && request.headers.get('origin') !== `http://${expectedHost}`) return null;
  if (env.NEXT_PUBLIC_SUPABASE_URL !== auth || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) return null;
  return { auth, key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

export async function boundedQuickLoginBody(request: Request): Promise<unknown> {
  if (!request.body) throw Error('Request unavailable');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Request unavailable')), 1000); });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]); if (part.done) break;
      size += part.value.byteLength; if (size > 256) throw Error('Request unavailable'); chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

function actors(value: unknown): Actor[] {
  if (!object(value) || value.synthetic !== true || !Array.isArray(value.actors) || value.actors.length !== 133) throw Error('Synthetic identity source unavailable');
  const list = value.actors;
  if (list.some(actor => !object(actor) || !['actorId', 'schoolId', 'role', 'email'].every(key => typeof actor[key] === 'string' && actor[key] !== '') || !roles.includes(actor.role as Role)) || new Set(list.map(actor => actor.actorId)).size !== 133 || new Set(list.map(actor => actor.email)).size !== 133) throw Error('Synthetic identity source unavailable');
  return list as Actor[];
}

async function loadAccounts(env: Environment, io: Dependencies): Promise<{ accounts: Account[]; identities: Actor[] }> {
  const cwd = await io.real(io.cwd());
  const accountFile = env.CUEVO_TEST_LOGIN_ACCOUNTS_FILE;
  const segments = accountFile?.split(/[\\/]/);
  const marker = segments?.lastIndexOf('.local') ?? -1;
  const sourceRoot = marker > 0 && accountFile && isAbsolute(accountFile) ? segments!.slice(0, marker).join(sep) : null;
  const candidates = [cwd, resolve(cwd, '../..'), ...(sourceRoot ? [await io.real(sourceRoot)] : [])];
  let root: string | null = null, identities: Actor[] = [];
  for (const candidate of candidates) {
    try { identities = actors(JSON.parse(await io.read(resolve(candidate, 'supabase/seed/identities.json')))); root = candidate; break; } catch { /* Only exact repository source candidates are admitted. */ }
  }
  if (!root) throw Error('Synthetic identity source unavailable');
  const entry = io.entry();
  if (!entry || !isAbsolute(entry)) throw Error('Managed review server required');
  const expectedEntry = await io.real(resolve(root, 'apps/web/.next/standalone/apps/web/server.js'));
  if (await io.real(entry) !== expectedEntry) throw Error('Managed review server required');
  const config: unknown = JSON.parse(io.standaloneConfig() ?? 'null');
  if (!object(config) || config.output !== 'standalone' || typeof config.repoRoot !== 'string' || !isAbsolute(config.repoRoot) || await io.real(config.repoRoot) !== root) throw Error('Managed review server required');
  const requested = env.CUEVO_TEST_LOGIN_ACCOUNTS_FILE ?? resolve(root, '.local/synthetic-accounts.json');
  if (!isAbsolute(requested)) throw Error('Synthetic account source unavailable');
  const local = await io.real(resolve(root, '.local')), path = await io.real(requested);
  const below = relative(local, path);
  if (!below || below === '..' || below.startsWith(`..${sep}`) || isAbsolute(below) || !path.endsWith('.json')) throw Error('Synthetic account source unavailable');
  const raw = JSON.parse(await io.read(path));
  if (!Array.isArray(raw) || raw.length !== 133) throw Error('Synthetic account source unavailable');
  const accounts = raw.map(value => {
    if (!object(value) || typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 128) throw Error('Synthetic account source unavailable');
    const identity = identities.find(actor => actor.actorId === value.actorId);
    if (!identity || identity.email !== value.email || identity.role !== value.role || identity.schoolId !== value.schoolId) throw Error('Synthetic account source unavailable');
    return { ...identity, password: value.password };
  });
  if (new Set(accounts.map(account => account.actorId)).size !== 133) throw Error('Synthetic account source unavailable');
  return { accounts, identities };
}

export async function testingQuickLogin(request: Request, env: Environment = process.env, io: Dependencies = defaults): Promise<Response> {
  const target = quickLoginTarget(request, env);
  if (!target || !['GET', 'POST'].includes(request.method)) return empty(request.method === 'GET' ? 200 : 404);
  try {
    const { accounts, identities } = await loadAccounts(env, io);
    if (request.method === 'GET') {
      let guide:DemoGuideManifest|null=null;
      if(env.CUEVO_TEST_DEMO_GUIDE_FILE){try{const path=env.CUEVO_TEST_DEMO_GUIDE_FILE,accountPath=env.CUEVO_TEST_LOGIN_ACCOUNTS_FILE;if(!accountPath||!isAbsolute(path)||path!==resolve(accountPath,'../demo-guide.json')||await io.real(path)!==path)throw Error('Local demonstration source unavailable');const raw=await io.read(path);if(new TextEncoder().encode(raw).byteLength>8192)throw Error('Local demonstration source unavailable');guide=parseDemoGuideManifest(JSON.parse(raw));if(!guide||guide.schoolId!==identities[0].schoolId||roles.some(role=>identities.find(actor=>actor.role===role&&actor.schoolId===identities[0].schoolId)?.actorId!==guide!.actors[role]))throw Error('Local demonstration source unavailable');}catch{guide=null;}}
      return Response.json({ available: true, roles,...(guide?{guide}:{}) }, { headers });
    }
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json' || Number(request.headers.get('content-length') ?? 0) > 256) return empty(400);
    let body: unknown; try { body = await boundedQuickLoginBody(request); } catch { return empty(400); }
    if (!object(body) || Object.keys(body).length !== 1 || !roles.includes(body.role as Role)) return empty(400);
    // Manifest ordering identifies the existing reference-school account; no
    // actor, email, school or password can be supplied by the browser.
    const identity = identities.find(actor => actor.role === body.role && actor.schoolId === identities[0].schoolId);
    const account = accounts.find(actor => actor.actorId === identity?.actorId);
    if (!account) return empty();
    const response = await io.fetch(`${target.auth}/auth/v1/token?grant_type=password`, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { apikey: target.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) });
    if (!response.ok) return empty(503);
    const session: unknown = await response.json();
    if (!object(session) || typeof session.access_token !== 'string' || !session.access_token || session.access_token.length > 16384 || typeof session.refresh_token !== 'string' || !session.refresh_token || session.refresh_token.length > 4096 || !object(session.user) || session.user.id !== account.actorId || session.user.email !== account.email || session.user.is_anonymous !== false || typeof session.user.email_confirmed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(session.user.email_confirmed_at) || !Number.isFinite(Date.parse(session.user.email_confirmed_at))) return empty(503);
    return Response.json({ role: body.role, session: { access_token: session.access_token, refresh_token: session.refresh_token } }, { headers });
  } catch { return empty(503); }
}
