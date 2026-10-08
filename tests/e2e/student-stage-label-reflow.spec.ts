import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const locale of ['en', 'ar'] as const) test(`${locale}: enlarged student stages keep complete title and unknown status words`, async ({ page }) => {
 const root = resolve(import.meta.dirname, '../..');
 const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/home/student-desk.css'].map(file => readFileSync(resolve(root, file), 'utf8').replace(/@import[^;]+;/g, '')).join('\n');
 const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from'react';import{createRoot}from'react-dom/client';import{StudentTrailView}from'./apps/web/features/home/components/student-trail';
const title={en:['My learning','Feedback','Approved practice','Reflect','Recorded growth'],ar:['تعلّمي','الملاحظات','تدريب معتمد','تأمّل','نمو مسجّل']};const keys=['lesson','feedback','practice','reflect','grow'];const context={displayName:'Lina Hassan',schoolName:'Current school',availability:'ready',goal:null,task:null,stages:keys.map((key,index)=>({key,title:title['${locale}'][index],description:'Current stage',state:'unknown'})),feedback:null,upcoming:null,recognition:{status:'unavailable',totalPoints:null,periodLabel:null,currentMilestone:null,entries:[]},classChallenge:null,help:null,companion:{visible:false,name:'Foxi'}};const pixel='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>';const assets=Object.fromEntries(['background','foxi','lesson','work','feedback','practice','reflect','grow','milestone'].map(key=>[key,pixel]));createRoot(document.getElementById('root')).render(<div className='workspace'><StudentTrailView context={context} assets={assets} locale='${locale}'/></div>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-stage-assets', setup(builder) {
 builder.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
} }] });
 await page.setViewportSize({ width: 390, height: 900 });
 await page.setContent('<!doctype html><html lang="' + locale + '"><head><title>Current Student stage reflow</title><style>' + css + '</style></head><body><div id="root"></div></body></html>');
 await page.addScriptTag({ content: bundle.outputFiles[0].text }); await page.locator('.student-trail__stages').waitFor();
 await page.evaluate(() => document.documentElement.style.fontSize = '32px');
 const labels = await page.locator('.student-trail__stage strong,.student-trail__stage-status').evaluateAll(elements => elements.map(element => {
  const node = element.firstChild!, text = element.textContent!, box = element.getBoundingClientRect(); let offset = 0;
  const words = text.trim().split(/\s+/).map(word => { const start = text.indexOf(word, offset); offset = start + word.length; const range = document.createRange(); range.setStart(node, start); range.setEnd(node, offset); return { word, lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size }; });
  return { left: box.left, right: box.right, words };
 }));
 expect(labels.length).toBe(10);
 for (const label of labels) { expect(label.left).toBeGreaterThanOrEqual(-1); expect(label.right).toBeLessThanOrEqual(391); expect(label.words.every(word => word.lines === 1), 'Ordinary stage-title/status words need a readable track').toBe(true); }
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
