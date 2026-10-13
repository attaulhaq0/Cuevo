import { LearningApiError } from '../../shared/api/client';
import { parsePage, type Page } from '../../shared/api/pagination';
import { parseNotification, parseParentNotification, type Notification } from './model';

/** Current bounded page only. No first-page recency or unread-total claim. */
export function parseNotificationPreviewPage(value: unknown, parent: boolean): Page<Notification> {
  const page = parsePage(value, parent ? parseParentNotification : parseNotification);
  if (page.items.length > 5 || new Set(page.items.map(item => item.id)).size !== page.items.length) throw new LearningApiError('invalid');
  return page;
}
export function notificationPreviewTitle(value: string, locale: 'en' | 'ar') {
  const title = value.trim();
  const opaque = /^(?:[0-9a-f]{8}|[0-9a-f]{40}|[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  return title && title.length <= 200 && !opaque.test(title) ? title : locale === 'ar' ? 'عنوان الإشعار غير متاح' : 'Notification title unavailable';
}
