import { afterEach, describe, expect, it, vi } from 'vitest';
import * as provisioning from '../../src/platform/identity/provisioning';

const requestId = '00000000-0000-4000-8000-000000000010';
const userId = '00000000-0000-4000-8000-000000000011';
const identity = { requestId, userId, email: 'new.learner@example.test', priorState: 'NOT_ATTEMPTED' as const };
const config = { url: 'http://127.0.0.1:56321', projectRef: 'LOCAL_CUEVO', webOrigin: 'http://localhost:3000', redirects: { invite: 'http://localhost:3000/account/admission', recovery: 'http://localhost:3000/account/recovery' } };
const user = (changes: Record<string, unknown> = {}) => ({ id: userId, email: identity.email, is_anonymous: false, email_confirmed_at: null, user_metadata: { role: 'admin' }, ...changes });
const port = () => ({
  getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 404, code: 'user_not_found' } }),
  createUser: vi.fn().mockResolvedValue({ data: { user: user() }, error: null }),
  generateLink: vi.fn(),
});
const adapter = (dependency = port(), target: unknown = config) => new provisioning.AuthProvisioningAdapter(target, dependency);
const linkResponse = (purpose: 'invite' | 'recovery', changes: Record<string, unknown> = {}) => {
  const redirect = config.redirects[purpose];
  const token = 'private-redemption-token-do-not-record';
  return { data: { user: user({ email_confirmed_at: purpose === 'recovery' ? '2026-10-01T00:00:00Z' : null }), properties: {
    action_link: `${config.url}/auth/v1/verify?type=${purpose}&token=${token}&redirect_to=${encodeURIComponent(redirect)}`,
    hashed_token: token, email_otp: 'private-email-otp', redirect_to: redirect, verification_type: purpose, ...changes,
  } }, error: null };
};
afterEach(() => vi.unstubAllGlobals());

