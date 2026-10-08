import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

for (const locale of ['en', 'ar'] as const) test(`${locale}: parent heading keeps focus when current child records settle`, async ({ page }) => {
 const root = resolve(import.meta.dirname, '../..');
 const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';import{ParentTrailHomeView}from'./apps/web/features/home/components/parent-trail-home';
const ready={availability:'ready',child:{status:'ready',key:'current-child',name:'Lina Hassan',classLabel:null,schoolName:null},snapshot:{childKey:'current-child',status:'ready',feedback:null,portfolio:null,upcoming:[],communication:null,support:null}};
function H(){const[state,setState]=useState('resolving'),heading=useRef(null);globalThis.parentHeadingState=value=>setState(value);const context={...ready,child:state==='resolving'?{status:'resolving'}:ready.child,availability:state==='denied'?'denied':state==='offline'?'offline':'ready',selector:<input aria-label='Current child selector' defaultValue='Keep my current selection'/>};return<main><ParentTrailHomeView context={context} locale='${locale}' headingRef={heading}/><input aria-label='Unsent note' defaultValue='Keep my unsent note'/></main>}createRoot(document.getElementById('root')).render(<H/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'current-parent-assets', setup(builder) {
 builder.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
} }] });
 const requests: string[] = [];
 await page.route('**/*', route => { requests.push(route.request().method()); return route.abort(); });
 await page.setViewportSize({ width: 834, height: 900 });
 await page.setContent('<!doctype html><html><head><title>Parent current heading verification</title></head><body><div id="root"></div></body></html>');
 await page.addScriptTag({ content: bundle.outputFiles[0].text });
 const heading = page.getByRole('heading', { level: 1 });
 await expect(heading).toHaveCount(1); await heading.focus();
 const original = await heading.elementHandle();
 if (!original) throw Error('Current heading is missing');
 await page.evaluate(() => (globalThis as unknown as { parentHeadingState: (value: string) => void }).parentHeadingState('ready'));
 await expect(heading).toContainText('Lina Hassan');
 expect(await heading.evaluate((element, before) => element === before, original), 'Settling child data must preserve the actual heading node').toBe(true);
 await expect(heading).toBeFocused();
 const selector = page.getByRole('textbox', { name: 'Current child selector', exact: true });
 await selector.focus(); await expect(selector).toBeFocused();
 await page.evaluate(() => (globalThis as unknown as { parentHeadingState: (value: string) => void }).parentHeadingState('resolving'));
 await expect(heading).not.toContainText('Lina Hassan');
 await page.evaluate(() => (globalThis as unknown as { parentHeadingState: (value: string) => void }).parentHeadingState('ready'));
 await expect(heading).toContainText('Lina Hassan'); await expect(selector).toBeFocused();
 await expect(page.getByRole('textbox', { name: 'Unsent note', exact: true })).toHaveValue('Keep my unsent note');
 for (const state of ['denied', 'offline']) {
  await heading.focus();
  await page.evaluate(value => (globalThis as unknown as { parentHeadingState: (value: string) => void }).parentHeadingState(value), state);
  expect(await heading.evaluate((element, before) => element === before, original)).toBe(true); await expect(heading).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Current child selector', exact: true })).toHaveCount(0); await expect(heading).not.toContainText('Lina Hassan');
 }
 await original.dispose(); expect(requests).toEqual([]);
});
