import { test, expect } from '@playwright/test';
import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace } from './trail-workspace';

const fixture = `<div class="workspace-chrome" lang="en"><header class="workspace-chrome__header"><div class="workspace-chrome__school"><bdi>Reference school</bdi></div><div class="workspace-chrome__person"><button aria-label="Profile and settings" aria-expanded="false" popovertarget="profile"><strong>Lina Hassan</strong><small>Student</small></button><div id="profile" popover="auto" class="workspace-chrome__profile"><button data-open-access>Access settings</button><button data-signout>Sign out</button></div></div></header><nav class="workspace-chrome__navigation" aria-label="Workspace navigation"><button data-workspace-destination="overview" aria-current="page">Overview</button><button data-workspace-destination="learning">Learning</button></nav><main><h1>Hello, Lina Hassan!</h1></main></div><script>const trigger=document.querySelector('[popovertarget]');document.querySelector('#profile').addEventListener('toggle',e=>trigger.setAttribute('aria-expanded',String(e.newState==='open')));document.querySelector('[data-open-access]').onclick=()=>{document.querySelector('main').innerHTML='<h1>Your school access</h1>';document.querySelector('#profile').hidePopover();};document.querySelector('[data-signout]').onclick=()=>{document.querySelector('.workspace-chrome').remove();document.body.innerHTML='<form class="auth-form"><label>School email<input type="email"></label><label>Password<input type="password"></label><button type="submit">Sign in</button></form>';};</script>`;

test('Trail browser helper verifies current identity then reaches access and sign-out through the visible profile', async ({ page }) => {
  await page.setContent(fixture); await expectTrailWorkspace(page, 'student');
  await openTrailWorkspace(page, 'Access settings'); await expect(page.getByRole('heading', { name: 'Your school access', exact: true })).toBeVisible();await expect(page.locator('.workspace-chrome__person > button')).toHaveAttribute('aria-expanded','false');
  await signOutTrailWorkspace(page); await expect(page.getByLabel('School email', { exact: true })).toBeVisible();
});
test('Trail browser readiness refuses missing identity and an unexpected role', async ({ page }) => {
  await page.setContent(fixture);
  const role = page.locator('.workspace-chrome__person > button small');
  await role.evaluate(element => { element.textContent = 'Current role is not available'; });
  await expect(role).toHaveText('Current role is not available');
  await expect(expectTrailWorkspace(page, 'student')).rejects.toThrow();
  await role.evaluate(element => { element.textContent = 'Teacher'; });
  await expect(expectTrailWorkspace(page, 'student')).rejects.toThrow();
  await page.locator('.workspace-chrome__school bdi').evaluate(element => { element.textContent = ''; });
  await expect(expectTrailWorkspace(page)).rejects.toThrow();
});

test('sign-out reaches an offscreen native profile after its document scroll has settled', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<style>body{margin:0}main{min-height:1800px}.workspace-chrome__profile{position:fixed;inset:60px 12px auto auto;margin:0}</style>${fixture}`);
  await page.evaluate(() => {
    const profile = document.querySelector<HTMLDivElement>('#profile')!;
    document.addEventListener('scroll', event => { if (profile.matches(':popover-open') && !(event.target instanceof Node && profile.contains(event.target))) profile.hidePopover(); }, true);
    window.scrollTo(0, 900);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);
  const trigger = page.locator('.workspace-chrome__person > button');
  const bounds = (await trigger.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThan(0);
  await openTrailWorkspace(page, 'Access settings');
  await expect(page.getByRole('heading', { name: 'Your school access', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 900));
  await signOutTrailWorkspace(page);
  await expect(page.getByLabel('School email', { exact: true })).toBeVisible();
  await expect(page.locator('.workspace-chrome')).toHaveCount(0);
});
