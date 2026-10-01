'use client';

import { useState } from 'react';
import { ShieldAlert, WifiOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { Brand } from '../../../shared/components/brand';
import { LanguageSwitch } from '../../../shared/components/language-switch';

export function AccessState() {
  const { dictionary: t, failure, status, refreshAccess, signOut, online } = useApp();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const checking = online && (status === 'verifying' || status === 'initializing');
  const content = !online ? { title: t.offline, body: t.offlineBody }
    : checking ? { title: t.checking, body: t.checkingBody }
      : failure?.kind === 'unauthorized' ? { title: t.expiredTitle, body: t.expiredBody }
        : failure?.kind === 'denied' ? { title: t.deniedTitle, body: t.deniedBody }
          : failure?.kind === 'multiple-schools' ? { title: t.multipleTitle, body: t.multipleBody }
            : failure?.kind === 'invalid-response' ? { title: t.invalidResponseTitle, body: t.invalidResponseBody }
              : { title: t.unavailableTitle, body: t.unavailableBody };
  async function returnToSignIn() {
    setSigningOut(true);
    const success = await signOut();
    setSigningOut(false);
    setSignOutFailed(!success);
  }
  return <div className="access-page">
    <header className="public-header"><Brand /><LanguageSwitch /></header>
    <main id="main-content" className="access-state" tabIndex={-1}>
      <div className="access-state__icon">{!online ? <WifiOff size={30} aria-hidden="true" /> : checking ? <ShieldCheck size={30} aria-hidden="true" /> : <ShieldAlert size={30} aria-hidden="true" />}</div>
      <p className="eyebrow">{t.schoolWorkspace}</p>
      <h1>{content.title}</h1>
      <p role="status" aria-live="polite">{content.body}</p>
      {checking ? <div className="loading-line" aria-hidden="true" /> : <div className="access-state__actions">
        <Button type="button" onClick={refreshAccess} disabled={!online}><RefreshCw size={16} aria-hidden="true" />{t.retry}</Button>
        <Button type="button" variant="quiet" disabled={signingOut} onClick={() => void returnToSignIn()}>{signingOut ? t.signingOut : t.returnSignIn}</Button>
      </div>}
      {failure?.requestId ? <p className="support-reference">{t.reference}: <bdi>{failure.requestId}</bdi></p> : null}
      {signOutFailed ? <p className="form-error" role="alert">{t.signOutError}</p> : null}
    </main>
    <footer className="public-footer"><span>{t.company}</span><span>{t.foundation}</span></footer>
  </div>;
}
