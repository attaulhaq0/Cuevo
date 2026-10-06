import { schoolAccountClaimReceiptSchema, type SchoolAccountClaimReceipt } from '@cuevo/contracts';

export type AdmissionFragment = { id: string; type: 'invite'; tokenHash: string; admissionSecret: string };
export type AdmissionAuthPort = { verifyOtp(input: { token_hash: string; type: 'invite' }): Promise<unknown>; getSession(): Promise<unknown>; getUser(token?: string): Promise<unknown>; updateUser(input: { password: string }): Promise<unknown> };
export type AdmissionFailure = 'invalid-link' | 'confirmation-required' | 'verification-unknown' | 'expired-link' | 'session-changed' | 'outcome-unknown' | 'requires-review' | 'busy' | 'password-invalid' | 'password-unknown' | 'unavailable';
export class AdmissionError extends Error { constructor(public readonly kind: AdmissionFailure) { super('Admission is not confirmed.'); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function data(value: unknown): Record<string, unknown> | null { return object(value) && value.error === null && object(value.data) ? value.data : null; }
function confirmedUser(value: unknown): { id: string; email: string } | null {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.email !== 'string' || !value.email || value.is_anonymous !== false || typeof value.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(value.email_confirmed_at))) return null;
  return { id: value.id, email: value.email };
}
function sessionAccount(value: unknown): { token: string; userId: string } | null {
  if (!object(value) || typeof value.access_token !== 'string' || !value.access_token || !object(value.user) || typeof value.user.id !== 'string' || !uuid.test(value.user.id)) return null;
  return { token: value.access_token, userId: value.user.id };
}
export function parseAdmissionFragment(hash: string): AdmissionFragment {
  if (!hash.startsWith('#') || hash.length > 16384 || /%(?![a-f0-9]{2})/i.test(hash)) throw new AdmissionError('invalid-link');
  const params = new URLSearchParams(hash.slice(1)); const keys = [...params.keys()];
  const id = params.get('id'); const tokenHash = params.get('token_hash'); const admissionSecret = params.get('admission_secret');
  if (keys.length !== 4 || new Set(keys).size !== 4 || keys.some(key => !['id', 'type', 'token_hash', 'admission_secret'].includes(key)) || !id || !uuid.test(id) || params.get('type') !== 'invite' || !tokenHash || tokenHash.length > 4096 || /\s/u.test(tokenHash) || [...tokenHash].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || !admissionSecret || !/^[a-f0-9]{64}$/.test(admissionSecret)) throw new AdmissionError('invalid-link');
  return { id, type: 'invite', tokenHash, admissionSecret };
}
/** Strip credentials before parsing. The caller supplies only browser history replacement. */
export function captureAdmission(location: { hash: string; pathname: string; search: string }, remove: (path: string) => void): AdmissionFragment {
  try { remove(location.pathname); } catch { throw new AdmissionError('invalid-link'); }
  if (location.pathname !== '/account/admission' || location.search) throw new AdmissionError('invalid-link');
  return parseAdmissionFragment(location.hash);
}

