import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseServerConfig } from '@cuevo/config';
import * as auth from '../../src/platform/identity/supabase-auth';

const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000003';
const config = () => parseServerConfig({ NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:56321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only' });
const token = (claims: Record<string, unknown> = {}) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, email: 'forged@example.test', role: 'admin', ...claims })).toString('base64url')}.test-signature`;
const providerUser = (changes: Record<string, unknown> = {}) => ({
  id: userId, aud: 'authenticated', role: 'authenticated', created_at: '2026-10-01T10:00:00Z',
  email: 'new.learner@example.test', email_confirmed_at: '2026-10-01T12:00:00Z', is_anonymous: false,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { email: 'untrusted@example.test', email_verified: true, role: 'admin' }, identities: [],
  ...changes,
});
const respond = (user: unknown = providerUser(), status = 200) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
const verifyAccount = (value: string) => auth.createAccountVerifier(config())(value);

afterEach(() => vi.unstubAllGlobals());

describe('Supabase current account verification boundary', () => {
  it('uses Auth-confirmed identity/email only and sends the supplied token to the fixed Auth endpoint', async () => {
    const fetcher = respond();
    const supplied = token();
    expect(await verifyAccount(supplied)).toEqual({ userId, sessionId, email: 'new.learner@example.test', emailConfirmedAt: '2026-10-01T12:00:00Z' });
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:56321/auth/v1/user', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${supplied}` }), signal: expect.any(AbortSignal),
    }));
  });

  it.each([
    { email: undefined }, { email: '' }, { email: 'invalid' }, { email: ' new.learner@example.test' },
  ])('does not recover a missing/invalid provider email from JWT or editable metadata %j', async change => {
    respond(providerUser(change));
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_REQUIRED', status: 403 });
  });

  it.each([
    { email_confirmed_at: undefined }, { email_confirmed_at: '' }, { email_confirmed_at: 'invalid' }, { is_anonymous: true },
  ])('does not grant verified email from metadata or anonymous identity %j', async change => {
    respond(providerUser(change));
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_UNCONFIRMED', status: 403 });
  });

  it.each([undefined, null, 'false', 'true'])('requires an explicitly non-anonymous provider account flag %s', async isAnonymous => {
    respond(providerUser({ is_anonymous: isAnonymous }));
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'ACCOUNT_EMAIL_UNCONFIRMED', status: 403 });
  });

  it.each([
    { sub: undefined }, { sub: '00000000-0000-4000-8000-000000000099' }, { session_id: undefined }, { session_id: 'invalid' },
  ])('denies absent or mismatched signed subject/session %j', async claims => {
    respond();
    await expect(verifyAccount(token(claims))).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401 });
  });

  it.each([null, providerUser({ id: 'invalid' })])('denies absent or malformed provider subjects', async user => {
    respond({ user });
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401 });
  });

  it('denies malformed JWT data after provider verification', async () => {
    respond();
    await expect(verifyAccount('not-a-token')).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401 });
  });

  it('keeps upstream rejections separate from provider outages without leaking their bodies', async () => {
    respond({ code: 'bad_jwt', message: 'private-provider-detail' }, 401);
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'INVALID_SESSION', status: 401, message: 'Sign in again to continue.' });
  });

  it.each([500, 503])('sanitizes provider HTTP %s outages', async status => {
    respond({ message: 'private-provider-detail' }, status);
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503, message: 'Authentication is temporarily unavailable.' });
  });

  it('sanitizes a provider network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-network-detail')));
    await expect(verifyAccount(token())).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503, message: 'Authentication is temporarily unavailable.' });
  });

  it('fails closed without configured Auth and does not call the network', async () => {
    const fetcher = respond();
    const result = auth.createAccountVerifier(parseServerConfig({ NODE_ENV: 'test' }))(token());
    await expect(result).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('preserves the ordinary school verifier contract for an account without confirmed email', async () => {
    respond(providerUser({ email: undefined, email_confirmed_at: undefined }));
    expect(await auth.createUserVerifier(config())(token())).toEqual({ userId, sessionId });
  });

  it('does not include provider email or metadata in ordinary school identity results', async () => {
    respond();
    expect(await auth.createUserVerifier(config())(token())).toEqual({ userId, sessionId });
  });
});
