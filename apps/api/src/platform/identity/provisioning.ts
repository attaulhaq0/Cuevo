import { createClient } from '@supabase/supabase-js';
import { DomainError } from '@cuevo/domain';
import { z } from 'zod';

export interface AuthProvisioningPort {
  getUserById(userId: string): Promise<unknown>;
  createUser(input: { id: string; email: string; email_confirm: false }): Promise<unknown>;
  generateLink(input: { type: 'invite' | 'recovery'; email: string; options: { redirectTo: string } }): Promise<unknown>;
}
export type AuthProvisioningConfig = { url: string; projectRef: string; webOrigin: string; redirects: { invite: string; recovery: string } };
export type AuthIdentityOperation = { requestId: string; userId: string; email: string; priorState: 'NOT_ATTEMPTED' | 'OUTCOME_UNKNOWN' | 'CONFIRMED' };
export type AuthLinkOperation = AuthIdentityOperation & { purpose: 'invite' | 'recovery' };
export type AuthIdentityReceipt = { state: 'CONFIRMED'; requestId: string; userId: string; emailConfirmed: boolean | null } | { state: 'REQUIRES_REVIEW' | 'OUTCOME_UNKNOWN'; requestId: string; code: string };
export type AuthLinkReceipt = { state: 'GENERATED'; requestId: string; userId: string; purpose: 'invite' | 'recovery' } | { state: 'REQUIRES_REVIEW' | 'OUTCOME_UNKNOWN'; requestId: string; code: string };
export type AuthLinkSink = (secret: { actionLink: string; purpose: 'invite' | 'recovery' }) => Promise<void>;

const operationSchema = z.object({ requestId: z.uuid(), userId: z.uuid(), email: z.email().max(254), priorState: z.enum(['NOT_ATTEMPTED', 'OUTCOME_UNKNOWN', 'CONFIRMED']) }).strict();
const linkSchema = operationSchema.extend({ purpose: z.enum(['invite', 'recovery']) });
const configSchema = z.object({ url: z.string(), projectRef: z.string(), webOrigin: z.string(), redirects: z.object({ invite: z.string(), recovery: z.string() }).strict() }).strict();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT', 400, 'Review the approved account request.');
  return result.data;
}
function object(input: unknown): input is Record<string, unknown> { return input !== null && typeof input === 'object' && !Array.isArray(input); }
function response(input: unknown) { return object(input) && object(input.data) ? { data: input.data, error: input.error } : null; }
function errorStatus(error: unknown): number | undefined { return object(error) && typeof error.status === 'number' ? error.status : undefined; }
function safeFailure(requestId: string, state: 'REQUIRES_REVIEW' | 'OUTCOME_UNKNOWN', code: string) { return { state, requestId, code }; }

