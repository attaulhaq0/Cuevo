import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
test('Parent selected-work queue leaves a readable title lane beside one reader', async ({ page }) => {
  const script = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';import{createRoot}from'react-dom/client';import{ParentPortfolioReading}from'./apps/web/features/portfolio/components/parent-reading';
    const item={id:'00000000-0000-4000-8000-000000000001',revisionId:'00000000-0000-4000-8000-000000000002',revision:1,learnerId:'child',title:'My checking reflection and next learning step',reflection:'I explained the checking step.',createdAt:'2026-10-05T00:00:00Z',feedback:'The teacher reviewed the exact source.',featured:false,approvalState:'REVIEWED',parentVisible:true,reviewedAt:'2026-10-05T01:00:00Z',evidenceId:'evidence',resultId:'result',submissionId:'submission',referenceId:'reference',referenceVersion:'school-1',policyVersion:1,sourceModel:'numeric',submissionKind:'TEXT',sourceWorkApproved:true,responseKind:'TEXT',nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:1},assessmentTitle:'Explain a check',referenceTitle:'Checking steps',identity:{status:'READY',learnerName:'Lina',className:'Cedar',yearGroupName:'Year 1',academicYearName:'2026–2027',courseTitle:'School reasoning',assessmentTitle:'Explain a check',submittedAt:'2026-10-05T00:00:00Z',submissionRevision:1}};
    globalThis.parentLayoutApp={locale:'en',membership:{school:{name:'Current school'}},accessGeneration:1};createRoot(document.getElementById('root')).render(<main className='workspace'><h1>Portfolio</h1><ParentPortfolioReading items={[item]} childId='child' current/></main>);
  ` }, plugins: [{ name: 'current-parent-context', setup(bundler) {
    bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.parentLayoutApp}' }));
    bundler.onLoad({ filter: /\.(webp|svg|png)$/ }, args => ({ loader: 'js', contents: 'export default ' + JSON.stringify({ src: 'data:image/' + (args.path.endsWith('.svg') ? 'svg+xml' : args.path.endsWith('.png') ? 'png' : 'webp') + ';base64,' + readFileSync(args.path).toString('base64'), width: 128, height: 128 }) }));
  } }] });
  const css = ['packages/ui/src/tokens.css', 'apps/web/app/globals.css', 'apps/web/features/portfolio/styles.css'].map(file => readFileSync(resolve(root, file), 'utf8')).join('\n');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.setContent(`<style>${css}body{margin:0}.workspace{padding:16px}</style><div id="root"></div>`);
  await page.addScriptTag({ content: script.outputFiles[0].text });
  const directory = page.locator('.parent-portfolio-directory');
  await directory.getByRole('button', { name: 'Open approved item', exact: true }).click();
  await expect(page.locator('[data-parent-portfolio-id]')).toHaveCount(1);
  const title = directory.getByRole('heading', { name: 'My checking reflection and next learning step', exact: true });
  const titleBounds = (await title.boundingBox())!, rowBounds = (await directory.locator('li').boundingBox())!;
  expect(titleBounds.width, 'The queue title uses its row width instead of the small space left beside a wide action').toBeGreaterThan(rowBounds.width * .7);
  expect(titleBounds.height, 'The ordinary title does not become a tall single-word column').toBeLessThan(140);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-parent-portfolio-id]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