/** Deliberate own-account continuation. No constructor, GET or retry redeems a token. */
export class AdmissionFlow {
  private invitation: AdmissionFragment;
  private key?: string;
  private verified: { id: string; email: string } | null = null;
  private verificationAttempted = false;
  private verificationFailure: AdmissionFailure = 'verification-unknown';
  private busy = false;
  private receipt: SchoolAccountClaimReceipt | null = null;
  passwordConfirmed = false;
  constructor(invitation: AdmissionFragment, private readonly ports: { auth: AdmissionAuthPort | null; apiUrl: string; commandKey?: string; fetch?: typeof fetch; isActive?: () => boolean }) { this.invitation = { ...invitation }; this.key = ports.commandKey; }
  private guard() { if (this.ports.isActive && !this.ports.isActive()) throw new AdmissionError('unavailable'); }
  private async currentAccount(): Promise<string> {
    this.guard();
    if (!this.ports.auth || !this.verified) throw new AdmissionError('unavailable');
    try {
      const session = sessionAccount(data(await this.ports.auth.getSession())?.session);
      this.guard();
      if (!session || session.userId !== this.verified.id) throw new AdmissionError('session-changed');
      const user = confirmedUser(data(await this.ports.auth.getUser(session.token))?.user);
      this.guard();
      if (!user || user.id !== this.verified.id || user.email !== this.verified.email) throw new AdmissionError('session-changed');
      return session.token;
    } catch (error) { throw error instanceof AdmissionError ? error : new AdmissionError('unavailable'); }
  }
  async continue(confirmed: boolean): Promise<SchoolAccountClaimReceipt> {
    this.guard();
    if (this.busy) throw new AdmissionError('busy');
    if (!confirmed) throw new AdmissionError('confirmation-required');
    if (this.receipt) return this.receipt;
    if (!this.ports.auth || !this.ports.apiUrl) throw new AdmissionError('unavailable');
    this.busy = true;
    try {
      if (!this.verified) {
        if (this.verificationAttempted) throw new AdmissionError(this.verificationFailure);
        this.verificationAttempted = true;
        let result: unknown;
        try { result = await this.ports.auth.verifyOtp({ token_hash: this.invitation.tokenHash, type: 'invite' }); }
        catch { throw new AdmissionError('verification-unknown'); }
        this.guard();
        if (object(result) && object(result.error) && result.error.code === 'otp_expired') this.verificationFailure = 'expired-link';
        const verified = confirmedUser(data(result)?.user); const session = sessionAccount(data(result)?.session);
        if (!verified || !session || session.userId !== verified.id) throw new AdmissionError(this.verificationFailure);
        this.verified = verified;
        this.invitation.tokenHash = '';
      }
      const accessToken = await this.currentAccount();
      this.guard();
      this.key ??= crypto.randomUUID();
      let response: Response;
      try {
        response = await (this.ports.fetch ?? fetch)(`${this.ports.apiUrl.replace(/\/$/, '')}/v1/account/school-admission/claim`, {
          method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': this.key },
          body: JSON.stringify({ id: this.invitation.id, admissionSecret: this.invitation.admissionSecret, confirmAdmission: true }),
        });
      } catch { throw new AdmissionError('outcome-unknown'); }
      this.guard();
      if (!response.ok) throw new AdmissionError([400, 401, 403, 409, 410].includes(response.status) ? 'requires-review' : 'outcome-unknown');
      const payload: unknown = await response.json().catch(() => null); const parsed = schoolAccountClaimReceiptSchema.safeParse(payload);
      this.guard();
      if (!parsed.success || parsed.data.id !== this.invitation.id || parsed.data.userId !== this.verified.id) throw new AdmissionError('outcome-unknown');
      await this.currentAccount();
      this.receipt = parsed.data; this.invitation.admissionSecret = ''; return parsed.data;
    } finally { this.busy = false; }
  }
  async setPassword(password: string, confirmation: string): Promise<void> {
    this.guard();
    if (this.busy) throw new AdmissionError('busy');
    if (!this.receipt || !this.ports.auth) throw new AdmissionError('confirmation-required');
    if (password.length < 12 || password.length > 128 || password !== confirmation) throw new AdmissionError('password-invalid');
    this.busy = true;
    try {
      await this.currentAccount(); let result: unknown;
      this.guard();
      try { result = await this.ports.auth.updateUser({ password }); } catch { throw new AdmissionError('password-unknown'); }
      this.guard();
      const user = confirmedUser(data(result)?.user);
      if (!user || user.id !== this.verified?.id || user.email !== this.verified.email) throw new AdmissionError('password-unknown');
      await this.currentAccount(); this.passwordConfirmed = true;
    } finally { this.busy = false; }
  }
}
