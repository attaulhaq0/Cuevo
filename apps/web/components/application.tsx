'use client';

import { useApp } from './providers';
import { SignIn } from './sign-in';
import { AccessState } from './access-state';
import { Workspace } from './workspace';

export function Application() {
  const { status, membership, online, dictionary: t } = useApp();
  return <><a className="skip-link" href="#main-content">{t.skip}</a>{status === 'signed-out' || status === 'not-configured' ? <SignIn /> : status === 'ready' && membership && online ? <Workspace membership={membership} /> : <AccessState />}</>;
}