describe('approved-target Auth provisioning boundary', () => {
  it('creates only the exact server-assigned unconfirmed user and returns a minimized identity receipt', async () => {
    const dependency = port();
    const receipt = await adapter(dependency).createUnconfirmed(identity);
    expect(receipt).toEqual({ state: 'CONFIRMED', requestId, userId, emailConfirmed: false });
    expect(dependency.getUserById).toHaveBeenCalledWith(userId);
    expect(dependency.createUser).toHaveBeenCalledExactlyOnceWith({ id: userId, email: identity.email, email_confirm: false });
    expect(dependency.generateLink).not.toHaveBeenCalled();
    expect(JSON.stringify(receipt)).not.toContain('admin');
  });

  it('reconciles the exact assigned identity after an uncertain create without repeating creation', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null });
    expect(await adapter(dependency).createUnconfirmed({ ...identity, priorState: 'OUTCOME_UNKNOWN' })).toEqual({ state: 'CONFIRMED', requestId, userId, emailConfirmed: false });
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it('keeps a missing user after uncertain creation unresolved without creating again', async () => {
    const dependency = port();
    expect(await adapter(dependency).createUnconfirmed({ ...identity, priorState: 'OUTCOME_UNKNOWN' })).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'IDENTITY_NOT_CONFIRMED' });
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it('does not create again for an already confirmed exact identity', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null });
    expect((await adapter(dependency).createUnconfirmed({ ...identity, priorState: 'CONFIRMED' })).state).toBe('CONFIRMED');
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it('preserves unknown effect when create times out after an external side effect', async () => {
    const dependency = port(); dependency.createUser.mockRejectedValue(new Error('private provider details'));
    expect(await adapter(dependency).createUnconfirmed(identity)).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' });
    expect(dependency.createUser).toHaveBeenCalledTimes(1);
  });

  it.each([500, 503, undefined])('treats ambiguous create status %s as unknown without retries', async status => {
    const dependency = port(); dependency.createUser.mockResolvedValue({ data: { user: null }, error: { status, message: 'private error' } });
    expect((await adapter(dependency).createUnconfirmed(identity)).state).toBe('OUTCOME_UNKNOWN');
    expect(dependency.createUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 408, code: 'request_timeout' }, { status: 400, code: 'request_timeout' },
    { status: 422, code: 'hook_timeout' }, { status: 422, code: 'hook_timeout_after_retry' },
  ])('preserves uncertain create effects for provider timeout %j', async error => {
    const dependency = port(); dependency.createUser.mockResolvedValue({ data: { user: null }, error });
    expect(await adapter(dependency).createUnconfirmed(identity)).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' });
    expect(dependency.createUser).toHaveBeenCalledTimes(1);
  });

  it('does not treat a 4xx error with a returned user as a definitive rejection', async () => {
    const dependency = port(); dependency.createUser.mockResolvedValue({ data: { user: user() }, error: { status: 422, code: 'email_exists' } });
    expect(await adapter(dependency).createUnconfirmed(identity)).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' });
    expect(dependency.createUser).toHaveBeenCalledTimes(1);
  });

  it.each([500, 503])('does not create after an unavailable exact-ID lookup status %s', async status => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: null }, error: { status } });
    expect((await adapter(dependency).createUnconfirmed(identity)).state).toBe('OUTCOME_UNKNOWN');
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it('does not turn duplicate email rejection into foreign account admission', async () => {
    const dependency = port(); dependency.createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, code: 'email_exists', message: 'private email details' } });
    expect(await adapter(dependency).createUnconfirmed(identity)).toEqual({ state: 'REQUIRES_REVIEW', requestId, code: 'PROVIDER_REJECTED' });
    expect(dependency.createUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    { id: '00000000-0000-4000-8000-000000000099' }, { email: 'foreign@example.test' }, { email: undefined },
    { is_anonymous: true }, { is_anonymous: undefined }, { is_anonymous: null }, { is_anonymous: 'false' },
  ])('rejects a mismatched or unverified reconciled account %j without account creation', async changes => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user(changes) }, error: null });
    expect((await adapter(dependency).reconcileUser(identity)).state).toBe('REQUIRES_REVIEW');
    expect(dependency.createUser).not.toHaveBeenCalled();
    expect(dependency.generateLink).not.toHaveBeenCalled();
  });

  it('does not silently accept unexpected confirmation in a create response', async () => {
    const dependency = port(); dependency.createUser.mockResolvedValue({ data: { user: user({ email_confirmed_at: '2026-10-01T00:00:00Z' }) }, error: null });
    expect((await adapter(dependency).createUnconfirmed(identity)).state).toBe('REQUIRES_REVIEW');
  });

  it.each([
    { deleted_at: '2026-10-01T00:00:00Z' }, { deleted_at: 'invalid' }, { deleted_at: false },
    { banned_until: '9999-12-31T23:59:59Z' }, { banned_until: 'invalid' }, { banned_until: false },
  ])('refuses deleted, currently banned or malformed provider state %j before any link effect', async change => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user(change) }, error: null });
    const subject = adapter(dependency); const sink = vi.fn();
    expect((await subject.reconcileUser(identity)).state).toBe('REQUIRES_REVIEW');
    expect((await subject.generateLink({ ...identity, purpose: 'invite' }, sink)).state).toBe('REQUIRES_REVIEW');
    expect(dependency.createUser).not.toHaveBeenCalled(); expect(dependency.generateLink).not.toHaveBeenCalled(); expect(sink).not.toHaveBeenCalled();
  });

  it.each([
    {}, { deleted_at: null, banned_until: null }, { deleted_at: undefined, banned_until: undefined },
    { banned_until: '2020-01-01T00:00:00Z' },
  ])('keeps normal omitted/null account lifecycle fields and a known expired ban distinct from blocked state %j', async change => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user(change) }, error: null });
    expect(await adapter(dependency).reconcileUser(identity)).toEqual({ state: 'CONFIRMED', requestId, userId, emailConfirmed: false });
  });

  it.each([undefined, false, 'false'])('requires an explicit provider success marker %s before accepting a user', async error => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error });
    expect((await adapter(dependency).reconcileUser(identity)).state).toBe('OUTCOME_UNKNOWN');
  });

  it('does not treat missing email confirmation as a confirmed negative', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user({ email_confirmed_at: undefined }) }, error: null });
    expect(await adapter(dependency).reconcileUser(identity)).toEqual({ state: 'CONFIRMED', requestId, userId, emailConfirmed: null });
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it('confirms exact provider-created identity while keeping an omitted confirmation timestamp unknown', async () => {
    const dependency = port(); dependency.createUser.mockResolvedValue({ data: { user: user({ email_confirmed_at: undefined }) }, error: null });
    expect(await adapter(dependency).createUnconfirmed(identity)).toEqual({ state: 'CONFIRMED', requestId, userId, emailConfirmed: null });
    expect(dependency.createUser).toHaveBeenCalledExactlyOnceWith({ id: userId, email: identity.email, email_confirm: false });
  });

  it('can generate the exact approved invite while provider email confirmation remains unknown', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user({ email_confirmed_at: undefined }) }, error: null });
    const generated = linkResponse('invite'); dependency.generateLink.mockResolvedValue({ ...generated, data: { ...generated.data, user: user({ email_confirmed_at: undefined }) } });
    const sink = vi.fn().mockResolvedValue(undefined);
    expect(await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).toEqual({ state: 'GENERATED', requestId, userId, purpose: 'invite' });
    expect(sink).toHaveBeenCalledExactlyOnceWith({ actionLink: generated.data.properties.action_link, purpose: 'invite' });
  });

  it('does not generate recovery from an unknown provider confirmation state', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user({ email_confirmed_at: undefined }) }, error: null });
    const sink = vi.fn();
    expect(await adapter(dependency).generateLink({ ...identity, purpose: 'recovery' }, sink)).toEqual({ state: 'REQUIRES_REVIEW', requestId, code: 'EMAIL_NOT_CONFIRMED' });
    expect(dependency.generateLink).not.toHaveBeenCalled(); expect(sink).not.toHaveBeenCalled();
  });

  it('does not create after an unconfirmed provider 404 response', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404, code: 'route_not_found' } });
    expect((await adapter(dependency).createUnconfirmed(identity)).state).toBe('OUTCOME_UNKNOWN');
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it.each([{ requestId: 'invalid' }, { userId: 'invalid' }, { email: 'invalid' }, { email: ' new.learner@example.test' }, { role: 'admin' }, { password: 'private-password' }, { priorState: 'RETRY' }])('rejects invalid or broad operation inputs %j before provider work', async changes => {
    const dependency = port();
    await expect(adapter(dependency).createUnconfirmed({ ...identity, ...changes })).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
    expect(dependency.getUserById).not.toHaveBeenCalled();
    expect(dependency.createUser).not.toHaveBeenCalled();
  });

  it.each([
    { url: 'https://foreign.example' }, { url: 'http://127.0.0.1:54321' }, { webOrigin: 'https://user:password@example.test' },
    { redirects: { ...config.redirects, invite: 'https://foreign.example/claim' } },
    { redirects: { ...config.redirects, recovery: 'http://localhost:3000/account/recovery?next=https://foreign.example' } },
  ])('rejects an unapproved target or redirect %j', changes => {
    expect(() => adapter(port(), { ...config, ...changes })).toThrow();
  });

  it.each(['invite', 'recovery'] as const)('generates one exact %s link through the transient sink and excludes credentials from its receipt', async purpose => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user({ email_confirmed_at: purpose === 'recovery' ? '2026-10-01T00:00:00Z' : null }) }, error: null });
    dependency.generateLink.mockResolvedValue(linkResponse(purpose));
    const sink = vi.fn().mockResolvedValue(undefined);
    const receipt = await adapter(dependency).generateLink({ ...identity, purpose }, sink);
    expect(receipt).toEqual({ state: 'GENERATED', requestId, userId, purpose });
    expect(dependency.generateLink).toHaveBeenCalledExactlyOnceWith({ type: purpose, email: identity.email, options: { redirectTo: config.redirects[purpose] } });
    expect(sink).toHaveBeenCalledExactlyOnceWith({ actionLink: linkResponse(purpose).data.properties.action_link, purpose });
    expect(JSON.stringify(receipt)).not.toMatch(/redemption|otp|token|action_link|actionLink|hashed/i);
  });

  it('does not regenerate an uncertain link or send a replacement automatically', async () => {
    const dependency = port(); const sink = vi.fn();
    expect(await adapter(dependency).generateLink({ ...identity, purpose: 'invite', priorState: 'OUTCOME_UNKNOWN' }, sink)).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'LINK_NOT_CONFIRMED' });
    expect(dependency.getUserById).not.toHaveBeenCalled(); expect(dependency.generateLink).not.toHaveBeenCalled(); expect(sink).not.toHaveBeenCalled();
  });

  it('keeps link state unknown if the secret sink fails without leaking its exception', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null }); dependency.generateLink.mockResolvedValue(linkResponse('invite'));
    const receipt = await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, async () => { throw Error('private-redemption-token-do-not-record'); });
    expect(receipt).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'LINK_CONSUMPTION_UNKNOWN' });
    expect(dependency.generateLink).toHaveBeenCalledTimes(1);
  });

  it.each([
    { verification_type: 'recovery' }, { redirect_to: 'https://foreign.example' }, { hashed_token: 'different' },
    { action_link: 'https://foreign.example/verify?token=private' },
  ])('rejects mismatched generated link properties %j before the secret sink', async changes => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null }); dependency.generateLink.mockResolvedValue(linkResponse('invite', changes)); const sink = vi.fn();
    expect((await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).state).toBe('OUTCOME_UNKNOWN');
    expect(sink).not.toHaveBeenCalled();
  });

  it.each(['&token=foreign', '&redirect_to=https%3A%2F%2Fforeign.example', '&type=recovery', '&extra=private'])('rejects ambiguous or additional link parameters %s before the secret sink', async suffix => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null });
    dependency.generateLink.mockResolvedValue(linkResponse('invite', { action_link: linkResponse('invite').data.properties.action_link + suffix }));
    const sink = vi.fn();
    expect((await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).state).toBe('OUTCOME_UNKNOWN');
    expect(sink).not.toHaveBeenCalled();
  });

  it('does not generate a link for a reconciled foreign identity', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user({ email: 'foreign@example.test' }) }, error: null }); const sink = vi.fn();
    expect((await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).state).toBe('REQUIRES_REVIEW');
    expect(dependency.generateLink).not.toHaveBeenCalled(); expect(sink).not.toHaveBeenCalled();
  });

  it('does not generate recovery for an unconfirmed account email', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null }); const sink = vi.fn();
    expect(await adapter(dependency).generateLink({ ...identity, purpose: 'recovery' }, sink)).toEqual({ state: 'REQUIRES_REVIEW', requestId, code: 'EMAIL_NOT_CONFIRMED' });
    expect(dependency.generateLink).not.toHaveBeenCalled(); expect(sink).not.toHaveBeenCalled();
  });

  it('does not consume link output after a provider changes the exact target identity', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null });
    dependency.generateLink.mockResolvedValue({ ...linkResponse('invite'), data: { ...linkResponse('invite').data, user: user({ id: '00000000-0000-4000-8000-000000000099' }) } });
    const sink = vi.fn();
    expect((await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).state).toBe('OUTCOME_UNKNOWN');
    expect(sink).not.toHaveBeenCalled();
  });

  it('does not consume a link whose generated provider account became banned after the exact-ID read', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null });
    dependency.generateLink.mockResolvedValue({ ...linkResponse('invite'), data: { ...linkResponse('invite').data, user: user({ banned_until: '9999-12-31T23:59:59Z' }) } });
    const sink = vi.fn();
    expect((await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).state).toBe('OUTCOME_UNKNOWN');
    expect(sink).not.toHaveBeenCalled();
  });

  it('keeps a generation timeout unknown without replaying the provider or consuming a secret', async () => {
    const dependency = port(); dependency.getUserById.mockResolvedValue({ data: { user: user() }, error: null }); dependency.generateLink.mockRejectedValue(new Error('private-redemption-token-do-not-record')); const sink = vi.fn();
    expect(await adapter(dependency).generateLink({ ...identity, purpose: 'invite' }, sink)).toEqual({ state: 'OUTCOME_UNKNOWN', requestId, code: 'PROVIDER_OUTCOME_UNKNOWN' });
    expect(dependency.generateLink).toHaveBeenCalledTimes(1); expect(sink).not.toHaveBeenCalled();
  });
});

