import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const locale of ['en', 'ar'] as const) test(`${locale}: enlarged access capability cards fit their reading column`, async ({ page }) => {
 const root = resolve(import.meta.dirname, '../..');
 const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/shell/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8').replace(/@import[^;]+;/g, '')).join('\n');
 const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from'react';import{createRoot}from'react-dom/client';import{WorkspaceAccessView}from'./apps/web/features/shell/components/workspace-access';import{getDictionary}from'./apps/web/shared/i18n/locale';
const membership={role:'student',schoolId:'ea000000-0000-4000-8000-000000000001',userId:'ea000000-0000-4000-8000-000000000002',membershipId:'ea000000-0000-4000-8000-000000000003',displayName:'Lina Hassan',school:{id:'ea000000-0000-4000-8000-000000000001',name:'Current school'},entitlements:['learning','assessment','learner.state','community','portfolio','development']};
createRoot(document.getElementById('root')).render(<div className='workspace' dir='${locale === 'ar' ? 'rtl' : 'ltr'}'><main className='workspace-main'><WorkspaceAccessView membership={membership} onRefresh={()=>{}} locale='${locale}' dictionary={getDictionary('${locale}')}/></main></div>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-access-assets', setup(builder) {
 builder.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
} }] });
 await page.setViewportSize({ width: 390, height: 900 });
 await page.setContent('<!doctype html><html lang="' + locale + '"><head><title>Current Access reflow</title><style>' + css + '</style></head><body><div id="root"></div></body></html>');
 await page.addScriptTag({ content: bundle.outputFiles[0].text });
 await page.locator('.workspace-access__capabilities > ul').waitFor();
 await page.evaluate(() => document.documentElement.style.fontSize = '32px');
 const geometry = await page.locator('.workspace-access__capabilities > ul').evaluate(list => {
  const outer = list.getBoundingClientRect(); return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, cards: [...list.children].map(child => { const rect = child.getBoundingClientRect(); return { left: rect.left, right: rect.right, parentLeft: outer.left, parentRight: outer.right }; }) };
 });
 expect(geometry.cards.length).toBe(6);
 for (const card of geometry.cards) { expect(card.left).toBeGreaterThanOrEqual(card.parentLeft - 1); expect(card.right).toBeLessThanOrEqual(card.parentRight + 1); }
 expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
});
