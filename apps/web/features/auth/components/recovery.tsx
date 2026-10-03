'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { useRouter } from 'next/navigation';
import type { Locale } from '../../../shared/i18n/locale';
import { Brand } from '../../../shared/components/brand';
import { LanguageSwitch } from '../../../shared/components/language-switch';
import { useApp } from '../../../shared/session/providers';
import { createAuthClient } from '../../../shared/session/supabase';
import { captureRecovery, RecoveryError, RecoveryFlow, type RecoveryFailure } from '../recovery';
import { recoveryCopy, recoveryFailureCopy } from '../recovery-copy';

export type RecoveryView = { stage: 'loading' | 'ready' | 'pending' | 'error' | 'authorized' | 'password-pending' | 'reconcile' | 'password-confirmed' | 'signout-pending' | 'complete' | 'declined'; failure?: RecoveryFailure };
export function AccountRecovery({ returnToSignIn }: { returnToSignIn(): void }) {
  const { locale, dictionary, publicConfig, online, refreshAccess, holdMembershipVerification } = useApp();
  const [view, setView] = useState<RecoveryView>({ stage: 'loading' }); const [confirmed, setConfirmed] = useState(false);
  const flow = useRef<RecoveryFlow | null>(null); const initialized = useRef(false); const pending = useRef(false); const mounted = useRef(false);
  const connected = useRef(online); connected.current = online;
  useEffect(() => {
    mounted.current = true; const release = holdMembershipVerification();
    if (!initialized.current) {
      initialized.current = true;
      try {
        const recovery = captureRecovery({ hash: window.location.hash, pathname: window.location.pathname, search: window.location.search }, path => window.history.replaceState(null, '', path));
        const client = createAuthClient(publicConfig);
        flow.current = new RecoveryFlow(recovery, { auth: client ? { verifyOtp: input => client.auth.verifyOtp(input), getSession: () => client.auth.getSession(), getUser: token => client.auth.getUser(token), updateUser: input => client.auth.updateUser(input), signOut: input => client.auth.signOut(input) } : null, apiUrl: publicConfig.apiUrl, isActive: () => mounted.current && connected.current });
        setView({ stage: 'ready' });
      } catch { setView({ stage: 'error', failure: 'invalid-link' }); }
    }
    return () => { mounted.current = false; release(); };
  }, [publicConfig, holdMembershipVerification]);
  useEffect(() => {
    const removeChangedFragment = () => { if (window.location.hash) window.history.replaceState(null, '', window.location.pathname); };
    window.addEventListener('hashchange', removeChangedFragment); return () => window.removeEventListener('hashchange', removeChangedFragment);
  }, []);
  async function authorize() {
    if (!flow.current || pending.current || !online) return; pending.current = true; setView({ stage: 'pending' });
    try { await flow.current.continue(confirmed); if (mounted.current) setView({ stage: 'authorized' }); }
    catch (error) { if (mounted.current) setView({ stage: 'error', failure: error instanceof RecoveryError ? error.kind : 'outcome-unknown' }); }
    finally { pending.current = false; }
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!flow.current || pending.current || !online) return;
    const form = event.currentTarget; const values = new FormData(form); pending.current = true; setView({ stage: 'password-pending' });
    try { await flow.current.setPassword(String(values.get('password') ?? ''), String(values.get('confirmPassword') ?? '')); if (mounted.current) setView({ stage: 'password-confirmed' }); }
    catch (error) { if (mounted.current) setView({ stage: flow.current.canSetPassword ? 'authorized' : 'reconcile', failure: error instanceof RecoveryError ? error.kind : 'password-unknown' }); }
    finally { form.reset(); pending.current = false; }
  }
  async function reconcile() {
    if (!flow.current || pending.current || !online) return; pending.current = true; setView({ stage: 'password-pending' });
    try { await flow.current.reconcileCompletion(); if (mounted.current) setView({ stage: 'password-confirmed' }); }
    catch (error) { if (mounted.current) setView({ stage: flow.current.canSetPassword ? 'authorized' : 'reconcile', failure: error instanceof RecoveryError ? error.kind : 'completion-unknown' }); }
    finally { pending.current = false; }
  }
  async function signOut() {
    if (!flow.current || pending.current || !online) return; pending.current = true; setView({ stage: 'signout-pending' });
    try { await flow.current.signOutAll(); if (mounted.current) { refreshAccess(); setView({ stage: 'complete' }); } }
    catch (error) { if (mounted.current) setView({ stage: 'password-confirmed', failure: error instanceof RecoveryError ? error.kind : 'signout-unknown' }); }
    finally { pending.current = false; }
  }
  const t = recoveryCopy(locale);
  return <div className="sign-in-page"><header className="public-header"><Brand /><LanguageSwitch /></header><main id="main-content" className="sign-in-main" tabIndex={-1}><section className="sign-in-story" aria-labelledby="recovery-heading"><p className="eyebrow">{t.title}</p><h1 id="recovery-heading">{t.introduction}</h1><p className="sign-in-story__body">{t.body}</p><p className="session-safety"><ShieldCheck size={18} aria-hidden="true" />{t.safety}</p></section><RecoveryPanel view={view} locale={locale} online={online} confirmed={confirmed} onConfirmed={setConfirmed} onContinue={() => void authorize()} onPassword={event => void password(event)} onReconcile={() => void reconcile()} onSignOut={() => void signOut()} onReturn={() => { if (flow.current?.signoutConfirmed) returnToSignIn(); }} onDecline={() => { if (!pending.current) { flow.current = null; setView({ stage: 'declined' }); } }} /></main><footer className="public-footer"><span>{dictionary.company}</span><span>{dictionary.foundation}</span></footer></div>;
}
export function AccountRecoveryRoute() { const router = useRouter(); return <AccountRecovery returnToSignIn={() => router.push('/')} />; }

