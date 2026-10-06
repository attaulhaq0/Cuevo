import{test}from'vitest';
import assert from'node:assert/strict';
import React,{createElement}from'react';
import{renderToStaticMarkup}from'react-dom/server';
import{WorkspaceNavigationContent,WorkspaceNavigationProvider,WorkspaceNavigationHost}from'../src/workspace-navigation-slot';
Object.assign(globalThis,{React});
test('live owner navigation remains inline without a host and waits deterministically in focused server markup',()=>{
 const controls=createElement('nav',{'aria-label':'Current chapters'},createElement('a',{href:'#evidence'},'Academic evidence'));
 assert.match(renderToStaticMarkup(createElement(WorkspaceNavigationContent,null,controls)),/href="#evidence"/);
 const focused=renderToStaticMarkup(createElement(WorkspaceNavigationProvider,{enabled:true},createElement(React.Fragment,null,createElement(WorkspaceNavigationHost),createElement(WorkspaceNavigationContent,null,controls))));
 assert.match(focused,/data-workspace-sections/);assert.doesNotMatch(focused,/Current chapters|Academic evidence/);
 const inline=renderToStaticMarkup(createElement(WorkspaceNavigationProvider,{enabled:false},createElement(WorkspaceNavigationContent,null,controls)));assert.match(inline,/Academic evidence/);
});
