import { schoolAccountRecoveryReceiptSchema } from '@cuevo/contracts';

export type RecoveryFragment = { id: string; type: 'recovery'; tokenHash: string; admissionSecret: string };
export type RecoveryReceipt = { id: string; schoolId: string; userId: string; status: 'AUTHORIZED' | 'COMPLETED'; revision: 1 };
export type RecoveryAuthPort = { verifyOtp(input: { token_hash: string; type: 'recovery' }): Promise<unknown>; getSession(): Promise<unknown>; getUser(token?: string): Promise<unknown>; updateUser(input: { password: string }): Promise<unknown>; signOut(input: { scope: 'global' }): Promise<unknown> };
export type RecoveryFailure = 'invalid-link' | 'confirmation-required' | 'verification-unknown' | 'expired-link' | 'session-changed' | 'outcome-unknown' | 'requires-review' | 'busy' | 'password-invalid' | 'password-unknown' | 'password-not-changed' | 'reconciliation-required' | 'completion-unknown' | 'signout-unknown' | 'unavailable';
export class RecoveryError extends Error { constructor(public readonly kind: RecoveryFailure) { super('Account recovery is not confirmed.'); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function data(value: unknown): Record<string, unknown> | null { return object(value) && value.error === null && object(value.data) ? value.data : null; }
function account(value: unknown): { id: string; email: string } | null {
  if (!object(value) || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.email !== 'string' || !value.email || value.is_anonymous !== false || typeof value.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(value.email_confirmed_at))) return null;
  return { id: value.id, email: value.email };
}
function session(value: unknown): { token: string; userId: string } | null {
  if (!object(value) || typeof value.access_token !== 'string' || !value.access_token || !object(value.user) || typeof value.user.id !== 'string' || !uuid.test(value.user.id)) return null;
  return { token: value.access_token, userId: value.user.id };
}
export function parseRecoveryFragment(hash: string): RecoveryFragment {
  if (!hash.startsWith('#') || hash.length > 16384 || /%(?![a-f0-9]{2})/i.test(hash)) throw new RecoveryError('invalid-link');
  const params = new URLSearchParams(hash.slice(1)); const keys = [...params.keys()];
  const id = params.get('id'); const tokenHash = params.get('token_hash'); const admissionSecret = params.get('admission_secret');
  if (keys.length !== 4 || new Set(keys).size !== 4 || keys.some(key => !['id', 'type', 'token_hash', 'admission_secret'].includes(key)) || !id || !uuid.test(id) || params.get('type') !== 'recovery' || !tokenHash || tokenHash.length > 4096 || /\s/u.test(tokenHash) || [...tokenHash].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || !admissionSecret || !/^[a-f0-9]{64}$/.test(admissionSecret)) throw new RecoveryError('invalid-link');
  return { id, type: 'recovery', tokenHash, admissionSecret };
}
/** Removes credentials before parsing; mount and hash changes never redeem a token. */
export function captureRecovery(location: { hash: string; pathname: string; search: string }, remove: (path: string) => void): RecoveryFragment {
  try { remove(location.pathname); } catch { throw new RecoveryError('invalid-link'); }
  if (location.pathname !== '/account/recovery' || location.search) throw new RecoveryError('invalid-link');
  return parseRecoveryFragment(location.hash);
}

/** Own-account recovery only. The API derives school/role and verifies password-change truth. */
export class RecoveryFlow {
  private fragment: RecoveryFragment;
  private key?: string;
  private verified: { id: string; email: string } | null = null;
  private attemptedVerification = false;
  private verificationFailure: RecoveryFailure = 'verification-unknown';
  private busy = false;
  private authorization: RecoveryReceipt | null = null;
  private passwordAttempted = false;
  private completed: RecoveryReceipt | null = null;
  signoutConfirmed = false;
  get completionConfirmed() { return this.completed !== null; }
  get canSetPassword() { return this.authorization !== null && !this.passwordAttempted && this.completed === null; }
  get needsReconciliation() { return this.authorization !== null && this.passwordAttempted && this.completed === null; }
  constructor(fragment: RecoveryFragment, private readonly ports: { auth: RecoveryAuthPort | null; apiUrl: string; commandKey?: string; fetch?: typeof fetch; isActive?: () => boolean }) { this.fragment = { ...fragment }; this.key = ports.commandKey; }
  private guard() { if (this.ports.isActive && !this.ports.isActive()) throw new RecoveryError('unavailable'); }
  private async currentAccount(): Promise<string> {
    this.guard(); if (!this.ports.auth || !this.verified) throw new RecoveryError('unavailable');
    try {
      const currentSession = session(data(await this.ports.auth.getSession())?.session); this.guard();
      if (!currentSession || currentSession.userId !== this.verified.id) throw new RecoveryError('session-changed');
      const currentUser = account(data(await this.ports.auth.getUser(currentSession.token))?.user); this.guard();
      if (!currentUser || currentUser.id !== this.verified.id || currentUser.email !== this.verified.email) throw new RecoveryError('session-changed');
      return currentSession.token;
    } catch (error) { throw error instanceof RecoveryError ? error : new RecoveryError('unavailable'); }
  }
  private async command(purpose: 'authorize' | 'complete'): Promise<RecoveryReceipt> {
    const token = await this.currentAccount(); this.guard(); this.key ??= crypto.randomUUID();
    const body = purpose === 'authorize' ? { id: this.fragment.id, admissionSecret: this.fragment.admissionSecret, confirmRecovery: true } : { id: this.fragment.id, confirmCompletion: true };
    let response: Response;
    try { response = await (this.ports.fetch ?? fetch)(`${this.ports.apiUrl.replace(/\/$/, '')}/v1/account/recovery/${purpose}`, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': this.key }, body: JSON.stringify(body) }); }
    catch { throw new RecoveryError(purpose === 'complete' ? 'completion-unknown' : 'outcome-unknown'); }
    this.guard();
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null); this.guard();
      if (purpose === 'complete' && response.status === 409 && object(failure) && failure.code === 'RECOVERY_PASSWORD_UNCHANGED') throw new RecoveryError('password-not-changed');
      throw new RecoveryError([400, 401, 403, 409, 410].includes(response.status) ? 'requires-review' : purpose === 'complete' ? 'completion-unknown' : 'outcome-unknown');
    }
    const payload: unknown = await response.json().catch(() => null); this.guard(); const parsed = schoolAccountRecoveryReceiptSchema.safeParse(payload);
    if (!parsed.success || parsed.data.id !== this.fragment.id || parsed.data.userId !== this.verified?.id || parsed.data.status !== (purpose === 'authorize' ? 'AUTHORIZED' : 'COMPLETED') || this.authorization && parsed.data.schoolId !== this.authorization.schoolId) throw new RecoveryError(purpose === 'complete' ? 'completion-unknown' : 'outcome-unknown');
    await this.currentAccount(); return parsed.data;
  }
  async continue(confirmed: boolean): Promise<RecoveryReceipt> {
    this.guard(); if (this.busy) throw new RecoveryError('busy'); if (!confirmed) throw new RecoveryError('confirmation-required');
    if (this.authorization) return this.authorization;
    if (!this.ports.auth || !this.ports.apiUrl) throw new RecoveryError('unavailable');
    this.busy = true;
    try {
      if (!this.verified) {
        if (this.attemptedVerification) throw new RecoveryError(this.verificationFailure);
        this.attemptedVerification = true; let result: unknown;
        try { result = await this.ports.auth.verifyOtp({ token_hash: this.fragment.tokenHash, type: 'recovery' }); } catch { throw new RecoveryError('verification-unknown'); }
        this.guard(); this.fragment.tokenHash = '';
        if (object(result) && object(result.error) && result.error.code === 'otp_expired') this.verificationFailure = 'expired-link';
        const verified = account(data(result)?.user); const currentSession = session(data(result)?.session);
        if (!verified || !currentSession || verified.id !== currentSession.userId) throw new RecoveryError(this.verificationFailure);
        this.verified = verified;
      }
      const receipt = await this.command('authorize'); this.authorization = receipt; this.fragment.admissionSecret = ''; return receipt;
    } finally { this.busy = false; }
  }
  private async finishPassword() {
    try { this.completed = await this.command('complete'); }
    catch (error) { if (error instanceof RecoveryError && error.kind === 'password-not-changed') this.passwordAttempted = false; throw error; }
  }
  async setPassword(password: string, confirmation: string): Promise<void> {
    this.guard(); if (this.busy) throw new RecoveryError('busy');
    if (!this.authorization || !this.ports.auth) throw new RecoveryError('confirmation-required');
    if (!this.canSetPassword) throw new RecoveryError('reconciliation-required');
    if (password.length < 12 || password.length > 128 || password !== confirmation) throw new RecoveryError('password-invalid');
    this.busy = true;
    try {
      await this.currentAccount(); this.guard(); this.passwordAttempted = true;
      let result: unknown; try { result = await this.ports.auth.updateUser({ password }); } catch { throw new RecoveryError('password-unknown'); }
      this.guard(); const updated = account(data(result)?.user);
      if (!updated || updated.id !== this.verified?.id || updated.email !== this.verified.email) throw new RecoveryError('password-unknown');
      await this.currentAccount(); await this.finishPassword();
    } finally { this.busy = false; }
  }
  async reconcileCompletion(): Promise<void> {
    this.guard(); if (this.busy) throw new RecoveryError('busy');
    if (!this.authorization || !this.passwordAttempted || this.completed) throw new RecoveryError('confirmation-required');
    this.busy = true; try { await this.finishPassword(); } finally { this.busy = false; }
  }
  async signOutAll(): Promise<void> {
    this.guard(); if (this.busy) throw new RecoveryError('busy');
    if (!this.completed || !this.ports.auth) throw new RecoveryError('confirmation-required');
    if (this.signoutConfirmed) return;
    this.busy = true;
    try {
      await this.currentAccount(); this.guard(); let result: unknown;
      try { result = await this.ports.auth.signOut({ scope: 'global' }); } catch { throw new RecoveryError('signout-unknown'); }
      this.guard(); if (!object(result) || result.error !== null) throw new RecoveryError('signout-unknown'); this.signoutConfirmed = true;
    } finally { this.busy = false; }
  }
}
