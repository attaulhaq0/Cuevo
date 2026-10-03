import { describe, expect, it } from 'vitest';
import { createLocalAccountMail } from '../../src/platform/identity/local-account-mail';

const requestId = '35000000-0000-4000-8000-000000000001';
const userSecret = 'a'.repeat(64);
const message = { requestId, email: 'new.learner@example.test', admissionUrl: `http://localhost:3000/account/admission#id=${requestId}&type=invite&token_hash=provider-redemption&admission_secret=${userSecret}`, expiresAt: '2099-10-04T00:00:00Z', signal: new AbortController().signal };
describe('local account invitation capture', () => {
  it('captures recovery only on its fixed purpose route with access-preserving explanation', async () => {
    let body: Record<string, unknown> = {}; const send = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' }, async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ ID: 'hXayS6wnCgNnt6aFTvmOF6' }), { headers: { 'Content-Type': 'application/json' } }); });
    expect(await send({ ...message, admissionUrl: message.admissionUrl.replace('/account/admission', '/account/recovery').replace('type=invite', 'type=recovery') })).toEqual({ state: 'ACCEPTED' });
    expect(body.Subject).toBe('Cuevo account recovery · استعادة الحساب'); expect(body.Text).toContain('does not change your school access');
  });
  it('posts exactly one minimized bilingual message to the fixed local capture target', async () => {
    const calls: { url: string; input: RequestInit }[] = [];
    const send = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' }, async (url, input) => { calls.push({ url: String(url), input: input! }); return new Response(JSON.stringify({ ID: 'hXayS6wnCgNnt6aFTvmOF6' }), { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    expect(await send(message)).toEqual({ state: 'ACCEPTED' }); expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:56324/api/v1/send');
    expect(calls[0].input.redirect).toBe('error'); expect(calls[0].input.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(calls[0].input.body));
    expect(body.To).toEqual([{ Email: message.email }]); expect(body.From.Email).toBe('school-access@cuevo.example.test');
    expect(body.Subject).toBe('Cuevo school invitation · دعوة المدرسة'); expect(body.Text).toContain(message.admissionUrl);
    expect(body.Text).toContain('Only continue if you expected'); expect(body.Text).toContain('تابع فقط');
    expect(body.Headers).toEqual({ 'X-Cuevo-Admission-Request': requestId });
  });
  it.each([{ mode: 'DISABLED', webOrigin: 'http://localhost:3000' }, { mode: 'LOCAL_SYNTHETIC', webOrigin: 'https://school.example' }, { mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000/' }])('refuses an unapproved capture configuration %j before network', config => {
    expect(() => createLocalAccountMail(config)).toThrow();
  });
  it.each([{ ...message, email: 'bad\r\nBcc:private@example.test' }, { ...message, requestId: 'bad' }, { ...message, admissionUrl: message.admissionUrl.replace('localhost:3000', 'other.example') }, { ...message, admissionUrl: message.admissionUrl + '&extra=secret' }, { ...message, expiresAt: '2000-01-01T00:00:00Z' }, { ...message, admissionUrl: 'http://localhost:3000/account/admission?token=secret' }])('refuses invalid or unapproved message %j without I/O', async input => {
    let calls = 0; const send = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' }, async () => { calls++; return new Response('{}'); });
    await expect(send(input)).rejects.toMatchObject({ code: 'ACCOUNT_DELIVERY_UNKNOWN' }); expect(calls).toBe(0);
  });
  it.each([{ status: 500, text: '{"private":"service-key"}' }, { status: 200, text: '{}' }, { status: 200, text: '{"ID":"bad"}' }, { status: 200, text: JSON.stringify({ ID: requestId, token: 'private-token' }) }, { status: 200, text: 'x'.repeat(2049) }])('does not acknowledge an unknown capture receipt %j', async result => {
    let calls = 0; const send = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' }, async () => { calls++; return new Response(result.text, { status: result.status, headers: { 'Content-Type': 'application/json' } }); });
    let failure: unknown; try { await send(message); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'ACCOUNT_DELIVERY_UNKNOWN' }); expect(String(failure)).not.toMatch(/private-token|service-key|provider-redemption/); expect(calls).toBe(1);
  });
  it('never repeats a network effect after timeout or starts one with an aborted signal', async () => {
    let calls = 0; const send = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' }, async () => { calls++; throw Error('private-token'); });
    await expect(send(message)).rejects.toMatchObject({ code: 'ACCOUNT_DELIVERY_UNKNOWN' }); expect(calls).toBe(1);
    const controller = new AbortController(); controller.abort();
    await expect(send({ ...message, signal: controller.signal })).rejects.toMatchObject({ code: 'ACCOUNT_DELIVERY_UNKNOWN' }); expect(calls).toBe(1);
  });
  it('cancels an oversized streamed capture response before reading the rest', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2049)); }, cancel() { cancelled = true; } });
    const send = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' }, async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(send(message)).rejects.toMatchObject({ code: 'ACCOUNT_DELIVERY_UNKNOWN' }); expect(cancelled).toBe(true);
  });
});
