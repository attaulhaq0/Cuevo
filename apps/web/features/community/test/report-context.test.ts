import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportSourceView } from '../components/report-source';
import { reportSourceContext, type Post } from '../model';
import { createRequire } from 'node:module';
type RenderedElement = { textContent: string; querySelector(selector: string): RenderedElement | null; querySelectorAll(selector: string): RenderedElement[]; getAttribute(name: string): string | undefined };
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser') as { parse(html: string): RenderedElement };
Object.assign(globalThis,{React});
const post:Post={id:'internal-source',roomId:'room',actorId:'private-actor',authorName:'Maya Reed',body:'I checked the source <script>unsafe</script>',replyToId:null,createdAt:'2026-10-02T00:00:00Z',status:'VISIBLE',reactions:[]};
test('report review renders the exact author time and message as text, including mixed-case markup',()=>{
 for(const body of [post.body, 'Uppercase <SCRIPT>alert(1)</SCRIPT> and <IMG src=x onerror=alert(1)>']){
  const source={...post,body};const html=renderToStaticMarkup(createElement(ReportSourceView,{source:reportSourceContext(source.id,'room',[source],true),locale:'en'}));const document=parse(html);
  assert.equal(document.querySelector('.community-report-source > p bdi')?.textContent,source.authorName);
  assert.equal(document.querySelector('time')?.getAttribute('dateTime'),source.createdAt);
  assert.equal(document.querySelector('.community-message')?.textContent,body);
  assert.equal(document.querySelectorAll('script').length,0);assert.equal(document.querySelectorAll('img').length,0);
  assert.equal(html.includes('internal-source'),false);assert.equal(html.includes('private-actor'),false);
 }
});
test('hidden and unloaded message context stay distinct without leaking bodies',()=>{
 const hidden=renderToStaticMarkup(createElement(ReportSourceView,{source:reportSourceContext(post.id,'room',[{...post,status:'HIDDEN',body:null}],true),locale:'en'}));
 const missing=renderToStaticMarkup(createElement(ReportSourceView,{source:reportSourceContext(post.id,'room',[],true),locale:'ar'}));
 assert.match(hidden,/hidden/);assert.doesNotMatch(hidden,/I checked|unsafe/);assert.doesNotMatch(missing,/Maya Reed|I checked|internal-source/);
});
