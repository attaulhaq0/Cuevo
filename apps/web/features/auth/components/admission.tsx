'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useRouter } from 'next/navigation';
import type { Locale } from '../../../shared/i18n/locale';
import { Brand } from '../../../shared/components/brand';
import { LanguageSwitch } from '../../../shared/components/language-switch';
import { useApp } from '../../../shared/session/providers';
import { createAuthClient } from '../../../shared/session/supabase';
import { AdmissionError, AdmissionFlow, captureAdmission, type AdmissionFailure } from '../admission';
import { admissionCopy, admissionFailureCopy } from '../admission-copy';
export type AdmissionView = { stage: 'loading' | 'ready' | 'pending' | 'error' | 'accepted' | 'password-pending' | 'complete' | 'declined'; failure?: AdmissionFailure; role?: 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent' };
export function AccountAdmission({ openWorkspace }: { openWorkspace: () => void }) {
  const { locale, dictionary, publicConfig, online, refreshAccess, holdMembershipVerification } = useApp();
  const [view, setView] = useState<AdmissionView>({ stage: 'loading' }); const [confirmed, setConfirmed] = useState(false);
  const flow = useRef<AdmissionFlow | null>(null); const initialized = useRef(false); const pending = useRef(false); const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const release = holdMembershipVerification();
    if (!initialized.current) {
      initialized.current = true;
      try {
        const invitation = captureAdmission({ hash: window.location.hash, pathname: window.location.pathname, search: window.location.search }, path => window.history.replaceState(null, '', path));
        const client = createAuthClient(publicConfig);
        flow.current = new AdmissionFlow(invitation, { auth: client ? { verifyOtp: input => client.auth.verifyOtp(input), getSession: () => client.auth.getSession(), getUser: token => client.auth.getUser(token), updateUser: input => client.auth.updateUser(input) } : null, apiUrl: publicConfig.apiUrl, isActive: () => mounted.current });
        setView({ stage: 'ready' });
      } catch { setView({ stage: 'error', failure: 'invalid-link' }); }
    }
    return () => { mounted.current = false; release(); };
  }, [publicConfig, holdMembershipVerification]);
  useEffect(() => {
    const clearChangedFragment = () => { if (window.location.hash) window.history.replaceState(null, '', window.location.pathname); };
    window.addEventListener('hashchange', clearChangedFragment);
    return () => window.removeEventListener('hashchange', clearChangedFragment);
  }, []);
  async function accept() {
    if (pending.current || !flow.current || !online) return; pending.current = true; setView({ stage: 'pending' });
    try { const receipt = await flow.current.continue(confirmed); if (mounted.current) { setView({ stage: 'accepted', role: receipt.role }); refreshAccess(); } }
    catch (error) { if (mounted.current) setView({ stage: 'error', failure: error instanceof AdmissionError ? error.kind : 'outcome-unknown' }); }
    finally { pending.current = false; }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || !flow.current || !online) return;
    const form = event.currentTarget; const values = new FormData(form); pending.current = true; setView(current => ({ ...current, stage: 'password-pending', failure: undefined }));
    try { await flow.current.setPassword(String(values.get('password') ?? ''), String(values.get('confirmPassword') ?? '')); if (mounted.current) setView(current => ({ ...current, stage: 'complete', failure: undefined })); }
    catch (error) { if (mounted.current) setView(current => ({ ...current, stage: 'accepted', failure: error instanceof AdmissionError ? error.kind : 'password-unknown' })); }
    finally { form.reset(); pending.current = false; }
  }
  return <div className="sign-in-page">
    <header className="public-header"><Brand /><LanguageSwitch /></header>
    <main id="main-content" className="sign-in-main" tabIndex={-1}>
      <section className="sign-in-story" aria-labelledby="admission-heading"><p className="eyebrow">{admissionCopy(locale).title}</p><h1 id="admission-heading">{admissionCopy(locale).introduction}</h1><p className="sign-in-story__body">{admissionCopy(locale).body}</p><p className="session-safety"><CuevoIcon name="shield" size={18} />{admissionCopy(locale).safety}</p></section>
      <AdmissionPanel view={view} locale={locale} online={online} confirmed={confirmed} onConfirmed={setConfirmed} onContinue={() => void accept()} onPassword={event => void savePassword(event)} onOpen={() => { if (flow.current?.passwordConfirmed) { refreshAccess(); openWorkspace(); } }} onDecline={() => { if (!pending.current) { flow.current = null; setView({ stage: 'declined' }); } }} />
    </main>
    <footer className="public-footer"><span>{dictionary.company}</span><span>{dictionary.foundation}</span></footer>
  </div>;
}
export function AccountAdmissionRoute() { const router = useRouter(); return <AccountAdmission openWorkspace={() => router.push('/')} />; }
export function AdmissionPanel({ view, locale, online, confirmed, onConfirmed, onContinue, onPassword, onOpen, onDecline }: { view: AdmissionView; locale: Locale; online: boolean; confirmed: boolean; onConfirmed(value: boolean): void; onContinue(): void; onPassword(event: FormEvent<HTMLFormElement>): void; onOpen(): void; onDecline(): void }) {
  const t = admissionCopy(locale); const accepted = ['accepted', 'password-pending', 'complete'].includes(view.stage); const busy = view.stage === 'pending' || view.stage === 'password-pending';
  const canContinue = view.stage === 'ready' || view.stage === 'error' && ['outcome-unknown', 'unavailable', 'confirmation-required'].includes(view.failure ?? 'invalid-link');
  return <section className="sign-in-panel" aria-labelledby="admission-panel-heading" aria-busy={busy}>
    <div className="sign-in-panel__heading"><h2 id="admission-panel-heading">{accepted ? t.accepted : view.stage === 'declined' ? t.declined : t.title}</h2><p>{accepted ? t.acceptedBody : view.stage === 'declined' ? t.declinedBody : t.body}</p></div>
    {view.stage === 'loading' ? <p role="status">{t.loading}</p> : null}
    {view.stage === 'pending' ? <p role="status">{t.checking}</p> : null}
    {!online ? <p className="notice notice--warning" role="status">{t.offline}</p> : null}
    {view.failure ? <p id="admission-error" className="form-error" role="alert">{admissionFailureCopy(locale, view.failure)}</p> : null}
    {canContinue ? <form className="sign-in-form" onSubmit={event => { event.preventDefault(); onContinue(); }}>
      <label className="admission-confirmation"><input type="checkbox" checked={confirmed} onChange={event => onConfirmed(event.target.checked)} aria-describedby="admission-panel-heading" /> <span>{t.confirmation}</span></label>
      <Button type="submit" disabled={!confirmed || !online}>{view.stage === 'error' && view.failure === 'outcome-unknown' ? t.retry : t.continue}<CuevoIcon name="arrow" className="directional-icon" size={18} /></Button>
      <Button type="button" variant="quiet" onClick={onDecline}>{t.decline}</Button>
    </form> : null}
    {accepted ? <p><strong>{t.role}: </strong>{view.role ? t.roles[view.role] : t.unknownRole}</p> : null}
    {view.stage === 'accepted' || view.stage === 'password-pending' ? <form className="sign-in-form" onSubmit={onPassword} aria-busy={busy}>
      <h3>{t.passwordTitle}</h3><p id="admission-password-hint">{t.passwordHint}</p>
      <div className="field"><label htmlFor="admission-password">{t.password}</label><input id="admission-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy || !online} dir="ltr" aria-invalid={view.failure === 'password-invalid'} aria-describedby={`admission-password-hint${view.failure ? ' admission-error' : ''}`} /></div>
      <div className="field"><label htmlFor="admission-confirm-password">{t.confirmPassword}</label><input id="admission-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy || !online} dir="ltr" aria-invalid={view.failure === 'password-invalid'} aria-describedby={`admission-password-hint${view.failure ? ' admission-error' : ''}`} /></div>
      <Button type="submit" disabled={busy || !online}>{busy ? t.passwordSaving : t.passwordSave}</Button>
    </form> : null}
    {view.stage === 'complete' ? <div className="sign-in-form"><p role="status"><strong>{t.passwordSaved}</strong> {t.passwordSavedBody}</p><Button type="button" onClick={onOpen} disabled={!online}>{t.open}<CuevoIcon name="arrow" className="directional-icon" size={18} /></Button></div> : null}
    <div className="sign-in-help"><p>{t.contact}</p></div>
  </section>;
}
