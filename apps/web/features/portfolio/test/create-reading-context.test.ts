import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandJournal } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { getDictionary } from '../../../shared/i18n/locale.ts';

const id='00000000-0000-4000-8000-000000000001';
const result={id,evidenceId:id,submissionId:id,learnerId:id,referenceId:id,referenceVersion:'source-1',createdAt:'2026-10-03T08:15:20Z',revision:2,status:'RELEASED',policyVersion:1,feedback:'Explain the recorded check.',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:1},assessmentTitle:'Checking methods',referenceTitle:'Explain your evidence'};
const fixture={app:{} as Record<string,unknown>};
Object.assign(globalThis,{React,portfolioCreateFixture:fixture});
// Preserve the real Portfolio/model/CommandForm owners; replace only private current read/session inputs.
registerHooks({load(url,context,nextLoad){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.portfolioCreateFixture.app}'};
 if(path.endsWith('/shared/hooks/use-paginated-query.ts'))return{format:'module',shortCircuit:true,source:'export function usePaginatedLearningQuery(path,parse){const f=globalThis.portfolioCreateFixture;return{data:path?.startsWith("/v1/results?")?[f.result].map(parse):[],loaded:true,loading:false,loadingMore:false,error:null,moreError:null,nextCursor:null,loadMore(){}}}'};
 return nextLoad(url,context);
}});
Object.assign(fixture,{result});
const{PortfolioWorkspace}=await import('../components/portfolio-workspace.tsx');
function render(locale:'en'|'ar'){
 const drafts=new FormDrafts();drafts.save(`school:${id}:/v1/portfolio/items`,{title:'Unsent title',reflection:'Unsent explanation.'},{});drafts.saveModel(`school:${id}:/v1/portfolio/items:released-source`,id);
 fixture.app={locale,dictionary:getDictionary(locale),online:true,status:'ready',accessGeneration:1,accessToken:'synthetic-token',apiUrl:'https://fixture.invalid',commandJournal:new CommandJournal(),formDrafts:drafts,refreshAccess(){},reportDiagnostic(){},selectChild(){},membership:{role:'student',schoolId:'school',userId:id,entitlements:['learning','assessment','curriculum','portfolio'],school:{name:'Reference school'}}};
 return renderToStaticMarkup(createElement(PortfolioWorkspace));
}
test('Portfolio create uses recorded result time in English and Arabic without inventing release time',()=>{
 for(const locale of ['en','ar']as const){const html=render(locale);
  assert.match(html,locale==='en'?/Result recorded:/:/سُجّلت النتيجة في:/);assert.doesNotMatch(html,locale==='en'?/Released:/:/صدر(?:ت)? في:/);
 }
});
test('Portfolio create coordinates source and original form headings beneath the page in both languages',()=>{
 for(const locale of ['en','ar']as const){const html=render(locale);
  const ranks=[...html.matchAll(/<h([1-6])(?:\s[^>]*)?>/g)].map(match=>Number(match[1]));assert.equal(ranks[0],1);assert.equal(ranks[1],2,'The first create section must follow the page heading');
  assert.equal(ranks.every((rank,index)=>index===0||rank<=ranks[index-1]+1),true,'No source/form heading skips a semantic level');
  assert.match(html,locale==='en'?/<h2[^>]*>[^]*?Choose your work<\/h2>/:/<h2[^>]*>[^]*?اختر عملك<\/h2>/);
  assert.match(html,/<h3[^>]*><bdi>Checking methods<\/bdi><\/h3>/);assert.match(html,/Unsent explanation\./);assert.match(html,/<strong>0<\/strong>/);
 }
});
