import { build } from 'esbuild';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

// Production shared controls with intercepted in-memory source. No application
// request, account, private record or command is sent by this fixture.
test('current section keeps its draft and reading position while a different enabled section activates once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const built = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{WorkspaceTabs}from'./packages/ui/src/workspace-tabs';
import{WorkspaceNavigationProvider,WorkspaceNavigationHost}from'./packages/ui/src/workspace-navigation-slot';
globalThis.sectionChanges=0;globalThis.sectionActivations=0;
function Harness(){const[selected,setSelected]=useState('rooms');return<WorkspaceNavigationProvider enabled onActivate={()=>globalThis.sectionActivations++}><WorkspaceNavigationHost/><WorkspaceTabs label='Current sections' selected={selected} items={[{id:'rooms',label:'Rooms',icon:'community'},{id:'updates',label:'Updates',icon:'feedback'},{id:'blocked',label:'Blocked',icon:'shield',disabled:true}]} onChange={id=>{globalThis.sectionChanges++;setSelected(id);}}/><main style={{height:150,overflowY:'scroll'}}><input aria-label='Unsent draft' defaultValue='Current source'/><div style={{height:1000}}>Current reading</div></main></WorkspaceNavigationProvider>}
createRoot(document.getElementById('root')).render(<Harness/>);` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    plugins: [{ name: 'source-owned-icons', setup(bundler) {
      bundler.onLoad({ filter: /\.(webp|png|svg)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/webp;base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
    } }],
  });
  await page.setContent('<html><head><title>Current section owner verification</title></head><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const current = page.getByRole('button', { name: 'Rooms', exact: true });
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Unsent draft').fill('Unsent exact source');
  await page.locator('main').evaluate(element => { element.scrollTop = 300; });
  await current.click(); await current.focus(); await page.keyboard.press('Enter');
  const counts = () => page.evaluate(() => ({ change: (globalThis as unknown as { sectionChanges: number }).sectionChanges, activation: (globalThis as unknown as { sectionActivations: number }).sectionActivations }));
  expect(await counts()).toEqual({ change: 0, activation: 0 });
  await expect(page.locator('main')).toHaveJSProperty('scrollTop', 300);
  await expect(page.getByLabel('Unsent draft')).toHaveValue('Unsent exact source');
  await page.getByRole('button', { name: 'Updates', exact: true }).click();
  expect(await counts()).toEqual({ change: 1, activation: 1 });
  await expect(page.getByRole('button', { name: 'Updates', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Blocked', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
