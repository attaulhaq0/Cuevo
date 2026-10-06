import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseExecutionJson } from './release-review';

const fail = () => Error('Protected preview source, original capability or expiry requires review; private contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/), time = z.iso.datetime({ offset: true });
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const origin = z.string().refine(value => { try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.port && !url.username && !url.password && !url.search && !url.hash && /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname); } catch { return false; } });
const bindingSchema = z.object({ owner: z.enum(['api', 'web']), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), releaseSha: sha, treeSha: sha, runId: identifier, runAttempt: z.number().int().positive(), packageSha256: digest, artifactSha256: digest, teamId: z.string().regex(/^team_[A-Za-z0-9]+$/), projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/), origin }).strict();
const secret = z.string().min(20).max(4096).regex(/^[\x21-\x7e]+$/);
const receiptSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_PRIVATE_IMMUTABLE_PREVIEW'), status: z.enum(['CONFIRMED', 'NONE', 'REQUIRES_REVIEW']), binding: bindingSchema, createdAt: time, expiresAt: time, credentialSha256: digest.nullable(), protection: z.enum(['PROTECTED', 'UNPROTECTED']), hostedAcceptance: z.literal(false) }).strict();
const privateSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_PRIVATE_IMMUTABLE_PREVIEW_CREDENTIAL'), binding: bindingSchema, createdAt: time, expiresAt: time, value: secret }).strict();
export type ProtectedPreviewBinding = z.infer<typeof bindingSchema>;
export type ProtectedPreviewReceipt = z.infer<typeof receiptSchema>;
type Clock = { now?: () => number };
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
function clock(options: Clock) { const at = options.now?.() ?? Date.now(); if (!Number.isSafeInteger(at) || at < 0) throw fail(); return at; }
function options(value: unknown, creation = false): asserts value is Clock & { admit?: () => Promise<void> } {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail();
  for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !['now', ...(creation ? ['admit'] : [])].includes(key) || !field || !('value' in field) || !field.enumerable || field.value !== undefined && (typeof field.value !== 'function' || types.isProxy(field.value))) throw fail(); }
  if (creation && typeof (value as { admit?: unknown }).admit !== 'function') throw fail();
}
function paths(root: string, owner: ProtectedPreviewBinding['owner']) { const folder = join(root, owner === 'api' ? '.local/hosted-release' : '.local/cicd-release'), stem = 'protected-preview-' + owner; return { folder, intent: join(folder, stem + '-intent.json'), receipt: join(folder, stem + '-result.json'), private: join(folder, stem + '-private.json') }; }
async function physical(root: string, path: string, file = false) {
  if (!isAbsolute(root) || resolve(root) !== root || !isAbsolute(path) || resolve(path) !== path || await realpath(root) !== root) throw fail();
  const part = relative(root, path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(value => !value || value === '.' || value === '..')) throw fail();
  let current = root; for (const [index, value] of part.split(/[\\/]/).entries()) { current = join(current, value); const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (file && index === part.split(/[\\/]/).length - 1 ? !stat.isFile() || stat.nlink !== 1 || stat.size > 16384 || process.platform !== 'win32' && (stat.mode & 0o077) !== 0 : !stat.isDirectory())) throw fail(); }
}
async function read(root: string, path: string) { await physical(root, path, true); const before = await lstat(path), bytes = await readFile(path), after = await lstat(path); if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length > 16384) throw fail(); return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) as unknown; }
async function persist(path: string, value: unknown) { const file = await open(path, 'wx', 0o600); try { await file.writeFile(canonicalReleaseExecutionJson(value)); await file.sync(); } finally { await file.close(); } if (process.platform !== 'win32') { const directory = await open(resolve(path, '..'), 'r'); try { await directory.sync(); } finally { await directory.close(); } } }
async function folders(root: string, folder: string) { for (const path of [join(root, '.local'), folder]) { await mkdir(path, { recursive: true, mode: 0o700 }); await physical(root, path); } }
async function ignored(root: string, file: string) { const name = relative(root, file).replaceAll('\\', '/'); const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]!]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
  try { if (execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '--stdin'], { input: name + '\n', encoding: 'utf8', env, windowsHide: true }).trim() !== name || execFileSync('git', ['-C', root, 'ls-files', '--cached', '--', name], { env, windowsHide: true }).length) throw fail(); } catch { throw fail(); }
}
async function official(url: string, token: string, method: 'GET' | 'PATCH' = 'GET', body?: unknown) {
  const signal = AbortSignal.timeout(15000), response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', credentials: 'omit', cache: 'no-store', signal });
  if (response.status !== 200 || response.redirected || response.url && response.url !== url || !response.body) throw fail(); const length = response.headers.get('content-length'); if (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536)) throw fail();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let bytes = 0;
  try { for (;;) { if (signal.aborted) throw fail(); const item = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { signal.removeEventListener('abort', abort); reject(fail()); }; if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(fail()); }); }); if (item.done) break; bytes += item.value.length; if (bytes > 65536) throw fail(); parts.push(item.value); } if (signal.aborted) throw fail(); return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(parts))) as unknown; }
  finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled reads retain cleanup. */ } }
}
function current(receipt: ProtectedPreviewReceipt, binding: ProtectedPreviewBinding, now: number) { const created = Date.parse(receipt.createdAt), expires = Date.parse(receipt.expiresAt); if (!same(receipt.binding, binding) || created > now || expires <= now || expires <= created || expires - created > 3600000 || now - created > 3600000 || receipt.status === 'REQUIRES_REVIEW') throw fail(); }

