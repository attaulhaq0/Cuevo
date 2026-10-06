import { expect, type Locator, type Page } from '@playwright/test';
import { restrictedHistorySchema } from '@cuevo/contracts';

/** Open exactly the current note named by the independently captured command receipt. */
export async function openCurrentRestrictedRecord(page: Page, id: string, title: string, expectedApiOrigin: string): Promise<Locator> {
  expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(title.trim()).not.toBe('');
  const api=new URL(expectedApiOrigin);expect(api.origin).toBe(expectedApiOrigin);expect(api.username||api.password).toBe('');expect(api.protocol==='https:'||api.protocol==='http:'&&['localhost','127.0.0.1'].includes(api.hostname)).toBe(true);
  const isSource=(url:string,path:string)=>{const current=new URL(url);return current.origin===expectedApiOrigin&&current.pathname===path;};
  const directory = page.locator('.restricted-directory');
  await expect(directory).toBeVisible();
  const choice = directory.locator(':scope > button').filter({ has: page.locator('strong').getByText(title, { exact: true }) });
  const more = directory.getByRole('button', { name: /^(Load more: Current restricted notes|تحميل المزيد: الملاحظات المقيّدة الحالية)$/, exact: true });
  const cursors = new Set<string>();
  await expect(directory.getByRole('status').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0);
  for (let part = 0; !await choice.count() && part < 30; part++) {
    await expect(more).toHaveCount(1); await expect(more).toBeEnabled();
    const priorTitles=(await directory.locator(':scope > button strong').allTextContents()).map(label=>label.trim());
    const requested = page.waitForResponse(response => response.request().method() === 'GET' && isSource(response.url(),'/v1/restricted-records'));
    const [,response]=await Promise.all([more.click(),requested]); expect(response.ok()).toBe(true);expect(await response.finished()).toBeNull();
    const source = await response.json() as { items: { id: string; title: string }[]; nextCursor: string | null };
    expect(Array.isArray(source.items) && source.items.length <= 100).toBe(true);
    const ids = source.items.map(row => row.id); expect(new Set(ids).size).toBe(ids.length);
    const titles=source.items.map(row=>row.title);for(const label of titles){expect(typeof label).toBe('string');expect(label.trim().length).toBeGreaterThan(0);expect(label.length).toBeLessThanOrEqual(200);}
    for (const recordId of ids) expect(recordId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    if (source.nextCursor !== null) { expect(source.nextCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);expect(source.nextCursor).not.toBe(new URL(response.url()).searchParams.get('cursor')); expect(cursors.has(source.nextCursor)).toBe(false); cursors.add(source.nextCursor);expect(titles.length,'A continuing current page must expose records before another page can advance').toBeGreaterThan(0); }
    await expect(directory.getByRole('button', { name: /^(Loading more…|جارٍ تحميل المزيد…)/ })).toHaveCount(0);
    await expect.poll(async () => {
      const current=await directory.locator(':scope > button strong').allTextContents();
      const counts=(values:string[])=>values.reduce<Record<string,number>>((rows,label)=>({...rows,[label]:(rows[label]??0)+1}),{}),expected=counts([...priorTitles,...titles]),actual=counts(current.map(label=>label.trim()));
      return Object.entries(expected).every(([label,count])=>(actual[label]??0)>=count)&&await directory.getByRole('button',{name:/^(Loading more…|جارٍ تحميل المزيد…)/}).count()===0&&(source.nextCursor===null?await more.count()===0:await more.isEnabled());
    }).toBe(true);
  }
  await expect(choice).toHaveCount(1); await expect(choice).toBeVisible(); await expect(choice).toBeEnabled();
  await choice.click();
  const reader = page.locator('.restricted-reader'); await expect(reader).toHaveCount(1);
  await expect(reader.getByRole('heading', { name: title, level: 2, exact: true })).toBeVisible();
  // Explicit revision-history GET is the existing private receipt check; no selector uses an ID as its label.
  const history = page.waitForResponse(response => response.request().method() === 'GET' && isSource(response.url(),`/v1/restricted-records/${id}/history`));
  const [,response]=await Promise.all([reader.getByRole('button', { name: /^(Restricted revision history|سجل المراجعات المقيّد)$/, exact: true }).click(),history]);
  expect(response.ok()).toBe(true);expect(await response.finished()).toBeNull();restrictedHistorySchema.parse(await response.json());
  await reader.getByRole('button', { name: /^(Restricted revision history|سجل المراجعات المقيّد)$/, exact: true }).click();
  return reader;
}
