import { expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { canonicalReleaseExecutionJson } from '../../scripts/verification/release-review';
import type { HostedCommandJournalIdentity } from '../../scripts/verification/hosted-command-journal-contracts';
import type { HostedCommunityViewReceipt } from '../../scripts/verification/hosted-community-view';
import { hostedCommunityRecipeText } from '../../scripts/verification/hosted-community-command';
import type { CustomerCommunityViewCheckpoint } from './customer-community-journey';
import { communityEn, communityAr } from '../../apps/web/features/community/messages';
import { maintenanceEn, maintenanceAr } from '../../apps/web/features/community/maintenance-messages';
import { commonEn, commonAr } from '../../apps/web/shared/i18n/common';
import { expectTrailWorkspace } from './trail-workspace';

export type CommunityViewReceipt = HostedCommunityViewReceipt;
const hash = (value: unknown) => createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const text = hostedCommunityRecipeText;
const viewport = { en: { width: 1366, height: 900 }, ar: { width: 390, height: 844 } };
async function settled(page: Page) {
  await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function keyboardFocus(page: Page, target: Locator) {
  await expect(target).toHaveCount(1); await expect(target).toBeEnabled();
  const skip = page.getByRole('link', { name: /^(Skip to main content|انتقل إلى المحتوى الرئيسي)$/ });
  await expect(skip).toHaveCount(1); await skip.focus();
  for (let index = 0; index < 180; index++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(node => node === document.activeElement)) {
      await expect(target).toBeFocused();
      expect(await target.evaluate(node => {
        const box = node.getBoundingClientRect(), style = getComputedStyle(node);
        return node.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none'
          && box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
      })).toBe(true);
      return;
    }
  }
  throw Error('The current safe Community control was not reached by keyboard.');
}
async function axeMain(page: Page) {
  const result = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(row => ({ id: row.id, impact: row.impact, nodes: row.nodes.map(node => node.target) }))).toEqual([]);
}
async function sourceView(page: Page, checkpoint: CustomerCommunityViewCheckpoint, locale: 'en' | 'ar') {
  const t = locale === 'ar' ? communityAr : communityEn, m = locale === 'ar' ? maintenanceAr : maintenanceEn;
  await expectTrailWorkspace(page, checkpoint.role);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  const heading = page.getByRole('main').getByRole('heading', { level: 1 });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText(checkpoint.stage === 'FAMILY_NOTIFICATION_READ' ? t.notifications : checkpoint.stage === 'RETIREMENT_CONFIRMED' ? t.announcements : text.groupName);
  const controls = [t.refresh]; await expect(page.getByRole('button', { name: t.refresh, exact: true })).toHaveCount(1);
  if (!['FAMILY_NOTIFICATION_READ', 'RETIREMENT_CONFIRMED'].includes(checkpoint.stage)) {
    await expect(page.getByText(t.connected, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: t.back, exact: true })).toBeVisible(); controls.push(t.back, t.connected);
  }
  if (checkpoint.stage === 'GROUP_READY') {
    const members = page.getByRole('region', { name: t.members, exact: true });
    await expect(members).toBeVisible();
    await expect(members.getByLabel(t.actor, { exact: true })).toBeEnabled();
    await expect(members.getByLabel(t.membershipStatus, { exact: true })).toBeEnabled();
    await expect(members.getByLabel(t.confirmModeration)).not.toBeChecked();
    controls.push(t.members, t.actor, t.membershipStatus, t.confirmModeration);
  }
  if (['DISCUSSION_READY', 'MODERATION_RESTORED', 'READ_ONLY_DISCUSSION'].includes(checkpoint.stage)) {
    for (const [index, id] of checkpoint.postIds.entries()) {
      const post = page.locator('[data-post-id="' + id + '"]'); await expect(post).toBeVisible();
      await expect(post.locator('.community-message')).toHaveText(index === 0 ? text.postBody : text.secondPostBody);
    }
  }
  if (checkpoint.stage === 'DISCUSSION_READY') {
    const post = page.getByRole('region', { name: t.post, exact: true });
    await expect(post).toBeVisible(); await expect(post.getByLabel(t.message, { exact: true })).toBeEnabled();
    const first = page.locator('[data-post-id="' + checkpoint.postIds[0] + '"]');
    await expect(first.getByRole('button', { name: t.reply, exact: true })).toBeEnabled();
    await expect(first.getByRole('button', { name: t.report, exact: true })).toBeEnabled();
    controls.push(t.post, t.message, t.reply, t.report);
  }
  if (checkpoint.stage === 'READ_ONLY_DISCUSSION') {
    await expect(page.getByRole('region', { name: t.post, exact: true })).toHaveCount(0);
    await expect(page.getByText(t.readonly, { exact: true })).toBeVisible(); controls.push(t.readonly);
  }
  if (checkpoint.stage === 'MODERATION_RESTORED') {
    const report = page.locator('.community-post').filter({ has: page.getByRole('heading', { name: m.reportedMessage, exact: true }) });
    await expect(page.getByRole('heading', { name: t.reports, exact: true })).toBeVisible();
    await expect(report).toHaveCount(1); await expect(report).toContainText(text.reportReason);
    await expect(report.locator('.community-report-source .community-message')).toHaveText(text.postBody);
    await expect(report.getByRole('button', { name: m.reportReview, exact: true })).toBeEnabled();
    controls.push(t.reports, m.reportedMessage, m.reportReview);
  }
  if (checkpoint.stage === 'FAMILY_NOTIFICATION_READ') {
    const notification = page.locator('.community-post').filter({ has: page.getByRole('heading', { name: text.announcementTitle, exact: true, level: 2 }) });
    await expect(notification).toHaveCount(1);
    if (!await notification.getByRole('button', { name: t.closeAnnouncement, exact: true }).count()) {
      await notification.getByRole('button', { name: t.openAnnouncement, exact: true }).click(); await settled(page);
    }
    const source = notification.getByRole('region', { name: t.openAnnouncement, exact: true });
    await expect(source).toBeVisible(); await expect(source.getByRole('heading')).toHaveText(text.announcementTitle);
    await expect(source.locator('.community-message')).toHaveText(text.announcementBody);
    await expect(source.getByText(t.read, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: t.markRead, exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: t.members, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t.createAnnouncement, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t.notifications, exact: true })).toBeVisible();
    controls.push(t.read, t.notifications, t.closeAnnouncement);
  }
  if (checkpoint.stage === 'RETIREMENT_CONFIRMED') {
    await expect(page.getByRole('heading', { name: text.announcementTitle, exact: true })).toHaveCount(0);
    await expect(page.getByText(t.empty, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: t.post, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: t.createAnnouncement, exact: true })).toBeVisible(); controls.push(t.empty, t.createAnnouncement);
  }
  return { heading: (await heading.innerText()).trim(), controls };
}
async function safeDisclosure(page: Page, checkpoint: CustomerCommunityViewCheckpoint, locale: 'en' | 'ar', controls: string[]) {
  const t = locale === 'ar' ? communityAr : communityEn, m = locale === 'ar' ? maintenanceAr : maintenanceEn, c = locale === 'ar' ? commonAr : commonEn;
  let label = t.refresh;
  await keyboardFocus(page, page.getByRole('button', { name: label, exact: true }));
  if (checkpoint.stage === 'GROUP_READY') await keyboardFocus(page, page.getByRole('region', { name: t.members, exact: true }).getByLabel(t.actor, { exact: true }));
  if (checkpoint.stage === 'DISCUSSION_READY' || checkpoint.stage === 'MODERATION_RESTORED') {
    label = checkpoint.stage === 'DISCUSSION_READY' ? t.report : m.reportReview;
    const owner = checkpoint.stage === 'DISCUSSION_READY' ? page.locator('[data-post-id="' + checkpoint.postIds[0] + '"]')
      : page.locator('.community-post').filter({ has: page.getByRole('heading', { name: m.reportedMessage, exact: true }) });
    await keyboardFocus(page, owner.getByRole('button', { name: label, exact: true })); await page.keyboard.press('Enter');
    const form = page.getByRole('region', { name: label, exact: true }); await expect(form).toBeVisible();
    await expect(form.getByLabel(t.reason, { exact: true })).toBeEnabled();
    if (checkpoint.stage === 'MODERATION_RESTORED') await expect(form.getByLabel(m.confirmReview)).not.toBeChecked();
    await axeMain(page); await keyboardFocus(page, form.getByRole('button', { name: c.cancel, exact: true })); await page.keyboard.press('Enter');
    await expect(form).toHaveCount(0); controls.push(t.reason, c.cancel);
  }
  if (checkpoint.stage === 'FAMILY_NOTIFICATION_READ') {
    label = t.closeAnnouncement;
    await keyboardFocus(page, page.getByRole('button', { name: label, exact: true })); await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: t.openAnnouncement, exact: true })).toHaveCount(0);
    await keyboardFocus(page, page.getByRole('button', { name: t.openAnnouncement, exact: true })); await page.keyboard.press('Enter');
    await settled(page); await sourceView(page, checkpoint, locale); controls.push(t.openAnnouncement);
  }
  if (checkpoint.stage === 'RETIREMENT_CONFIRMED') {
    await page.getByRole('button', { name: t.rooms, exact: true }).click(); await settled(page);
    const room = page.locator('.community-room[data-room-id="' + checkpoint.groupId + '"]');
    await expect(room.getByRole('heading')).toHaveText(text.groupName);
    await keyboardFocus(page, room.getByRole('button', { name: t.openRoom, exact: true })); await page.keyboard.press('Enter'); await settled(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(text.groupName);
    await expect(page.getByText(m.closedNote, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: t.post, exact: true })).toHaveCount(0);
    await expect(page.getByText(t.connected, { exact: true })).toHaveCount(0);
    await axeMain(page); await keyboardFocus(page, page.getByRole('button', { name: t.back, exact: true })); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: t.announcements, exact: true }).click(); await settled(page);
    await sourceView(page, checkpoint, locale); controls.push(t.rooms, t.openRoom, m.closedNote, t.back, t.announcements);
  }
  return label;
}
const inputSnapshot = (page: Page) => page.locator('main input,main textarea,main select').evaluateAll(nodes => nodes.map(node => ({
  name: (node as HTMLInputElement).name, value: (node as HTMLInputElement).value, checked: (node as HTMLInputElement).checked ?? null,
})));
/** Observe actual locale/view states without adding mutations, then restore the
 * original English viewport, open source and draft/consent values. */