/** The caller owns current release approval. This fixed official metadata/URL
 * capability owner creates no application or backend authority. */
export async function createProtectedPreview(value: { repoRoot: string; binding: ProtectedPreviewBinding; vercelToken: string; approvalExpiresAt: string }, ports: { admit: () => Promise<void>; now?: () => number }): Promise<ProtectedPreviewReceipt> {
  options(ports, true); const input = z.object({ repoRoot: z.string(), binding: bindingSchema, vercelToken: secret, approvalExpiresAt: time }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value))), binding = input.binding, files = paths(input.repoRoot, binding.owner); await folders(input.repoRoot, files.folder); await ignored(input.repoRoot, files.private);
  // Existing original intent is never replaced, even after lost acknowledgement.
  for (const file of [files.intent, files.receipt, files.private]) { try { await lstat(file); throw fail(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw fail(); } }
  const now = clock(ports), expiry = Math.min(now + 3600000, Date.parse(input.approvalExpiresAt)); let ttl = Math.floor((expiry - now) / 1000); if (ttl < 1 || ttl > 3600) throw fail();
  let createdAt = new Date(now).toISOString(), expiresAt = new Date(now + ttl * 1000).toISOString();
  let result: ProtectedPreviewReceipt = { version: 1, purpose: 'CUEVO_PRIVATE_IMMUTABLE_PREVIEW', status: 'REQUIRES_REVIEW', binding, createdAt, expiresAt, credentialSha256: null, protection: 'PROTECTED', hostedAcceptance: false }, intent = false;
  try {
    await ports.admit(); const query = '?teamId=' + encodeURIComponent(binding.teamId);
    const project = z.object({ id: z.literal(binding.projectId), accountId: z.literal(binding.teamId), ssoProtection: z.object({ deploymentType: z.enum(['all', 'all_except_custom_domains', 'preview']) }).nullable() }).parse(await official('https://api.vercel.com/v9/projects/' + encodeURIComponent(binding.projectId) + query, input.vercelToken));
    z.object({ id: z.literal(binding.deploymentId), projectId: z.literal(binding.projectId), ownerId: z.literal(binding.teamId), url: z.literal(new URL(binding.origin).hostname), readyState: z.literal('READY'), target: z.literal('preview').or(z.null()), meta: z.object({ cuevoCommitSha: z.literal(binding.releaseSha) }) }).parse(await official('https://api.vercel.com/v13/deployments/' + encodeURIComponent(binding.deploymentId) + query, input.vercelToken));
    await ports.admit(); const admittedAt = clock(ports); ttl = Math.floor((Math.min(admittedAt + 3600000, Date.parse(input.approvalExpiresAt)) - admittedAt) / 1000); if (ttl < 1 || ttl > 3600) throw fail();
    createdAt = new Date(admittedAt).toISOString(); expiresAt = new Date(admittedAt + ttl * 1000).toISOString(); result = { ...result, createdAt, expiresAt };
    result.protection = project.ssoProtection === null ? 'UNPROTECTED' : 'PROTECTED'; await persist(files.intent, { version: 1, purpose: result.purpose, binding, createdAt, expiresAt, ttl, protection: result.protection }); intent = true;
    // Durable filesystem work consumes the original approval window too.
    // Reduce the provider lifetime without renewing the retained deadline.
    const remainingTtl = Math.floor((Date.parse(expiresAt) - clock(ports)) / 1000); if (remainingTtl < 1) throw fail();
    if (project.ssoProtection === null) result.status = 'NONE';
    else { const raw = z.object({ value: secret }).strict().parse(await official('https://api.vercel.com/aliases/' + encodeURIComponent(binding.deploymentId) + '/protection-bypass' + query, input.vercelToken, 'PATCH', { ttl: Math.min(ttl, remainingTtl) })); if (raw.value === input.vercelToken) throw fail();
      await persist(files.private, { version: 1, purpose: 'CUEVO_PRIVATE_IMMUTABLE_PREVIEW_CREDENTIAL', binding, createdAt, expiresAt, value: raw.value }); result.credentialSha256 = hash(raw.value); result.status = 'CONFIRMED'; }
    await ports.admit(); current(result, binding, clock(ports));
  } catch { result = { ...result, status: 'REQUIRES_REVIEW' }; }
  if (intent) await persist(files.receipt, result); return result;
}

