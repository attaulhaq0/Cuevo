import type { ReactNode } from 'react';
import type { CuevoIconName } from '@cuevo/ui';

export type WorkspaceChromeAction = { label: string; onClick: () => void; disabled?: boolean; pending?: boolean };
/** Owner already filtered these destinations through current capabilities.
 * Internal IDs are selection/routing handles, never visible customer labels. */
export type WorkspaceNavigationItem = { id: string; label: string; icon: CuevoIconName; onSelect: () => void; disabled?: boolean; pending?: boolean };
export type WorkspaceChromeContext = {
  navigation: WorkspaceNavigationItem[];
  selectedId: string;
  navigationLabel: string;
  schoolName: string | null;
  personName: string | null;
  roleLabel: string | null;
  locale: 'en' | 'ar';
  theme: 'light' | 'dark' | 'system';
  expression?: 'student' | 'staff' | 'parent';
  density?: 'standard' | 'compact';
  quiet?: boolean;
  brand: ReactNode;
  languageControl?: ReactNode;
  contextControl?: ReactNode;
  accountAction?: WorkspaceChromeAction;
  searchAction?: WorkspaceChromeAction;
  notificationAction?: WorkspaceChromeAction;
  helpAction?: WorkspaceChromeAction;
};

/** Optional horizontal key focus, never selection or URL mutation. */
export function navigationFocusTarget(items: readonly WorkspaceNavigationItem[], currentId: string, key: string, rtl: boolean): string | null {
  const enabled = items.filter(item => !item.disabled && !item.pending);
  if (!enabled.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return null;
  if (key === 'Home') return enabled[0].id;
  if (key === 'End') return enabled.at(-1)!.id;
  const index = enabled.findIndex(item => item.id === currentId);
  const step = (key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
  return enabled[(Math.max(0, index) + step + enabled.length) % enabled.length].id;
}
