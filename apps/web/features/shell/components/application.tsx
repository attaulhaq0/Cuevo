'use client';

import { useApp } from '../../../shared/session/providers';
import { SignIn } from '../../auth/ui';
import { AccessState } from '../../auth/ui';
import { Workspace } from './workspace';
import type { WorkspaceTheme } from '../theme-model';
import { useWorkspaceTheme } from './workspace-theme';

export function Application({ initialTheme = 'light' }: { initialTheme?: WorkspaceTheme }) {
  const { status, membership, online, dictionary: t } = useApp();
  const { theme, setTheme } = useWorkspaceTheme(initialTheme);
  return <><a className="skip-link" href="#main-content">{t.skip}</a>{status === 'signed-out' || status === 'not-configured' ? <SignIn /> : status === 'ready' && membership && online ? <Workspace membership={membership} theme={theme} onThemeChange={setTheme} /> : <AccessState />}</>;
}
