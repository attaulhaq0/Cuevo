import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportSourceView } from '../components/report-source';
import { reportSourceContext, type Post } from '../model';
Object.assign(globalThis,{React});
const post:Post={id:'internal-source',roomId:'room',actorId:'private-actor',authorName:'Maya Reed',body:'I checked the source <script>unsafe</script>',replyToId:null,createdAt:'2026-10-02T00:00:00Z',status:'VISIBLE',reactions:[]};
test('report review shows the exact message author time and escaped body before the decision',()=>{
 const html=renderToStaticMarkup(createElement(ReportSourceView,{source:reportSourceContext(post.id,'room',[post],true),locale:'en'}));
 assert.match(html,/Maya Reed/);assert.match(html,/dateTime="2026-10-02T00:00:00Z"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|internal-source|private-actor/);
});
test('hidden and unloaded message context stay distinct without leaking bodies',()=>{
 const hidden=renderToStaticMarkup(createElement(ReportSourceView,{source:reportSourceContext(post.id,'room',[{...post,status:'HIDDEN',body:null}],true),locale:'en'}));
 const missing=renderToStaticMarkup(createElement(ReportSourceView,{source:reportSourceContext(post.id,'room',[],true),locale:'ar'}));
 assert.match(hidden,/hidden/);assert.doesNotMatch(hidden,/I checked|unsafe/);assert.doesNotMatch(missing,/Maya Reed|I checked|internal-source/);
});
