import { test, expect } from '@playwright/test';
import { openCurrentRestrictedRecord } from './restricted-reader';
const id = 'b8000000-0000-4000-8000-000000000001';

test('restricted reader opens a named current directory record and checks its exact private history identity', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://restricted.fixture.invalid/**', async route => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) });
  });
  await page.setContent(`<section class="restricted-directory"><h2>Current restricted notes</h2><button><span><strong><bdi>Current factual note</bdi></strong><small>Lina Hassan · School checking · Cedar</small></span></button></section><script>document.querySelector('.restricted-directory>button').onclick=()=>{document.querySelector('.restricted-directory').remove();const reader=document.createElement('article');reader.className='restricted-reader';reader.innerHTML='<h2>Current factual note</h2><p>Current school-authored context</p><button>Restricted revision history</button>';document.body.append(reader);let open=false;reader.querySelector('button').onclick=()=>{open=!open;if(open)fetch('https://restricted.fixture.invalid/v1/restricted-records/${id}/history');};};</script>`);
  const reader = await openCurrentRestrictedRecord(page, id, 'Current factual note','https://restricted.fixture.invalid');
  await expect(reader).toContainText('Current school-authored context');
  expect(requests).toEqual([`/v1/restricted-records/${id}/history`]);
});

test('restricted reader refuses an ambiguous title before opening either private source', async ({ page }) => {
  await page.setContent('<section class="restricted-directory"><button><strong>Same factual note</strong></button><button><strong>Same factual note</strong></button></section>');
  await expect(openCurrentRestrictedRecord(page, id, 'Same factual note','https://restricted.fixture.invalid')).rejects.toThrow();
  await expect(page.locator('.restricted-reader')).toHaveCount(0);
});

test('restricted continuation waits for returned directory titles before advancing another page', async ({ page }) => {
  const cursor='b8000000-0000-4000-8000-000000000002',requests:string[]=[];
  await page.route('https://restricted.fixture.invalid/**',async route=>{
    const url=new URL(route.request().url());requests.push(url.pathname+url.search);
    const source=url.pathname.endsWith('/history')?{items:[],nextCursor:null}:url.searchParams.get('cursor')===cursor?{items:[{id,title:'Current factual note'}],nextCursor:null}:{items:[{id:cursor,title:'Earlier current note'}],nextCursor:cursor};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(source)});
  });
  await page.setContent(`<section class="restricted-directory"><button><strong>First current note</strong></button><div><button aria-label="Load more: Current restricted notes">Load more</button></div></section><script>let cursor='',pending=false;const dir=document.querySelector('.restricted-directory'),more=dir.querySelector('div>button');function open(){dir.remove();const reader=document.createElement('article');reader.className='restricted-reader';reader.innerHTML='<h2>Current factual note</h2><button>Restricted revision history</button>';document.body.append(reader);let on=false;reader.querySelector('button').onclick=()=>{on=!on;if(on)fetch('https://restricted.fixture.invalid/v1/restricted-records/${id}/history');};}more.onclick=async()=>{if(pending){more.dataset.premature='true';return;}pending=true;const page=await(await fetch('https://restricted.fixture.invalid/v1/restricted-records?limit=100'+(cursor?'&cursor='+cursor:''))).json();setTimeout(()=>{for(const item of page.items){const choice=document.createElement('button');choice.innerHTML='<strong>'+item.title+'</strong>';if(item.id==='${id}')choice.onclick=open;dir.insertBefore(choice,dir.querySelector('div'));}cursor=page.nextCursor;pending=false;if(!cursor)more.remove();},150);};</script>`);
  await openCurrentRestrictedRecord(page,id,'Current factual note','https://restricted.fixture.invalid');
  expect(requests).toEqual(['/v1/restricted-records?limit=100',`/v1/restricted-records?limit=100&cursor=${cursor}`,`/v1/restricted-records/${id}/history`]);
});

