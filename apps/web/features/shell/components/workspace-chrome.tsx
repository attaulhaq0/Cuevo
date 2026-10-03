'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const rail = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [context.navigation]);
  function scrollRail(forward: boolean) {
    const element = rail.current;
    if (element) element.scrollBy({ left: element.clientWidth * .7 * (forward ? 1 : -1) * (rtl ? -1 : 1), behavior: 'instant' });
  }
  return <div className="workspace workspace-chrome" lang={context.locale} dir={rtl ? 'rtl' : 'ltr'} data-theme={context.theme} data-density={context.density || 'standard'} data-motion={context.quiet ? 'quiet' : 'standard'} data-expression={context.expression || 'staff'}>
    <header className="workspace-chrome__header"><div className="workspace-chrome__brand">{context.brand}</div><div className="workspace-chrome__school"><CuevoIcon name="school" variant="filled" size={25} /><bdi>{context.schoolName || t.schoolUnknown}</bdi>{context.contextControl}</div><div className="workspace-chrome__utilities">{context.searchAction ? <Utility action={context.searchAction} icon="search" /> : null}{context.notificationAction ? <Utility action={context.notificationAction} icon="notification" /> : null}{context.helpAction ? <Utility action={context.helpAction} icon="help" /> : null}{context.languageControl}</div><div className="workspace-chrome__person">{context.accountAction ? <button type="button" onClick={context.accountAction.onClick} disabled={context.accountAction.disabled || context.accountAction.pending} aria-busy={context.accountAction.pending || undefined} aria-label={context.accountAction.label}><span className="workspace-chrome__avatar" aria-hidden="true"><CuevoIcon name="person" size={23} /></span><span><strong><bdi>{context.personName || t.personUnknown}</bdi></strong><small>{context.roleLabel || t.roleUnknown}</small></span><CuevoIcon name="chevron" size={18} /></button> : <div><span className="workspace-chrome__avatar" aria-hidden="true"><CuevoIcon name="person" size={23} /></span><span><strong><bdi>{context.personName || t.personUnknown}</bdi></strong><small>{context.roleLabel || t.roleUnknown}</small></span></div>}</div></header>
    <nav className="workspace-chrome__navigation" aria-label={context.navigationLabel || t.navigation} data-overflow={overflowing}>
      <Button type="button" variant="quiet" className="workspace-chrome__rail-control workspace-chrome__rail-control--previous" aria-label={t.previous} onClick={() => scrollRail(false)} disabled={!overflowing}><CuevoIcon name="arrow" size={18} /></Button>
      <div className="workspace-chrome__rail" ref={rail}>{context.navigation.length ? <ul>{context.navigation.map(item => <li key={item.id}><button type="button" data-workspace-destination={item.id} ref={element => { if (element) buttons.current.set(item.id, element); else buttons.current.delete(item.id); }} onClick={item.onSelect} disabled={item.disabled || item.pending} aria-busy={item.pending || undefined} aria-current={context.selectedId === item.id ? 'page' : undefined} onFocus={event => event.currentTarget.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })} onKeyDown={event => { const target = navigationFocusTarget(context.navigation, item.id, event.key, rtl); if (target) { event.preventDefault(); buttons.current.get(target)?.focus(); } }}><CuevoIcon name={item.icon} variant={context.expression === 'student' ? 'filled' : 'outline'} size={25} /><span>{item.label}</span></button></li>)}</ul> : <p className="workspace-chrome__empty">{t.empty}</p>}</div>
      <Button type="button" variant="quiet" className="workspace-chrome__rail-control workspace-chrome__rail-control--next" aria-label={t.next} onClick={() => scrollRail(true)} disabled={!overflowing}><CuevoIcon name="arrow" size={18} /></Button>
    </nav><div className="workspace-chrome__content">{children}</div>
  </div>;
}
