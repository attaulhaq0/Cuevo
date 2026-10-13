import { test } from 'vitest';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as UI from '../src/index.ts';
const pageUI = UI as typeof UI & { WorkspacePageHeading?: React.ComponentType<{ title: React.ReactNode; caption?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }>; WorkspacePageProvider?: React.ComponentType<{ helpLabel: string; help: React.ReactNode; children: React.ReactNode }> };

test('content heading owns one visible h1 and optional help never hides its context', () => {
  assert.equal(typeof pageUI.WorkspacePageHeading, 'function', 'Shared content heading must exist');
  assert.equal(typeof pageUI.WorkspacePageProvider, 'function', 'Generic help must have one presentational owner');
  const WorkspacePageHeading = pageUI.WorkspacePageHeading!, WorkspacePageProvider = pageUI.WorkspacePageProvider!;
  const render = () => renderToStaticMarkup(createElement(WorkspacePageProvider, { helpLabel: 'About Learning', help: 'School-authored learning material.', children: createElement(WorkspacePageHeading, { title: 'Your courses', description: 'Open a course.', actions: createElement('button', null, 'Add course') }) }));
  const html = render();
  assert.equal(html, render());
  assert.equal((html.match(/<h1 /g) ?? []).length, 1);
  assert.match(html, /tabindex="-1">Your courses<\/h1>/);
  assert.match(html, /<summary>About Learning<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /<button>Add course<\/button>/);
  assert.ok(html.indexOf('Open a course.') < html.indexOf('<details'));
});

test('selected heading preserves human context and supplied native source state outside help', () => {
  assert.equal(typeof pageUI.WorkspacePageHeading, 'function', 'Shared content heading must exist');
  const WorkspacePageHeading = pageUI.WorkspacePageHeading!;
  const html = renderToStaticMarkup(createElement(WorkspacePageHeading, { title: createElement('bdi', null, 'Reasoning practice'), caption: createElement('bdi', null, 'Mathematics · Class 6A'), description: createElement('span', null, 'Publication unavailable') }));
  assert.match(html, /workspace-page-heading__caption.*Mathematics · Class 6A/s);
  assert.match(html, /<h1[^>]*><bdi>Reasoning practice<\/bdi><\/h1>/);
  assert.match(html, /Publication unavailable/);
  assert.doesNotMatch(html, /<details|<h2/);
});

test('Home composition adds no generic workspace help or reserved footer', () => {
  assert.equal(typeof pageUI.WorkspacePageProvider, 'function');
  const WorkspacePageProvider = pageUI.WorkspacePageProvider!;
  const html = renderToStaticMarkup(createElement(WorkspacePageProvider, { helpLabel:'About overview', help:null, children:createElement('h1',null,'Your learning day') }));
  assert.equal(html,'<h1>Your learning day</h1>');
});

test('focused navigation keeps one semantic workspace heading without reserving a duplicate visible row', () => {
  const html = renderToStaticMarkup(createElement(UI.WorkspaceNavigationProvider, { enabled:true,compactHeadings:true,currentWorkspaceLabel:'School', children:createElement(UI.WorkspacePageHeading,{title:'School',workspaceTitle:true}) }));
  assert.match(html,/data-workspace-heading-compact="true"/);
  assert.match(html,/data-workspace-heading-empty="true"/);
  assert.match(html,/<h1 class="workspace-page-heading__semantic"[^>]*>School<\/h1>/);
});

test('a subsection with no mounted navigation host keeps its visible heading during source loading', () => {
  const html=renderToStaticMarkup(createElement(UI.WorkspaceNavigationProvider,{enabled:true,compactHeadings:true,currentWorkspaceLabel:'School',children:createElement(UI.WorkspacePageHeading,{title:'Daily operations',navigationTitle:'Daily operations'})}));
  assert.doesNotMatch(html,/data-workspace-heading-compact/);
  assert.match(html,/<h1[^>]*>Daily operations<\/h1>/);
});

test('focused compaction retains selected record identity, meaningful captions and current actions', () => {
  const html = renderToStaticMarkup(createElement(UI.WorkspaceNavigationProvider,{enabled:true,compactHeadings:true,currentWorkspaceLabel:'Academic',children:createElement(UI.WorkspacePageHeading,{title:'Checking one method',navigationTitle:'Marking',caption:'Cedar · Year six',description:'Current submitted work',actions:createElement('button',null,'Back to marking')})}));
  assert.doesNotMatch(html,/data-workspace-heading-compact/);
  assert.match(html,/<h1[^>]*>Checking one method<\/h1>/);
  assert.match(html,/Cedar · Year six/);
  assert.match(html,/Back to marking/);
});

test('standalone and Home headings remain visible without authenticated focused navigation compaction', () => {
  for(const enabled of [false,true]){
    const html=renderToStaticMarkup(createElement(UI.WorkspaceNavigationProvider,{enabled,currentWorkspaceLabel:'School',children:createElement(UI.WorkspacePageHeading,{title:'School',navigationTitle:'School'})}));
    assert.doesNotMatch(html,/data-workspace-heading-compact/);
    assert.match(html,/<h1[^>]*>School<\/h1>/);
  }
});

test('a selected human record named like its workspace never becomes a generic compact title', () => {
  const html=renderToStaticMarkup(createElement(UI.WorkspaceNavigationProvider,{enabled:true,compactHeadings:true,currentWorkspaceLabel:'Academic',children:createElement(UI.WorkspacePageHeading,{title:'Academic',caption:'Current learner · Cedar'})}));
  assert.doesNotMatch(html,/data-workspace-heading-compact/);
  assert.match(html,/<h1[^>]*>Academic<\/h1>/);
});

test('a source caption that matches its workspace remains meaningful visible context', () => {
  const html=renderToStaticMarkup(createElement(UI.WorkspaceNavigationProvider,{enabled:true,compactHeadings:true,currentWorkspaceLabel:'School',children:createElement(UI.WorkspacePageHeading,{title:'School',workspaceTitle:true,caption:'School'})}));
  assert.match(html,/workspace-page-heading__caption">School<\/p>/);
  assert.doesNotMatch(html,/data-workspace-heading-empty/);
});
