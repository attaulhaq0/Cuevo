'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { matchWorkspaceNavigation, type WorkspaceChromeAction, type WorkspaceNavigationItem } from '../model';
import { commandAr, commandEn } from '../messages';

type CommandContext = { navigation: readonly WorkspaceNavigationItem[]; selectedId: string; locale: 'en' | 'ar' };

/** Ordinary buttons retain native Tab/Enter/Space and disabled behavior. This
 * result list is a search surface of the supplied catalogue, not a second nav. */
export function WorkspaceCommandResults({ navigation, selectedId, locale, query, onSelect }: CommandContext & { query: string; onSelect: (id: string) => void }) {
  const t = locale === 'ar' ? commandAr : commandEn;
  const matches = matchWorkspaceNavigation(navigation, query);
  if (!matches.length) return <p className="workspace-command__empty" role="status">{navigation.length ? t.noMatch : t.empty}</p>;
  return <ul className="workspace-command__results" aria-label={t.results}>{matches.map(item => <li key={item.id}>
    <button type="button" data-workspace-command={item.id} onClick={() => onSelect(item.id)} disabled={item.disabled || item.pending || !item.label.trim()} aria-busy={item.pending || undefined} aria-current={selectedId === item.id ? 'page' : undefined}>
      <CuevoIcon name={item.icon} size={24} /><span className="workspace-command__label"><bdi>{item.label.trim() ? item.label : t.nameUnknown}</bdi>{selectedId === item.id ? <small>{t.current}</small> : null}</span>
      {item.pending ? <small className="workspace-command__state">{t.pending}</small> : item.disabled || !item.label.trim() ? <small className="workspace-command__state">{t.unavailable}</small> : null}
    </button>
  </li>)}</ul>;
}

/** Opens a native modal without replacing the current feature subtree. The
 * owner places the dialog inside Chrome so authenticated tokens are inherited. */
export function WorkspaceCommandNavigation({ navigation, selectedId, locale, children }: CommandContext & { children?: (action: WorkspaceChromeAction, dialog: ReactNode) => ReactNode }) {
  const t = locale === 'ar' ? commandAr : commandEn;
  const id = useId();
  const dialogId = `${id}-workspace-command`;
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const open = useCallback(() => {
    const element = dialog.current;
    if (!element || element.open || document.querySelector('dialog[open], [aria-modal="true"]')) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    element.showModal();
    setExpanded(true);
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || (event.code !== 'KeyK' && event.key.toLowerCase() !== 'k')) return;
      if (dialog.current?.open) {
        event.preventDefault();
        input.current?.focus({ preventScroll: true });
      } else if (!document.querySelector('dialog[open], [aria-modal="true"]')) {
        event.preventDefault();
        open();
      }
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, [open]);

  function dismiss() {
    if (!dialog.current?.open) return;
    dialog.current.close();
    setExpanded(false);
    setQuery('');
    const previous = opener.current;
    opener.current = null;
    if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
    else {
      // Access revalidation can remove the original feature input while open.
      // Return to this dialog's still-current header trigger in that case.
      const trigger = dialog.current.closest('.workspace')?.querySelector<HTMLButtonElement>(`button[aria-controls="${dialogId}"]`);
      trigger?.focus({ preventScroll: true });
    }
  }

  function select(id: string) {
    // Recheck the current catalogue before callback dispatch; stale removed,
    // pending or disabled choices never reach the owner's navigation handler.
    const destination = navigation.find(item => item.id === id);
    if (!dialog.current?.open || !destination || destination.disabled || destination.pending || !destination.label.trim()) return;
    dialog.current.close();
    setExpanded(false);
    setQuery('');
    opener.current = null;
    // Workspace already owns native history and schedules the new h1 focus.
    // No later close-event handler may steal that focus back to the opener.
    destination.onSelect();
  }

  const action: WorkspaceChromeAction = { label: t.open, onClick: open, controls: dialogId, expanded, hasPopup: 'dialog', keyShortcuts: 'Control+K Meta+K' };
  const modal = <dialog id={dialogId} ref={dialog} className="workspace-command" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} onKeyDownCapture={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); dismiss(); } }} onCancel={event => { event.preventDefault(); dismiss(); }} onClose={() => { if (!dialog.current?.open) { setExpanded(false); setQuery(''); opener.current = null; } }}>
    <div className="workspace-command__header"><h2 id={`${id}-title`}>{t.title}</h2><Button type="button" variant="quiet" onClick={dismiss}>{t.close}</Button></div>
    <p id={`${id}-hint`} className="workspace-command__hint">{t.hint}</p>
    <div className="field"><label className="workspace-command__search-label" htmlFor={`${id}-search`}>{t.searchLabel}</label>
      <div className="workspace-command__search"><CuevoIcon name="search" size={22} /><input ref={input} id={`${id}-search`} type="search" autoComplete="off" value={query} onChange={event => setQuery(event.currentTarget.value)} />{query ? <Button type="button" variant="quiet" onClick={() => { setQuery(''); input.current?.focus({ preventScroll: true }); }}>{t.clear}</Button> : null}</div>
    </div>
    <WorkspaceCommandResults navigation={navigation} selectedId={selectedId} locale={locale} query={query} onSelect={select} />
  </dialog>;
  return children ? children(action, modal) : modal;
}
