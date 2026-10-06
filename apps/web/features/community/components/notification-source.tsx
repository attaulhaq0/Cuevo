'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useState } from 'react';
import { Button } from '@cuevo/ui';
import { confirmCommunityReceipt, parseAnnouncement, parseParentAnnouncement, type AnnouncementNotification } from '../model';
import { communityAr, communityEn } from '../messages';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
export function NotificationSource({ notification, onChanged }: { notification: AnnouncementNotification; onChanged: () => void }) {
  const { locale, membership, accessToken, accessGeneration, apiUrl, online } = useApp(); const t = locale === 'ar' ? communityAr : communityEn;
  const [open, setOpen] = useState(false); const [refresh, setRefresh] = useState(0); const [locked,setLocked]=useState(false);
  const scope = `${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${notification.id}:${notification.announcementId}:${refresh}`;
  const parse = useCallback((value: unknown) => { const source = membership?.role === 'parent' ? parseParentAnnouncement(value) : parseAnnouncement(value); if (source.id !== notification.announcementId) throw new LearningApiError('invalid'); return { scope, value: source }; }, [scope, membership?.role, notification.announcementId]);
  const query = useApiQuery(open ? `/v1/community/announcements/${notification.announcementId}` : null, parse, refresh);
  const source = query.data?.scope === scope ? query.data.value : null;
  return <><Button type="button" variant="quiet" disabled={locked} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? t.closeAnnouncement : t.openAnnouncement}</Button>{open ? <section aria-label={t.openAnnouncement}>{query.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : query.error ? <><LearningError error={query.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button></> : source ? <><h3>{source.title}</h3><p className="community-message" dir="auto">{source.body}</p>{!source.readAt ? <CommandForm title={t.markRead} path={`/v1/community/notifications/${notification.id}/read`} fields={[]} body={() => ({expectedRevision:source.revision??1})} onLockedChange={setLocked} validateReceipt={(receipt, command) => { confirmCommunityReceipt(receipt, command); }} onSaved={() => { setRefresh(value => value + 1); onChanged(); }} actionLabel={t.markRead} /> : <p>{t.read}</p>}</> : null}</section> : null}</>;
}

