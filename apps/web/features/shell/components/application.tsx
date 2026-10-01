'use client';

import { useApp } from '../../../shared/session/providers';
import { SignIn } from '../../auth/ui';
import { AccessState } from '../../auth/ui';
import { Workspace } from './workspace';

export function Application() {
  const { status, membership, online, dictionary: t } = useApp();
  return <><a className="skip-link" href="#main-content">{t.skip}</a>{status === 'signed-out' || status === 'not-configured' ? <SignIn /> : status === 'ready' && membership && online ? <Workspace membership={membership} /> : <AccessState />}</>;
}
