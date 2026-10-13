import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers } from '../../../shared/session/providers.tsx';
import { SchoolSetup } from '../components/setup.tsx';
import type { SchoolContext } from '../model.ts';
Object.assign(globalThis,{React});
const school={id:'f6000000-0000-4000-8000-000000000001',name:'Current approved academy',countryCode:'QA',languages:['en','ar'] as ('en'|'ar')[]};
const context:SchoolContext={school,policy:{version:0,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:false},intelligence:{fixtureSchoolApproved:false,liveSchoolApproved:false,availability:'SERVER_CONFIG_AND_APPROVED_POLICY_REQUIRED'}};
function render(locale:'en'|'ar',chromeSchool?:{id:string;name:string}){return renderToStaticMarkup(createElement(Providers,{initialLocale:locale,config:{supabaseUrl:'',supabasePublishableKey:'',apiUrl:''},children:createElement(SchoolSetup,{context,years:[],terms:[],groups:[],classes:[],subjects:[],canManage:false,onChanged(){},chromeSchool})}));}
test('School Setup omits only the same explicitly visible chrome school identity',()=>{for(const locale of ['en','ar']as const){assert.doesNotMatch(render(locale,school),/<h2>Current approved academy<\/h2>/);for(const value of [undefined,{id:'different',name:school.name},{id:school.id,name:'Different current name'}])assert.match(render(locale,value),/<h2>Current approved academy<\/h2>/);}});