export function RecoveryPanel({ view, locale, online, confirmed, onConfirmed, onContinue, onPassword, onReconcile, onSignOut, onReturn, onDecline }: { view: RecoveryView; locale: Locale; online: boolean; confirmed: boolean; onConfirmed(value: boolean): void; onContinue(): void; onPassword(event: FormEvent<HTMLFormElement>): void; onReconcile(): void; onSignOut(): void; onReturn(): void; onDecline(): void }) {
  const t = recoveryCopy(locale); const busy = ['pending', 'password-pending', 'signout-pending'].includes(view.stage);
  const authorized = ['authorized', 'password-pending', 'reconcile', 'password-confirmed', 'signout-pending'].includes(view.stage);
  const continueAllowed = view.stage === 'ready' || view.stage === 'error' && ['outcome-unknown', 'unavailable', 'confirmation-required'].includes(view.failure ?? 'invalid-link');
  return <section className="sign-in-panel" aria-labelledby="recovery-panel-heading" aria-busy={busy}><div className="sign-in-panel__heading"><h2 id="recovery-panel-heading">{view.stage === 'complete' ? t.finished : view.stage === 'declined' ? t.declined : authorized ? t.authorized : t.title}</h2><p>{view.stage === 'complete' ? t.finishedBody : view.stage === 'declined' ? t.declinedBody : authorized ? t.authorizedBody : t.body}</p></div>
    {view.stage === 'loading' ? <p role="status">{t.loading}</p> : null}{view.stage === 'pending' ? <p role="status">{t.checking}</p> : null}{view.stage === 'password-pending' ? <p role="status">{t.saving}</p> : null}{view.stage === 'signout-pending' ? <p role="status">{t.signingOut}</p> : null}
    {!online ? <p className="notice notice--warning" role="status">{t.offline}</p> : null}{view.failure ? <p id="recovery-error" className="form-error" role="alert">{recoveryFailureCopy(locale, view.failure)}</p> : null}
    {continueAllowed ? <form className="sign-in-form" onSubmit={event => { event.preventDefault(); onContinue(); }}><label className="admission-confirmation"><input type="checkbox" checked={confirmed} onChange={event => onConfirmed(event.target.checked)} aria-describedby="recovery-panel-heading" /><span>{t.confirmation}</span></label><Button type="submit" disabled={!confirmed || !online}>{view.failure === 'outcome-unknown' ? t.retry : t.continue}<ArrowRight className="directional-icon" size={18} aria-hidden="true" /></Button><Button type="button" variant="quiet" onClick={onDecline}>{t.decline}</Button></form> : null}
    {view.stage === 'authorized' ? <form className="sign-in-form" onSubmit={onPassword}><h3>{t.passwordTitle}</h3><p id="recovery-password-hint">{t.passwordHint}</p><div className="field"><label htmlFor="recovery-password">{t.password}</label><input id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={!online} dir="ltr" aria-invalid={view.failure === 'password-invalid'} aria-describedby={`recovery-password-hint${view.failure ? ' recovery-error' : ''}`} /></div><div className="field"><label htmlFor="recovery-confirm-password">{t.confirmPassword}</label><input id="recovery-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={!online} dir="ltr" aria-invalid={view.failure === 'password-invalid'} aria-describedby={`recovery-password-hint${view.failure ? ' recovery-error' : ''}`} /></div><Button type="submit" disabled={!online}>{t.passwordSave}</Button></form> : null}
    {view.stage === 'reconcile' ? <Button type="button" onClick={onReconcile} disabled={!online}>{t.checkPassword}</Button> : null}
    {view.stage === 'password-confirmed' || view.stage === 'signout-pending' ? <div className="sign-in-form"><p role="status"><strong>{t.passwordSaved}</strong> {t.passwordSavedBody}</p><Button type="button" onClick={onSignOut} disabled={busy || !online}>{t.signOutAll}</Button></div> : null}
    {view.stage === 'complete' ? <Button type="button" onClick={onReturn} disabled={!online}>{t.returnToSignIn}<ArrowRight className="directional-icon" size={18} aria-hidden="true" /></Button> : null}
    <div className="sign-in-help"><p>{t.contact}</p></div>
  </section>;
}