function validateConfig(input: unknown): AuthProvisioningConfig {
  const config = parse(configSchema, input);
  try {
    const target = new URL(config.url); const origin = new URL(config.webOrigin);
    if (target.username || target.password || target.search || target.hash || target.pathname !== '/' || target.origin !== config.url || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || origin.origin !== config.webOrigin) throw Error('Invalid origin');
    const local = config.projectRef === 'LOCAL_CUEVO' && target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port === '56321';
    const hosted = /^[a-z]{20}$/.test(config.projectRef) && config.url === `https://${config.projectRef}.supabase.co`;
    if (!local && !hosted || local && !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(config.webOrigin) || hosted && origin.protocol !== 'https:') throw Error('Unapproved target');
    for (const redirect of Object.values(config.redirects)) {
      const url = new URL(redirect);
      if (url.origin !== config.webOrigin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/account/')) throw Error('Unapproved redirect');
    }
    return config;
  } catch { throw new DomainError('AUTH_PROVISIONING_TARGET_INVALID', 400, 'The approved account service target is invalid.'); }
}

function exactIdentity(input: unknown, expected: AuthIdentityOperation): { emailConfirmed: boolean | null } | null {
  if (!object(input) || input.id !== expected.userId || input.email !== expected.email || input.is_anonymous !== false) return null;
  // These optional lifecycle fields are normally omitted for active Auth users.
  // A supplied deletion marker or malformed/current ban must still fail closed.
  if (input.deleted_at !== null && input.deleted_at !== undefined) return null;
  const ban = input.banned_until;
  if (ban !== null && ban !== undefined && (!z.iso.datetime({ offset: true }).safeParse(ban).success || Date.parse(String(ban)) > Date.now())) return null;
  const confirmation = input.email_confirmed_at;
  if (confirmation !== null && confirmation !== undefined && !z.iso.datetime({ offset: true }).safeParse(confirmation).success) return null;
  return { emailConfirmed: confirmation === undefined ? null : confirmation !== null };
}

/** Caller supplies a current private approval and durable attempt state; this adapter grants no school access. */
export class AuthProvisioningAdapter {
  private readonly config: AuthProvisioningConfig;
  constructor(config: unknown, private readonly port: AuthProvisioningPort) { this.config = validateConfig(config); }

  private async inspect(input: AuthIdentityOperation): Promise<AuthIdentityReceipt | { state: 'NOT_FOUND'; requestId: string }> {
    let provider: unknown;
    try { provider = await this.port.getUserById(input.userId); } catch { return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_OUTCOME_UNKNOWN'); }
    const result = response(provider);
    if (!result) return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_RESPONSE_UNCONFIRMED');
    if (result.error !== null) {
      if (errorStatus(result.error) === 404 && object(result.error) && result.error.code === 'user_not_found' && result.data.user === null) return { state: 'NOT_FOUND', requestId: input.requestId };
      return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_OUTCOME_UNKNOWN');
    }
    const account = exactIdentity(result.data.user, input);
    return account ? { state: 'CONFIRMED', requestId: input.requestId, userId: input.userId, ...account } : safeFailure(input.requestId, 'REQUIRES_REVIEW', 'IDENTITY_MISMATCH');
  }

  async reconcileUser(value: unknown): Promise<AuthIdentityReceipt> {
    const input = parse(operationSchema, value); const current = await this.inspect(input);
    return current.state === 'NOT_FOUND' ? safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'IDENTITY_NOT_CONFIRMED') : current;
  }

  async createUnconfirmed(value: unknown): Promise<AuthIdentityReceipt> {
    const input = parse(operationSchema, value); const current = await this.inspect(input);
    if (current.state !== 'NOT_FOUND') return current;
    if (input.priorState !== 'NOT_ATTEMPTED') return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'IDENTITY_NOT_CONFIRMED');
    let provider: unknown;
    try { provider = await this.port.createUser({ id: input.userId, email: input.email, email_confirm: false }); } catch { return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_OUTCOME_UNKNOWN'); }
    const result = response(provider);
    if (!result) return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_RESPONSE_UNCONFIRMED');
    if (result.error !== null) {
      const status = errorStatus(result.error);
      const timeout = status === 408 || object(result.error) && ['request_timeout', 'hook_timeout', 'hook_timeout_after_retry'].includes(String(result.error.code));
      return result.data.user === null && !timeout && status !== undefined && status >= 400 && status < 500 ? safeFailure(input.requestId, 'REQUIRES_REVIEW', 'PROVIDER_REJECTED') : safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_OUTCOME_UNKNOWN');
    }
    const account = exactIdentity(result.data.user, input);
    return account && account.emailConfirmed !== true ? { state: 'CONFIRMED', requestId: input.requestId, userId: input.userId, emailConfirmed: account.emailConfirmed } : safeFailure(input.requestId, 'REQUIRES_REVIEW', 'IDENTITY_MISMATCH');
  }

  async generateLink(value: unknown, sink: AuthLinkSink): Promise<AuthLinkReceipt> {
    const input = parse(linkSchema, value);
    if (input.priorState !== 'NOT_ATTEMPTED') return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'LINK_NOT_CONFIRMED');
    const identity = await this.inspect(input);
    if (identity.state !== 'CONFIRMED') return identity.state === 'NOT_FOUND' ? safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'IDENTITY_NOT_CONFIRMED') : identity;
    if (input.purpose === 'recovery' && identity.emailConfirmed !== true) return safeFailure(input.requestId, 'REQUIRES_REVIEW', 'EMAIL_NOT_CONFIRMED');
    let provider: unknown;
    try { provider = await this.port.generateLink({ type: input.purpose, email: input.email, options: { redirectTo: this.config.redirects[input.purpose] } }); } catch { return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_OUTCOME_UNKNOWN'); }
    const result = response(provider);
    if (!result || result.error !== null) return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'PROVIDER_OUTCOME_UNKNOWN');
    const properties = result.data.properties;
    if (!exactIdentity(result.data.user, input) || !object(properties) || properties.verification_type !== input.purpose || properties.redirect_to !== this.config.redirects[input.purpose] || typeof properties.action_link !== 'string' || properties.action_link.length > 8192 || typeof properties.hashed_token !== 'string' || !properties.hashed_token) return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'LINK_RESPONSE_UNCONFIRMED');
    try {
      const action = new URL(properties.action_link);
      const keys = Array.from(action.searchParams.keys());
      if (keys.length !== 3 || new Set(keys).size !== 3 || keys.some(key => !['type', 'token', 'redirect_to'].includes(key)) || action.origin !== this.config.url || action.pathname !== '/auth/v1/verify' || action.username || action.password || action.hash || action.searchParams.get('type') !== input.purpose || action.searchParams.get('redirect_to') !== this.config.redirects[input.purpose] || action.searchParams.get('token') !== properties.hashed_token) throw Error('Unapproved link');
    } catch { return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'LINK_RESPONSE_UNCONFIRMED'); }
    try { await sink({ actionLink: properties.action_link, purpose: input.purpose }); } catch { return safeFailure(input.requestId, 'OUTCOME_UNKNOWN', 'LINK_CONSUMPTION_UNKNOWN'); }
    return { state: 'GENERATED', requestId: input.requestId, userId: input.userId, purpose: input.purpose };
  }
}

export function createAuthProvisioning(config: AuthProvisioningConfig & { key: string }): AuthProvisioningAdapter {
  const target = validateConfig({ url: config.url, projectRef: config.projectRef, webOrigin: config.webOrigin, redirects: config.redirects });
  if (!config.key) throw new DomainError('AUTH_PROVISIONING_UNAVAILABLE', 503, 'The account service is unavailable.');
  const client = createClient(target.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) }) } });
  return new AuthProvisioningAdapter(target, { getUserById: id => client.auth.admin.getUserById(id), createUser: input => client.auth.admin.createUser(input), generateLink: input => client.auth.admin.generateLink(input) });
}
