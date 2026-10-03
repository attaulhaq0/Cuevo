import type { ReactNode } from 'react';
export { workspaceTheme } from './theme-model';
import type { CuevoIconName } from '@cuevo/ui';
import { canOpenWorkspace, type WorkspaceTarget } from '../../shared/session/capabilities';
import type { Membership } from '../../shared/session/membership';
import { navigationParameters, type NavigationIntent } from '../../shared/session/navigation-intent';

export type WorkspaceDestination = { id: WorkspaceTarget; label: string; icon: CuevoIconName };

/** Enter creates an ordinary click; modifier/middle clicks retain link semantics. */
export function isWorkspaceHomeActivation(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

const destinations: { id: WorkspaceTarget; icon: CuevoIconName }[] = [
  { id: 'overview', icon: 'home' }, { id: 'school', icon: 'school' },
  { id: 'community', icon: 'community' }, { id: 'portfolio', icon: 'portfolio' },
  { id: 'development', icon: 'development' }, { id: 'curriculum', icon: 'curriculum' },
  { id: 'restricted', icon: 'shield' }, { id: 'learning', icon: 'learning' },
  { id: 'academic', icon: 'assessment' }, { id: 'progress', icon: 'progress' },
  { id: 'improvement', icon: 'arrow' }, { id: 'access', icon: 'shield' },
  { id: 'account', icon: 'person' },
];

/** The existing shared prerequisite policy supplies presentation eligibility.
 * Destination APIs still verify current record, relationship and source scope. */
export function workspaceNavigation(membership: Pick<Membership, 'role' | 'entitlements'>, labels: Record<WorkspaceTarget, string>): WorkspaceDestination[] {
  return destinations.filter(item => canOpenWorkspace(item.id, membership.entitlements, membership.role))
    .map(item => ({ ...item, label: labels[item.id] }));
}

export function workspaceView(navigation: readonly WorkspaceDestination[], requested: string | null): WorkspaceTarget {
  return navigation.find(item => item.id === requested)?.id ?? 'overview';
}

/** Uses the native history writer so Back/Forward retain exact source intent. */
export function openWorkspaceDestination(destination: WorkspaceTarget | NavigationIntent, navigation: readonly WorkspaceDestination[], pathname: string, history: Pick<History, 'pushState'>): boolean {
  const view = typeof destination === 'string' ? destination : destination.view;
  if (!navigation.some(item => item.id === view)) return false;
  const params = typeof destination === 'string' ? new URLSearchParams() : navigationParameters(destination);
  if (view !== 'overview') params.set('view', view);
  history.pushState(null, '', `${pathname}${params.size ? '?' + params : ''}`);
  return true;
}

export type WorkspaceChromeAction = { label: string; onClick: () => void; disabled?: boolean; pending?: boolean; controls?: string; expanded?: boolean; hasPopup?: 'dialog'; keyShortcuts?: string };
/** Owner already filtered these destinations through current capabilities.
 * Internal IDs are selection/routing handles, never visible customer labels. */
export type WorkspaceNavigationItem = { id: string; label: string; icon: CuevoIconName; onSelect: () => void; disabled?: boolean; pending?: boolean };

/** Local destination search is only a projection of the current permitted
 * catalogue. IDs, records and inferred aliases never enter the match index. */
export function matchWorkspaceNavigation(items: readonly WorkspaceNavigationItem[], query: string): WorkspaceNavigationItem[] {
  const normalize = (value: string) => value.normalize('NFC').replace(/[\u064B-\u065F\u0670]/gu, '').trim().replace(/\s+/gu, ' ').toLowerCase();
  const search = normalize(query);
  return items.filter(item => !search || normalize(item.label).includes(search));
}
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
