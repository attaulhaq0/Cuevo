'use client';
import { useCallback, useState } from 'react';
import { Button } from '@cuevo/ui';
import { parseAnnouncement, type AnnouncementNotification } from '../model';
import { communityAr, communityEn } from '../messages';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
export function NotificationSource({ notification, onChanged }: { notification: AnnouncementNotification; onChanged: () => void }) {
  const { locale } = useApp(); const t = locale === 'ar' ? communityAr : communityEn;
  const [open, setOpen] = useState(false); const [refresh, setRefresh] = useState(0); const [locked,setLocked]=useState(false);
  const parse = useCallback((value: unknown) => { const source = parseAnnouncement(value); if (source.id !== notification.announcementId) throw new LearningApiError('invalid'); return source; }, [notification.announcementId]);
  const query = useApiQuery(open ? `/v1/community/announcements/${notification.announcementId}` : null, parse, refresh);
  return <><Button type="button" variant="quiet" disabled={locked} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? t.closeAnnouncement : t.openAnnouncement}</Button>{open ? <section aria-label={t.openAnnouncement}>{query.loading ? <p role="status">{t.loading}</p> : query.error ? <><LearningError error={query.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button></> : query.data ? <><h3>{query.data.title}</h3><p className="community-message" dir="auto">{query.data.body}</p>{!query.data.readAt ? <CommandForm title={t.markRead} path={`/v1/community/notifications/${notification.id}/read`} fields={[]} body={() => ({expectedRevision:query.data!.revision??1})} onLockedChange={setLocked} onSaved={() => { setRefresh(value => value + 1); onChanged(); }} actionLabel={t.markRead} /> : <p>{t.read}</p>}</> : null}</section> : null}</>;
}


