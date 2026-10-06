import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EnvironmentDetails } from '../components/environment-details.tsx';

test('optional account help stays closed and does not infer the school data environment in either language',()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'React');
  Object.defineProperty(globalThis,'React',{value:React,configurable:true});
  try {
    for(const locale of ['en','ar'] as const){
      const html=renderToStaticMarkup(React.createElement(EnvironmentDetails,{locale}));
      assert.match(html,/<details[^>]*><summary>/);
      assert.doesNotMatch(html,/<details[^>]* open|role="alert"|<footer|fictional|synthetic|production.ready|customer.ready|officially verified|اصطناعية|تجريبية|جاهز.*الإنتاج/);
      assert.match(html,locale==='en'?/Source and approval details/:/تفاصيل المصادر والموافقات/);
    }
  } finally {if(prior)Object.defineProperty(globalThis,'React',prior);else Reflect.deleteProperty(globalThis,'React');}
});