test('restricted continuation refuses the requested cursor returning unchanged', async ({ page }) => {
  const cursor='b8000000-0000-4000-8000-000000000002';let requests=0;
  await page.route('https://restricted.fixture.invalid/**',async route=>{requests++;await route.fulfill({contentType:'application/json',body:JSON.stringify({items:[],nextCursor:cursor})});});
  await page.setContent(`<section class="restricted-directory"><div><button aria-label="Load more: Current restricted notes">Load more</button></div></section><script>document.querySelector('button').onclick=()=>fetch('https://restricted.fixture.invalid/v1/restricted-records?limit=100&cursor=${cursor}');</script>`);
  await expect(openCurrentRestrictedRecord(page,id,'Current factual note','https://restricted.fixture.invalid')).rejects.toThrow();expect(requests).toBe(1);
});

test('a foreign origin cannot supply the current restricted directory continuation',async({page})=>{
 page.setDefaultTimeout(1000);
 await page.route('https://foreign.fixture.invalid/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items:[{id,title:'Current factual note'}],nextCursor:null})}));
 await page.setContent(`<section class="restricted-directory"><div><button aria-label="Load more: Current restricted notes">Load more</button></div></section><script>document.querySelector('button').onclick=async()=>{await fetch('https://foreign.fixture.invalid/v1/restricted-records?limit=100');document.querySelector('.restricted-directory').remove();const r=document.createElement('article');r.className='restricted-reader';r.innerHTML='<h2>Current factual note</h2><button>Restricted revision history</button>';document.body.append(r);r.querySelector('button').onclick=()=>fetch('https://foreign.fixture.invalid/v1/restricted-records/${id}/history');};</script>`);
 await expect(openCurrentRestrictedRecord(page,id,'Current factual note','https://restricted.fixture.invalid')).rejects.toThrow();
});

test('a foreign origin cannot supply exact-path restricted history',async({page})=>{
 page.setDefaultTimeout(1000);
 await page.route('https://foreign.fixture.invalid/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({items:[],nextCursor:null})}));
 await page.setContent(`<section class="restricted-directory"><button><strong>Current factual note</strong></button></section><script>document.querySelector('button').onclick=()=>{document.querySelector('.restricted-directory').remove();const r=document.createElement('article');r.className='restricted-reader';r.innerHTML='<h2>Current factual note</h2><button>Restricted revision history</button>';document.body.append(r);r.querySelector('button').onclick=()=>fetch('https://foreign.fixture.invalid/v1/restricted-records/${id}/history');};</script>`);
 await expect(openCurrentRestrictedRecord(page,id,'Current factual note','https://restricted.fixture.invalid')).rejects.toThrow();
});

test('an undelivered current directory body cannot advance or open the restricted reader',async({page})=>{
 page.setDefaultTimeout(1000);
 let held:import('@playwright/test').Route|null=null;
 await page.route('https://restricted.fixture.invalid/**',route=>{held=route;});
 await page.setContent(`<section class="restricted-directory"><div><button aria-label="Load more: Current restricted notes">Load more</button></div></section><script>document.querySelector('button').onclick=()=>fetch('https://restricted.fixture.invalid/v1/restricted-records?limit=100');</script>`);
 const reading=openCurrentRestrictedRecord(page,id,'Current factual note','https://restricted.fixture.invalid').then(()=>({failed:false}),()=>({failed:true}));
 await expect.poll(()=>held!==null).toBe(true);await expect(page.locator('.restricted-reader')).toHaveCount(0);
 await held!.abort('failed');expect(await reading).toEqual({failed:true});
});

test('an undelivered current history body cannot settle the exact restricted receipt',async({page})=>{
 page.setDefaultTimeout(1000);let held:import('@playwright/test').Route|null=null;
 await page.route('https://restricted.fixture.invalid/**',route=>{held=route;});
 await page.setContent(`<section class="restricted-directory"><button><strong>Current factual note</strong></button></section><script>document.querySelector('button').onclick=()=>{document.querySelector('.restricted-directory').remove();const r=document.createElement('article');r.className='restricted-reader';r.innerHTML='<h2>Current factual note</h2><button>Restricted revision history</button>';document.body.append(r);r.querySelector('button').onclick=()=>fetch('https://restricted.fixture.invalid/v1/restricted-records/${id}/history');};</script>`);
 let settled=false;const reading=openCurrentRestrictedRecord(page,id,'Current factual note','https://restricted.fixture.invalid').then(()=>{settled=true;return{failed:false}},()=>({failed:true}));
 await expect.poll(()=>held!==null).toBe(true);expect(settled).toBe(false);await held!.abort('failed');expect(await reading).toEqual({failed:true});
});
