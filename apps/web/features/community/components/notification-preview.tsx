'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, CuevoIcon, IconButton, Status, WorkspaceState } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { parseNotificationPreviewPage, notificationPreviewTitle } from '../notification-preview-model';
import { communityAr, communityEn } from '../messages';

/** A bounded current page, not a latest/unread-total projection. Existing
 * Community list and exact-source readers retain all notification authority. */
export function NotificationPreview({ onSeeAll }: { onSeeAll: () => void }) {
  const app = useApp();
  if (!app.membership || app.status !== 'ready' || !app.online || !canOpenWorkspace('community', app.membership.entitlements, app.membership.role)) return null;
  return <CurrentNotificationPreview onSeeAll={onSeeAll} key={`${app.apiUrl}:${app.membership.schoolId}:${app.membership.userId}:${app.membership.role}:${app.accessToken}:${app.accessGeneration}`} />;
}

function CurrentNotificationPreview({ onSeeAll }: { onSeeAll: () => void }) {
  const { locale, membership } = useApp();
  const t = locale === 'ar' ? communityAr : communityEn;
  const ar = locale === 'ar';
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0);
  const id = useId(), root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const openedGeometry = useRef('');
  const parse = useCallback((value: unknown) => parseNotificationPreviewPage(value, membership?.role === 'parent'), [membership?.role]);
  const query = useApiQuery(open ? '/v1/community/notifications?limit=5' : null, parse, refresh);
  const trigger = () => root.current?.querySelector<HTMLButtonElement>('button[popovertarget]');
  const geometry = () => { const rect = trigger()?.getBoundingClientRect(); return rect ? JSON.stringify([rect.top, rect.left, rect.width, rect.height, window.innerWidth, window.innerHeight]) : ''; };
  useEffect(() => {
    function dismissMoved(event: Event) {
      const popup = panel.current;
      if (!popup?.matches(':popover-open') || event.type === 'scroll' && event.target instanceof Node && popup.contains(event.target)) return;
      if (event.type === 'scroll' && openedGeometry.current === geometry()) return;
      leaving.current = false; popup.hidePopover();
    }
    window.addEventListener('resize', dismissMoved); document.addEventListener('scroll', dismissMoved, true);
    return () => { window.removeEventListener('resize', dismissMoved); document.removeEventListener('scroll', dismissMoved, true); };
  }, []);
  function position() {
    const popup = panel.current, button = trigger(); if (!popup || !button) return;
    const viewport = document.documentElement.clientWidth, rect = button.getBoundingClientRect();
    const width = Math.min(400, Math.max(0, viewport - 16));
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(8, Math.min(viewport - width - 8, ar ? rect.left : rect.right - width))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 52))}px`;
    popup.style.maxHeight = `${Math.max(44, window.innerHeight - parseFloat(popup.style.top) - 8)}px`;
  }
  function close(seeAll = false) {
    leaving.current = seeAll;
    panel.current?.hidePopover();
    if (seeAll) onSeeAll(); else trigger()?.focus({ preventScroll: true });
  }
  return <div ref={root} className="notification-preview" lang={locale} dir={ar ? 'rtl' : 'ltr'}>
    <IconButton label={t.notifications} icon="notification" popoverTarget={id} aria-controls={id} aria-expanded={open} aria-haspopup="dialog" onClick={() => { leaving.current = false; position(); openedGeometry.current = geometry(); }} />
    <div ref={panel} id={id} popover="auto" role="dialog" aria-labelledby={`${id}-title`} className="notification-preview__panel" onToggle={event => {
      const visible = event.newState === 'open'; setOpen(visible);
      if (visible) { setRefresh(value => value + 1); position(); panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
      else if (!leaving.current && (document.activeElement === document.body || panel.current?.contains(document.activeElement))) trigger()?.focus({ preventScroll: true });
    }}>
      <div className="notification-preview__heading"><h2 id={`${id}-title`}>{t.notifications}</h2><IconButton label={ar ? 'إغلاق الإشعارات' : 'Close notifications'} icon="close" onClick={() => close()} /></div>
      {query.loading ? <WorkspaceState kind="loading" description={ar ? 'جارٍ تحميل الإشعارات…' : 'Loading notifications…'} role="status" /> : query.error ? <><LearningError error={query.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button></> : !query.data ? <WorkspaceState kind="unknown" description={ar ? 'لم يتم التحقق من الإشعارات الحالية بعد.' : 'Current notifications have not been verified yet.'} /> : <>
        {query.data.items.length ? <ul className="notification-preview__items">{query.data.items.map(item => <li key={item.id}><CuevoIcon name={item.kind === 'MENTION' ? 'community' : 'notification'} /><div><h3><bdi>{notificationPreviewTitle(item.title, locale)}</bdi></h3><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></div><Status>{item.readAt ? t.read : t.unread}</Status></li>)}</ul> : <WorkspaceState kind={query.data.nextCursor ? 'unknown' : 'empty'} description={query.data.nextCursor ? t.partialRecords : ar ? 'لا توجد إشعارات متاحة ضمن صلاحياتك الحالية.' : 'No notifications are available with your current access.'} />}
        {query.data.nextCursor ? <p className="notification-preview__more">{ar ? 'تتوفر إشعارات أخرى في المركز.' : 'More notifications are available in the centre.'}</p> : null}
      </>}
      <Button type="button" variant="quiet" className="notification-preview__all" onClick={() => close(true)}>{ar ? 'عرض الكل' : 'See all'}<CuevoIcon name="arrow" /></Button>
    </div>
  </div>;
}