describe('owned SDK Auth provisioning transport', () => {
  it('binds exact local Auth routes and unconfirmed create payload to the supplied server-only credential', async () => {
    const requests: { url: string; method: string | undefined; body: unknown; authorization: string | null; redirect: RequestRedirect | undefined }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null, authorization: new Headers(init?.headers).get('Authorization'), redirect: init?.redirect });
      if (init?.method === 'GET') return new Response(JSON.stringify({ code: 'user_not_found', msg: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } });
      return new Response(JSON.stringify(user()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const receipt = await provisioning.createAuthProvisioning({ ...config, key: 'sb_secret_test-only' }).createUnconfirmed(identity);
    expect(receipt).toEqual({ state: 'CONFIRMED', requestId, userId, emailConfirmed: false });
    expect(requests).toEqual([
      { url: `${config.url}/auth/v1/admin/users/${userId}`, method: 'GET', body: null, authorization: 'Bearer sb_secret_test-only', redirect: 'error' },
      { url: `${config.url}/auth/v1/admin/users`, method: 'POST', body: { id: userId, email: identity.email, email_confirm: false }, authorization: 'Bearer sb_secret_test-only', redirect: 'error' },
    ]);
    expect(JSON.stringify(receipt)).not.toContain('sb_secret');
  });

  it('rejects a missing provisioning key before any SDK request', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(() => provisioning.createAuthProvisioning({ ...config, key: '' })).toThrowError(expect.objectContaining({ code: 'AUTH_PROVISIONING_UNAVAILABLE', status: 503 }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['invite', 'recovery'] as const)('uses the fixed SDK generation route and returns no %s redemption credentials', async purpose => {
    const captured: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); captured.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const generated = linkResponse(purpose);
      return new Response(JSON.stringify(init?.method === 'GET' ? generated.data.user : { ...generated.data.user, ...generated.data.properties }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const sink = vi.fn().mockResolvedValue(undefined);
    const receipt = await provisioning.createAuthProvisioning({ ...config, key: 'sb_secret_test-only' }).generateLink({ ...identity, purpose }, sink);
    expect(receipt).toEqual({ state: 'GENERATED', requestId, userId, purpose });
    expect(captured).toEqual([
      { url: `${config.url}/auth/v1/admin/users/${userId}`, body: null },
      { url: `${config.url}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(config.redirects[purpose])}`, body: { type: purpose, email: identity.email, redirectTo: config.redirects[purpose] } },
    ]);
    expect(JSON.stringify(receipt)).not.toMatch(/redemption|otp|token|secret/);
  });
});
