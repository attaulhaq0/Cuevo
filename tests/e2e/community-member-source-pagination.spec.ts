import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { communityEn, communityAr } from '../../apps/web/features/community/messages';

const root = resolve(import.meta.dirname, '../..');
const id = (n: number) => `ea000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cursor = id(5);

async function mount(page: Page, locale: 'en' | 'ar', owner: 'members' | 'group') {
  const room = { id: id(3), classId: id(1), name: 'Current group', type: 'GROUP', ownerId: id(2), status: 'ACTIVE', canModerate: true, canPost: true, privateTopic: `cuevo:school:${id(1)}:room:${id(3)}` };
  const classRoom = { ...room, id: id(4), name: 'Current class room', type: 'CLASS', privateTopic: `cuevo:school:${id(1)}:room:${id(4)}` };
  const reads: string[] = [];
  let continuationReads = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {RoomDiscussion} from './apps/web/features/community/components/room-discussion';import {CommunityWorkspace} from './apps/web/features/community/components/community-workspace';import {CommandJournal} from './apps/web/shared/api/client';import {FormDrafts} from './apps/web/shared/session/form-drafts';import {getDictionary} from './apps/web/shared/i18n/locale';
globalThis.communityPagingApp={locale:'${locale}',dictionary:getDictionary('${locale}'),membership:{schoolId:'${id(1)}',userId:'${id(2)}',role:'teacher',entitlements:['community']},status:'ready',online:true,apiUrl:'https://community-paging.fixture.invalid',accessToken:'fictional',accessGeneration:1,commandJournal:new CommandJournal(),formDrafts:new FormDrafts(),announce(){},reportDiagnostic(){},refreshAccess(){}};createRoot(document.getElementById('root')).render(<main className="workspace">${owner === 'members' ? `<RoomDiscussion room={${JSON.stringify(room)}} onBack={()=>{}}/>` : '<CommunityWorkspace/>'}</main>);
` }, plugins: [{ name: 'controlled-session-realtime-assets', setup(builder) {
    builder.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.communityPagingApp}' }));
    builder.onLoad({ filter: /shared[\\/]realtime[\\/]use-private-channel\.ts$/ }, () => ({ loader: 'js', contents: 'export function usePrivateChannel(){return "unavailable"}' }));
    builder.onLoad({ filter: /\.(png|webp|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  await page.route('https://community-paging.fixture.invalid/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/probe') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><div id="root"></div></html>` });
    expect(route.request().method()).toBe('GET');
    reads.push(url.pathname + url.search);
    if (url.pathname === '/v1/community/rooms') return route.fulfill({ json: { items: [room, classRoom], nextCursor: null } });
    if (url.pathname === '/v1/classes') return route.fulfill({ json: { items: [{ id: id(1), name: 'Cedar' }], nextCursor: null } });
    if (url.pathname === `/v1/community/rooms/${id(4)}/roster`) {
      if (!url.searchParams.has('cursor')) return route.fulfill({ json: { items: owner === 'group' ? [{ id: id(2), displayName: 'Current teacher', role: 'teacher' }] : [], nextCursor: cursor } });
      continuationReads++;
      if (continuationReads === 1) return route.fulfill({ status: 503, json: { code: 'REQUEST_UNAVAILABLE' } });
      return route.fulfill({ json: { items: [{ id: id(6), displayName: 'Current learner', role: 'student' }], nextCursor: null } });
    }
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto('https://community-paging.fixture.invalid/probe');
  await page.addStyleTag({ content: ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/community/styles.css'].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const copy = locale === 'ar' ? communityAr : communityEn;
  if (owner === 'group') {
    await page.getByRole('button', { name: copy.createGroup, exact: true }).click();
    await page.getByLabel(copy.class, { exact: true }).selectOption(id(1));
  }
  return { copy, reads, errors };
}

for (const locale of ['en', 'ar'] as const) for (const owner of ['members', 'group'] as const) {
  test(`${locale}: current ${owner} continuation and retry stay reachable while command fields are source-locked`, async ({ page }) => {
    const { copy, reads, errors } = await mount(page, locale, owner);
    const command = owner === 'members' ? page.getByRole('region', { name: copy.members, exact: true }) : page.getByRole('region', { name: copy.createGroup, exact: true }).last();
    const field = owner === 'members' ? command.getByLabel(copy.actor, { exact: true }) : command.getByLabel(copy.roomName, { exact: true });
    const submit = command.locator('button[type="submit"]');
    const continuation = page.locator(`[data-page-cursor="${cursor}"]`);
    await expect(continuation).toBeEnabled();
    await expect(field).toBeDisabled();
    await expect(submit).toBeDisabled();
    await continuation.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(continuation).toBeEnabled();
    await expect(field).toBeDisabled();
    await expect(submit).toBeDisabled();
    await continuation.click();
    if (owner === 'members') await expect(field.locator('option', { hasText: 'Current learner' })).toHaveCount(1);
    else await expect(page.getByRole('checkbox', { name: 'Current learner', exact: true })).toBeEnabled();
    await expect(field).toBeEnabled();
    await expect(submit).toBeEnabled();
    await expect(continuation).toHaveCount(0);
    expect(reads.filter(path => path.includes(`/rooms/${id(4)}/roster`) && path.includes('cursor='))).toHaveLength(2);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (globalThis as unknown as { communityPagingApp: { commandJournal: { pending(): unknown[] } } }).communityPagingApp.commandJournal.pending())).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    }
  });
}
