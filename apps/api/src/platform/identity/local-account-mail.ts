import { DomainError } from '@cuevo/domain';
import { z } from 'zod';

const configSchema = z.object({ mode: z.literal('LOCAL_SYNTHETIC'), webOrigin: z.enum(['http://localhost:3000', 'http://127.0.0.1:3000']) }).strict();
const messageSchema = z.object({ requestId: z.uuid(), email: z.email().max(254), admissionUrl: z.string().max(8192), expiresAt: z.iso.datetime({ offset: true }) }).strict();
const captureReceipt = z.object({ ID: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) }).strict();
type InvitationMessage = z.infer<typeof messageSchema> & { signal: AbortSignal };
const unknown = () => new DomainError('ACCOUNT_DELIVERY_UNKNOWN', 503, 'Invitation delivery could not be confirmed. Review the original invitation.');

/** Fixed local Mailpit capture only. No remote SMTP, retry or school authority. */
export function createLocalAccountMail(input: unknown, transport: typeof fetch = fetch): (message: InvitationMessage) => Promise<{ state: 'ACCEPTED' }> {
  const config = configSchema.safeParse(input);
  if (!config.success) throw new DomainError('ACCOUNT_DELIVERY_UNAVAILABLE', 503, 'Local invitation capture is unavailable.');
  return async message => {
    const parsed = messageSchema.safeParse({ requestId: message.requestId, email: message.email, admissionUrl: message.admissionUrl, expiresAt: message.expiresAt });
    if (!parsed.success || !(message.signal instanceof AbortSignal) || message.signal.aborted || Date.parse(parsed.data.expiresAt) <= Date.now()) throw unknown();
    try {
      const link = new URL(parsed.data.admissionUrl); const values = new URLSearchParams(link.hash.slice(1)); const keys = [...values.keys()];
      const purpose = values.get('type'); const recovery = purpose === 'recovery';
      if (link.origin !== config.data.webOrigin || link.pathname !== (recovery ? '/account/recovery' : '/account/admission') || link.username || link.password || link.search || keys.length !== 4 || new Set(keys).size !== 4 || keys.some(key => !['id', 'type', 'token_hash', 'admission_secret'].includes(key)) || values.get('id') !== parsed.data.requestId || !['invite', 'recovery'].includes(purpose ?? '') || !values.get('token_hash') || values.get('token_hash')!.length > 4096 || !/^[a-f0-9]{64}$/.test(values.get('admission_secret') ?? '')) throw unknown();
      const body = {
        From: { Email: 'school-access@cuevo.example.test', Name: 'Cuevo' }, To: [{ Email: parsed.data.email }],
        Subject: recovery ? 'Cuevo account recovery · استعادة الحساب' : 'Cuevo school invitation · دعوة المدرسة',
        Text: recovery ? `Your school approved account recovery. Only continue if you expected this recovery request. Recovery changes your password and does not change your school access.\n\nوافقت مدرستك على استعادة الحساب. تابع فقط إذا كنت تتوقع طلب الاستعادة. تغيّر الاستعادة كلمة المرور ولا تغيّر صلاحيات المدرسة.\n\n${parsed.data.admissionUrl}\n\nSchool approval expires at ${parsed.data.expiresAt}. The verification link may expire sooner.\nتنتهي موافقة المدرسة في ${parsed.data.expiresAt}. قد تنتهي صلاحية رابط التحقق قبل ذلك.` : `A school administrator has invited you to Cuevo. Only continue if you expected this invitation. Your school role is granted after you confirm this account and the approved invitation.\n\nدعاك مسؤول مدرسة إلى كويفو. تابع فقط إذا كنت تتوقع هذه الدعوة. تُمنح صلاحية المدرسة بعد تأكيد هذا الحساب والدعوة المعتمدة.\n\n${parsed.data.admissionUrl}\n\nThis invitation expires at ${parsed.data.expiresAt}.\nتنتهي هذه الدعوة في ${parsed.data.expiresAt}.`,
        Headers: { 'X-Cuevo-Admission-Request': parsed.data.requestId },
      };
      const signal = AbortSignal.any([message.signal, AbortSignal.timeout(5000)]);
      const response = await transport('http://127.0.0.1:56324/api/v1/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal });
      if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json') || Number(response.headers.get('Content-Length')) > 2048) throw unknown();
      if (!response.body) throw unknown();
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 2048 || signal.aborted) throw unknown(); chunks.push(chunk.value); }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const buffer = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      if (!captureReceipt.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))).success || signal.aborted) throw unknown();
      return { state: 'ACCEPTED' };
    } catch { throw unknown(); }
  };
}
