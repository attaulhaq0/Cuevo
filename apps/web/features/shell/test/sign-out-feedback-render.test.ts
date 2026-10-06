import assert from'node:assert/strict';
import test from'node:test';
import{registerHooks}from'node:module';
import React,{createElement}from'react';
import{renderToStaticMarkup}from'react-dom/server';
import{getDictionary}from'../../../shared/i18n/locale.ts';
const fixture={app:{}as Record<string,unknown>,view:'access',calls:0};Object.assign(globalThis,{React,shellSignOutRender:fixture});
registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');
 if(path.endsWith('/shared/session/providers.tsx'))return{format:'module',shortCircuit:true,source:'export function useApp(){return globalThis.shellSignOutRender.app}'};
 if(path.endsWith('/node_modules/next/navigation.js'))return{format:'module',shortCircuit:true,source:'export function usePathname(){return "/"}export function useSearchParams(){return new URLSearchParams("view="+globalThis.shellSignOutRender.view)}'};
 return next(url,context);
}});
const{Workspace}=await import('../components/workspace.tsx');
test('actual Shell starts deterministically without fabricated sign-out failure or session changes in every role',()=>{
 for(const locale of['en','ar']as const)for(const role of['student','teacher','coordinator','parent','admin']as const)for(const view of['account','access']){
  fixture.view=view;const dictionary=getDictionary(locale),membership={role,schoolId:'school',userId:'actor',membershipId:'membership',displayName:'Current person',school:{id:'school',name:'Current school'},entitlements:[]};fixture.app={locale,dictionary,membership,notice:null,noticeLocation:null,clearNotice(){},refreshAccess(){},signOut:async()=>{fixture.calls++;return false;}};
  const props={membership,theme:'light' as const,onThemeChange(){}};const html=renderToStaticMarkup(createElement(Workspace,props));assert.equal(html,renderToStaticMarkup(createElement(Workspace,props)));assert.equal(html.split(dictionary.signOutError).length-1,0);assert.equal((html.match(/role="alert"/g)??[]).length,0);assert.equal((html.match(/<main /g)??[]).length,1);assert.equal((html.match(/<h1/g)??[]).length,1);assert.ok(html.includes(dictionary.signOut));assert.ok(html.includes('Current person'));assert.equal(fixture.calls,0);
 }
});