export async function readProtectedPreview(value: { repoRoot: string; binding: ProtectedPreviewBinding }, ports: Clock = {}): Promise<ProtectedPreviewReceipt> { options(ports); const input = z.object({ repoRoot: z.string(), binding: bindingSchema }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value))), file = paths(input.repoRoot, input.binding.owner); await ignored(input.repoRoot, file.private); const receipt = receiptSchema.parse(await read(input.repoRoot, file.receipt)); current(receipt, input.binding, clock(ports)); return receipt; }

/** Adds only a Vercel gateway header for the bound immutable origin. Callers
 * retain their request allowlists and normal application Authorization headers. */
export async function protectedPreviewHeaders(value: { repoRoot: string; binding: ProtectedPreviewBinding; url: string; receipt?: ProtectedPreviewReceipt }, ports: Clock = {}): Promise<Record<string, string>> {
  options(ports); const input = z.object({ repoRoot: z.string(), binding: bindingSchema, url: z.string(), receipt: receiptSchema.optional() }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value)));
  const url = new URL(input.url); if (url.protocol !== 'https:' || url.origin !== input.binding.origin || url.username || url.password || url.port || url.hash || /^https:\/\/[^/]+:/.test(input.url) || !input.url.startsWith(input.binding.origin + '/')) throw fail();
  const receipt = await readProtectedPreview({ repoRoot: input.repoRoot, binding: input.binding }, ports); if (input.receipt && !same(receipt, input.receipt)) throw fail();
  if (receipt.status === 'NONE') { if (receipt.credentialSha256 !== null || receipt.protection !== 'UNPROTECTED') throw fail(); return {}; }
  const files = paths(input.repoRoot, input.binding.owner), capability = privateSchema.parse(await read(input.repoRoot, files.private));
  if (!same(capability.binding, input.binding) || capability.createdAt !== receipt.createdAt || capability.expiresAt !== receipt.expiresAt || hash(capability.value) !== receipt.credentialSha256 || receipt.protection !== 'PROTECTED') throw fail(); current(receipt, input.binding, clock(ports));
  return { 'x-vercel-protection-bypass': capability.value };
}
