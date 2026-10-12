import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
async function mount(page:Page,locale:'en'|'ar',theme:'light'|'dark') {
  const script=await build({stdin:{resolveDir:root,loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import{SchoolDayRecords}from'./apps/web/features/school/components/school-day-records';import{IconButton}from'@cuevo/ui';globalThis.controlApp={locale:'${locale}',membership:{role:'student'},accessGeneration:1};globalThis.controlCalls={clicks:0,keys:0};const timetable=[{id:'current-session',dayOfWeek:1,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',startsAt:'09:00',endsAt:'10:00',subjectName:'Current subject',className:'Cedar',teacherName:'Current teacher',location:'Room A'}];createRoot(document.getElementById('root')).render(<main className='workspace' data-theme='${theme}'><h1>Current controls</h1><SchoolDayRecords attendance={[]} timetable={timetable} calendar={[]} policy={{parentUpcomingVisible:false,parentAttendanceVisible:false}} day='2026-10-12' onDayChange={()=>{}}/><div style={{padding:24}}><IconButton label='${locale==='ar'?'تحديث المصدر الحالي':'Refresh current source'}' icon='refresh' onClick={()=>globalThis.controlCalls.clicks++} onKeyDown={()=>globalThis.controlCalls.keys++}/><button id='outside'>Outside control</button></div></main>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',plugins:[{name:'current-session-and-images',setup(b){b.onLoad({filter:/shared[\\/]session[\\/]providers\.tsx$/},()=>({loader:'js',contents:'export function useApp(){return globalThis.controlApp}'}));b.onLoad({filter:/\.(webp|png|svg)$/},args=>({loader:'js',contents:'export default '+JSON.stringify({src:'data:image/webp;base64,'+readFileSync(args.path).toString('base64'),width:128,height:128})}));}}]});
  const css=['packages/ui/src/tokens.css','apps/web/app/globals.css','apps/web/features/school/styles.css'].map(p=>readFileSync(resolve(root,p),'utf8')).join('\n');
  await page.setViewportSize({width:390,height:844});
  await page.setContent(`<html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><head><title>Current controls</title><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({content:script.outputFiles[0].text});
}
for(const locale of ['en','ar'] as const)for(const theme of ['light','dark'] as const) {
  test(`${locale}/${theme}: current timetable disclosure retains the shared touch target and native keyboard action`,async({page})=>{
    await mount(page,locale,theme);const summary=page.locator('.school-day-timeline summary');await expect(summary).toBeVisible();
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await summary.focus();await page.keyboard.press('Enter');await expect(summary.locator('..')).toHaveAttribute('open','');await expect(summary).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
  test(`${locale}/${theme}: icon guidance dismisses with Escape without losing focus or the caller action`,async({page})=>{
    await mount(page,locale,theme);const button=page.getByRole('button',{name:locale==='ar'?'تحديث المصدر الحالي':'Refresh current source',exact:true}),tooltip=button.locator('.cuevo-icon-button__tooltip');
    await button.focus();await expect(tooltip).toBeVisible();await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();await expect(button).toBeFocused();
    await page.keyboard.press('Enter');expect(await page.evaluate(()=>(globalThis as unknown as{controlCalls:{clicks:number;keys:number}}).controlCalls.clicks)).toBe(1);
    await button.dispatchEvent('mouseover');await expect(tooltip).toBeHidden();await expect(button).toBeFocused();
    await page.locator('#outside').focus();await button.focus();await expect(tooltip).toBeVisible();
    expect(await button.getAttribute('title')).toBeNull();
  });
  test(`${locale}/${theme}: pointer can move onto guidance and it remains until leaving the control`,async({page})=>{
    await mount(page,locale,theme);const button=page.getByRole('button',{name:locale==='ar'?'تحديث المصدر الحالي':'Refresh current source',exact:true}),tooltip=button.locator('.cuevo-icon-button__tooltip');
    await button.hover();await expect(tooltip).toBeVisible();const rect=(await tooltip.boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await expect(tooltip).toBeVisible();
    expect(await tooltip.evaluate(e=>getComputedStyle(e).boxShadow)).not.toBe('none');await tooltip.click();expect(await page.evaluate(()=>(globalThis as unknown as{controlCalls:{clicks:number}}).controlCalls.clicks)).toBe(0);await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();await page.mouse.move(0,0);await expect(tooltip).toBeHidden();
  });
}
