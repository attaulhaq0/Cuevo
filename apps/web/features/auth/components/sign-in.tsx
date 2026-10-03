'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { LanguageSwitch } from '../../../shared/components/language-switch';
import { useApp } from '../../../shared/session/providers';
import { authAr, authEn } from '../messages';
import { Brand } from '../../../shared/components/brand';
import { LearningLoop } from './learning-loop';
import background from '../assets/studio-background.webp';
import mobileBackground from '../assets/learning-background.webp';
import { studioSceneProperties } from '../studio-scene';

export function SignIn() {
  const { dictionary: t, signIn, status, locale } = useApp();
  const copy = locale === 'ar' ? authAr : authEn;
  const [tab, setTab] = useState<'sign-in' | 'help'>('sign-in');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'credentials' | 'unavailable' | null>(null);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget; const values = new FormData(form);
    setError(null); setPending(true);
    const result = await signIn(String(values.get('email') ?? '').trim(), String(values.get('password') ?? ''));
    const password = form.elements.namedItem('password'); if (password instanceof HTMLInputElement) password.value = '';
    setPending(false); setError(result);
  }
  const configured = status !== 'not-configured';
  return <div className="auth-page" data-design="learning-studio" style={{ ...studioSceneProperties(), '--auth-background-image': `url("${background.src}")`, '--auth-mobile-background-image': `url("${mobileBackground.src}")` } as CSSProperties}>
    <main id="main-content" className="auth-main" tabIndex={-1}>
      <header className="auth-header"><div className="auth-header__brand"><Brand /></div><div className="auth-language auth-copy--mobile"><LanguageSwitch expanded /></div></header>
      <section className="auth-story" aria-labelledby="learning-heading">
        <div className="auth-story__intro"><h1 id="learning-heading"><span className="auth-copy--desktop">{copy.headlineStart}<br />{copy.headlineAccent}</span><span className="auth-copy--mobile">{t.welcome}</span></h1><p><span className="auth-copy--desktop">{copy.intro}</span><span className="auth-copy--mobile">{t.signInBody}</span></p></div>
        <LearningLoop copy={copy} />
      </section>
      <div className="auth-side">
        <section className="auth-panel" aria-label={tab === 'sign-in' ? copy.signInTab : copy.helpTab}>
        <div className="auth-language auth-copy--desktop"><LanguageSwitch expanded /></div>
        <div className="auth-panel__intro"><h2 id="sign-in-heading">{tab === 'sign-in' ? t.welcome : copy.helpTitle}</h2><p>{tab === 'sign-in' ? t.signInBody : copy.helpBody}</p></div>
        <div className="auth-panel__tabs" role="tablist" aria-label={t.welcome} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || pending) return;
          event.preventDefault(); const next = event.key === 'Home' ? 'sign-in' : event.key === 'End' ? 'help' : tab === 'sign-in' ? 'help' : 'sign-in';
          setTab(next); document.getElementById(`auth-tab-${next}`)?.focus();
        }}>
          <button type="button" id="auth-tab-sign-in" role="tab" aria-selected={tab === 'sign-in'} aria-controls="auth-panel-content" tabIndex={tab === 'sign-in' ? 0 : -1} onClick={() => setTab('sign-in')}>{copy.signInTab}</button>
          <button type="button" id="auth-tab-help" role="tab" aria-selected={tab === 'help'} aria-controls="auth-panel-content" tabIndex={tab === 'help' ? 0 : -1} onClick={() => setTab('help')} disabled={pending}>{copy.helpTab}</button>
        </div>
        <div id="auth-panel-content" role="tabpanel" aria-labelledby={`auth-tab-${tab}`}>
        {tab === 'help' ? <div className="auth-account-help"><CuevoIcon name="help" size={32} /><div className="auth-copy--mobile"><h2>{copy.helpTitle}</h2><p>{copy.helpBody}</p></div><p>{copy.schoolAccount}</p><p>{copy.sharedDevice}</p><Button type="button" variant="secondary" onClick={() => setTab('sign-in')}>{t.returnSignIn}</Button></div> : configured ? <form onSubmit={onSubmit} className="auth-form" aria-busy={pending}>
          <div className="field"><label htmlFor="email">{t.email}</label><div className="auth-input"><CuevoIcon name="email" size={24} strokeWidth={2.1} /><input id="email" name="email" type="email" autoComplete="username" placeholder={t.emailPlaceholder} required dir="ltr" disabled={pending} aria-invalid={error === 'credentials'} aria-describedby={error ? 'sign-in-error' : undefined} /></div></div>
          <div className="field"><label htmlFor="password">{t.password}</label><div className="auth-input auth-input--password"><CuevoIcon name="lock" size={24} strokeWidth={2.1} /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder={copy.passwordPlaceholder} required disabled={pending} dir="ltr" aria-invalid={error === 'credentials'} aria-describedby={error ? 'sign-in-error' : undefined} /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword}><CuevoIcon name={showPassword ? 'eyeOff' : 'eye'} size={22} strokeWidth={2.1} /></button></div><button type="button" className="auth-password-help" onClick={() => setTab('help')} disabled={pending}>{copy.helpAction}</button></div>
          {error ? <p id="sign-in-error" className="form-error" role="alert">{error === 'credentials' ? t.invalidCredentials : t.authUnavailable}</p> : null}
          <Button type="submit" disabled={pending} className="auth-submit"><span>{pending ? t.signingIn : t.signIn}</span><CuevoIcon name="arrow" size={24} strokeWidth={2.2} className="directional-icon" /></Button>
          <p className="auth-device-note"><CuevoIcon name="device" size={19} />{copy.sharedDevice}</p>
          <button type="button" className="auth-help-link" onClick={() => setTab('help')} disabled={pending} aria-label={`${t.helpTitle} ${copy.contactSchool}`}><span>{t.helpTitle}</span> {copy.contactSchool}</button>
        </form> : <div className="notice notice--warning" role="status"><h3>{t.configurationTitle}</h3><p>{t.configurationBody}</p></div>}
        </div>
        <footer className="auth-footer"><details className="auth-privacy"><summary><CuevoIcon name="shield" size={19} /><span>{copy.privacyTitle}</span><CuevoIcon name="chevron" size={20} className="auth-privacy__chevron" /></summary><p>{copy.privacyBody}</p><p>{copy.privacyEnvironment}</p></details></footer>
        </section>
      </div>
    </main>
  </div>;
}
