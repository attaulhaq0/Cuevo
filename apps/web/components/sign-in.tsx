'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, BookOpen, ShieldCheck, ListChecks, LockKeyhole } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { Brand } from './brand';
import { LanguageSwitch } from './language-switch';
import { useApp } from './providers';

export function SignIn() {
  const { dictionary: t, signIn, status } = useApp();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'credentials' | 'unavailable' | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setError(null);
    setPending(true);
    const result = await signIn(String(values.get('email') ?? '').trim(), String(values.get('password') ?? ''));
    const passwordInput = form.elements.namedItem('password');
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
    setPending(false);
    setError(result);
  }

  const configured = status !== 'not-configured';
  const promises = [
    { Icon: BookOpen, title: t.promiseOne, body: t.promiseOneBody },
    { Icon: ListChecks, title: t.promiseTwo, body: t.promiseTwoBody },
    { Icon: ShieldCheck, title: t.promiseThree, body: t.promiseThreeBody },
  ];

  return <div className="sign-in-page">
    <header className="public-header"><Brand /><LanguageSwitch /></header>
    <main id="main-content" className="sign-in-main" tabIndex={-1}>
      <section className="sign-in-story" aria-labelledby="learning-heading">
        <p className="eyebrow">{t.tagline}</p>
        <h1 id="learning-heading">{t.introduction}</h1>
        <p className="sign-in-story__body">{t.introductionBody}</p>
        <ul className="promise-list">{promises.map(({ Icon, title, body }) => <li key={title}>
          <span className="promise-list__icon"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
          <div><h2>{title}</h2><p>{body}</p></div>
        </li>)}</ul>
      </section>
      <section className="sign-in-panel" aria-labelledby="sign-in-heading">
        <div className="sign-in-panel__heading">
          <span className="eyebrow"><LockKeyhole size={14} aria-hidden="true" />{t.schoolWorkspace}</span>
          <h2 id="sign-in-heading">{t.welcome}</h2>
          <p>{t.signInBody}</p>
        </div>
        {configured ? <form onSubmit={onSubmit} className="sign-in-form" aria-busy={pending}>
          <div className="field">
            <label htmlFor="email">{t.email}</label>
            <input id="email" name="email" type="email" autoComplete="username" placeholder={t.emailPlaceholder} required dir="ltr" disabled={pending} aria-invalid={error === 'credentials'} aria-describedby={error ? 'sign-in-error' : undefined} />
          </div>
          <div className="field">
            <label htmlFor="password">{t.password}</label>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={pending} dir="ltr" aria-invalid={error === 'credentials'} aria-describedby={error ? 'sign-in-error' : undefined} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>
          {error ? <p id="sign-in-error" className="form-error" role="alert">{error === 'credentials' ? t.invalidCredentials : t.authUnavailable}</p> : null}
          <Button type="submit" disabled={pending} className="sign-in-submit">{pending ? t.signingIn : t.signIn}<ArrowRight size={18} className="directional-icon" aria-hidden="true" /></Button>
        </form> : <div className="notice notice--warning" role="status"><h3>{t.configurationTitle}</h3><p>{t.configurationBody}</p></div>}
        <div className="sign-in-help"><h3>{t.helpTitle}</h3><p>{t.helpBody}</p></div>
        <p className="session-safety"><ShieldCheck size={15} aria-hidden="true" />{t.safeSession}</p>
      </section>
    </main>
    <footer className="public-footer"><span>{t.company}</span><span>{t.foundation}</span></footer>
  </div>;
}