export async function observeCommunityView(page: Page, checkpoint: CustomerCommunityViewCheckpoint,
  original: { identity: HostedCommandJournalIdentity; journalHeadSha256: string; assertCurrent: () => Promise<void> },
  ports: { record: (receipt: CommunityViewReceipt) => Promise<void> }): Promise<void> {
  const originalViewport = page.viewportSize(); if (!originalViewport) throw Error('The current Community viewport is unavailable.');
  // Capture the baseline only after the original current reads and their DOM
  // have committed; a loading roster is not an empty consent/input inventory.
  await original.assertCurrent(); await settled(page); await sourceView(page, checkpoint, 'en'); await original.assertCurrent();
  const savedInputs = await inputSnapshot(page);
  let failure: unknown, restorationFailure: unknown;
  try {
    for (const locale of ['en', 'ar'] as const) {
      await original.assertCurrent(); await page.setViewportSize(viewport[locale]);
      await page.getByRole('button', { name: locale === 'en' ? 'English' : 'العربية', exact: true }).click(); await settled(page); await original.assertCurrent();
      const source = await sourceView(page, checkpoint, locale);
      const keyboardControl = await safeDisclosure(page, checkpoint, locale, source.controls); await original.assertCurrent();
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const text200Percent = checkpoint.stage === 'DISCUSSION_READY' || checkpoint.stage === 'FAMILY_NOTIFICATION_READ';
      if (text200Percent) {
        await page.locator('html').evaluate(node => { node.style.fontSize = '200%'; }); await settled(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await sourceView(page, checkpoint, locale); await page.locator('html').evaluate(node => { node.style.fontSize = ''; });
      }
      await axeMain(page); await original.assertCurrent();
      await ports.record({ version: 1, stage: checkpoint.stage, role: checkpoint.role, locale, viewport: page.viewportSize()!, identity: structuredClone(original.identity),
        scopeGeneration: checkpoint.scopeGeneration, journalHeadSha256: original.journalHeadSha256,
        sourceSha256: hash({ groupId: checkpoint.groupId, postIds: checkpoint.postIds, announcementId: checkpoint.announcementId }), observedAt: new Date().toISOString(),
        heading: source.heading, controls: [...new Set(source.controls)], keyboardControl, keyboardVerified: true, axe: { completed: true, violations: 0 },
        reflow: { horizontalOverflow: false, text200Percent }, reducedMotion: true, nativeExecutionVerified: false, hostedAcceptance: false, customerReady: false });
    }
  } catch (error) { failure = error; } finally {
    try {
      await page.locator('html').evaluate(node => { node.style.fontSize = ''; }); await page.setViewportSize(originalViewport);
      await page.getByRole('button', { name: 'English', exact: true }).click(); await settled(page); await original.assertCurrent();
      await sourceView(page, checkpoint, 'en'); expect(await inputSnapshot(page)).toEqual(savedInputs);
    } catch (error) { restorationFailure = error; }
  }
  if (failure && restorationFailure) throw new AggregateError([failure, restorationFailure], 'Community view verification and restoration failed.');
  if (restorationFailure) throw restorationFailure;
  if (failure) throw failure;
}
