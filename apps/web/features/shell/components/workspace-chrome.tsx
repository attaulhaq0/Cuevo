'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { navigationFocusTarget, type WorkspaceChromeAction, type WorkspaceChromeContext } from '../model';
import { chromeAr, chromeEn } from '../messages';

function Utility({ action, icon }: { action: WorkspaceChromeAction; icon: 'search' | 'notification' | 'help' }) {
  return <Button type="button" variant="quiet" className="workspace-chrome__utility" onClick={action.onClick} disabled={action.disabled || action.pending} aria-busy={action.pending || undefined} aria-label={action.label} aria-controls={action.controls} aria-expanded={action.expanded} aria-haspopup={action.hasPopup} aria-keyshortcuts={action.keyShortcuts}><CuevoIcon name={icon} size={22} /></Button>;
}

/** One navigation DOM for desktop rail/mobile dock. The current owner retains
 * history, heading focus, permitted destinations and protected session scope. */
export function WorkspaceChrome({ context, children }: { context: WorkspaceChromeContext; children: ReactNode }) {
  const t = context.locale === 'ar' ? chromeAr : chromeEn;
  const rtl = context.locale === 'ar';
  const profileId = `${useId()}-profile`;
  const profile = useRef<HTMLDivElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const leavingProfile = useRef(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    function dismissMovedProfile(event: Event) {
      if (!profile.current?.matches(':popover-open') || (event.type === 'scroll' && event.target instanceof Node && profile.current.contains(event.target))) return;
      leavingProfile.current = false;
      profile.current.hidePopover();
    }
    window.addEventListener('resize', dismissMovedProfile);
    document.addEventListener('scroll', dismissMovedProfile, true);
    return () => { window.removeEventListener('resize', dismissMovedProfile); document.removeEventListener('scroll', dismissMovedProfile, true); };
  }, []);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [context.navigation]);
  useEffect(() => {
    const active = context.selectedId ? buttons.current.get(context.selectedId) : null;
    active?.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
  }, [context.selectedId, context.locale, overflowing]);
  function scrollRail(forward: boolean) {
    const element = rail.current;
    if (element) element.scrollBy({ left: element.clientWidth * .7 * (forward ? 1 : -1) * (rtl ? -1 : 1), behavior: 'instant' });
  }
  function closeProfile(action?: WorkspaceChromeAction) {
    leavingProfile.current = Boolean(action);
    profile.current?.hidePopover();
    if (action && !action.disabled && !action.pending) action.onClick();
    else if (!action) profileTrigger.current?.focus({ preventScroll: true });
  }
  const identity = <><span className="workspace-chrome__avatar" aria-hidden="true"><CuevoIcon name="person" size={23} /></span><span><strong><bdi>{context.personName || t.personUnknown}</bdi></strong><small>{context.roleLabel || t.roleUnknown}</small></span></>;
  const hasProfile = Boolean(context.accountAction || context.settingsAction || context.signOutAction || context.appearanceControl);
  return <div className="workspace workspace-chrome" lang={context.locale} dir={rtl ? 'rtl' : 'ltr'} data-theme={context.theme} data-density={context.density || 'standard'} data-motion={context.quiet ? 'quiet' : 'standard'} data-expression={context.expression || 'staff'}>
    <header className="workspace-chrome__header"><div className="workspace-chrome__brand">{context.brand}</div><div className="workspace-chrome__school"><CuevoIcon name="school" variant="filled" size={25} /><bdi>{context.schoolName || t.schoolUnknown}</bdi>{context.contextControl}</div>{context.searchAction ? <Button type="button" variant="quiet" className="workspace-chrome__search" onClick={() => { if (profile.current?.matches(':popover-open')) closeProfile(context.searchAction); else context.searchAction?.onClick(); }} disabled={context.searchAction.disabled || context.searchAction.pending} aria-busy={context.searchAction.pending || undefined} aria-label={context.searchAction.label} aria-controls={context.searchAction.controls} aria-expanded={context.searchAction.expanded} aria-haspopup={context.searchAction.hasPopup} aria-keyshortcuts={context.searchAction.keyShortcuts}><CuevoIcon name="search" size={22} /><span>{t.search}</span><kbd aria-hidden="true">⌘ / Ctrl K</kbd></Button> : null}<div className="workspace-chrome__utilities">{context.notificationAction ? <Utility action={context.notificationAction} icon="notification" /> : null}{context.helpAction ? <Utility action={context.helpAction} icon="help" /> : null}{context.languageControl}</div><div className="workspace-chrome__person">{hasProfile ? <><button type="button" ref={profileTrigger} popoverTarget={profileId} aria-controls={profileId} aria-expanded={profileOpen} aria-label={t.profile} onClick={() => { leavingProfile.current = false; const rect = profileTrigger.current?.getBoundingClientRect(); if (rect && profile.current) { profile.current.style.top = `${rect.bottom + 8}px`; profile.current.style.maxHeight = `${Math.max(44, window.innerHeight - rect.bottom - 20)}px`; } }}>{identity}<CuevoIcon name="chevron" size={18} /></button><div id={profileId} ref={profile} popover="auto" className="workspace-chrome__profile" aria-label={t.profile} onToggle={event => { const open = event.newState === 'open'; setProfileOpen(open); if (open) profile.current?.querySelector<HTMLElement>('button:not(:disabled), select:not(:disabled)')?.focus({ preventScroll: true }); else if (!leavingProfile.current && !document.querySelector('dialog[open]') && (document.activeElement === document.body || profile.current?.contains(document.activeElement))) profileTrigger.current?.focus({ preventScroll: true }); }}><div className="workspace-chrome__profile-heading"><strong>{t.profile}</strong><Button type="button" variant="quiet" aria-label={t.closeProfile} onClick={() => closeProfile()}><CuevoIcon name="close" size={20} /></Button></div>{context.accountAction ? <Button type="button" variant="quiet" onClick={() => closeProfile(context.accountAction)} disabled={context.accountAction.disabled || context.accountAction.pending} aria-busy={context.accountAction.pending || undefined}><CuevoIcon name="person" size={22} />{context.accountAction.label}</Button> : null}{context.settingsAction ? <Button type="button" variant="quiet" onClick={() => closeProfile(context.settingsAction)} disabled={context.settingsAction.disabled || context.settingsAction.pending} aria-busy={context.settingsAction.pending || undefined}><CuevoIcon name="settings" size={22} />{context.settingsAction.label}</Button> : null}{context.appearanceControl}{context.signOutAction ? <Button type="button" variant="quiet" className="workspace-chrome__signout" onClick={context.signOutAction.onClick} disabled={context.signOutAction.disabled || context.signOutAction.pending} aria-busy={context.signOutAction.pending || undefined}><CuevoIcon name="logout" size={22} />{context.signOutAction.label}</Button> : null}{context.profileNotice}</div></> : <div className="workspace-chrome__identity">{identity}</div>}</div></header>
    <nav className="workspace-chrome__navigation" aria-label={context.navigationLabel || t.navigation} data-overflow={overflowing}>
      <Button type="button" variant="quiet" className="workspace-chrome__rail-control workspace-chrome__rail-control--previous" aria-label={t.previous} onClick={() => scrollRail(false)} disabled={!overflowing}><CuevoIcon name="arrow" size={18} /></Button>
      <div className="workspace-chrome__rail" ref={rail}>{context.navigation.length ? <ul>{context.navigation.map(item => <li key={item.id}><button type="button" data-workspace-destination={item.id} ref={element => { if (element) buttons.current.set(item.id, element); else buttons.current.delete(item.id); }} onClick={item.onSelect} disabled={item.disabled || item.pending} aria-busy={item.pending || undefined} aria-current={context.selectedId === item.id ? 'page' : undefined} onFocus={event => event.currentTarget.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })} onKeyDown={event => { const target = navigationFocusTarget(context.navigation, item.id, event.key, rtl); if (target) { event.preventDefault(); buttons.current.get(target)?.focus(); } }}><CuevoIcon name={item.icon} variant={context.expression === 'student' ? 'filled' : 'outline'} size={25} /><span>{item.label}</span></button></li>)}</ul> : <p className="workspace-chrome__empty">{t.empty}</p>}</div>
      <Button type="button" variant="quiet" className="workspace-chrome__rail-control workspace-chrome__rail-control--next" aria-label={t.next} onClick={() => scrollRail(true)} disabled={!overflowing}><CuevoIcon name="arrow" size={18} /></Button>
    </nav><div className="workspace-chrome__content">{children}</div>
  </div>;
}
