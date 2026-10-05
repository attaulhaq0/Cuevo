import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');

test('the exact selected message opens its report and moderation forms in the thread review panel', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{createContext,useContext,useState}from'react';import{createRoot}from'react-dom/client';import{ConversationThread}from'./apps/web/features/community/components/conversation-thread';import{CommandJournal}from'./apps/web/shared/api/client';import{FormDrafts}from'./apps/web/shared/session/form-drafts';
const C=createContext(null);globalThis.actionC=C;globalThis.actionUC=useContext;const id=n=>'b9000000-0000-4000-8000-'+String(n).padStart(12,'0');const thread={id:id(1),learnerId:id(2),parentId:id(3),teacherId:id(4),classId:id(5),subjectId:id(6),title:'Current family checking',learnerName:'Lina Hassan',parentName:'Current parent',teacherName:'Maya Reed',className:'Cedar',academicYearName:'2026–2027',subjectName:'Mathematics',createdAt:'2026-10-05T09:00:00Z',state:'OPEN',stateVersion:0,canModerate:false};const f=globalThis.actionFixture={role:'parent',writes:[],thread,message:{id:id(7),conversationId:id(1),senderId:id(4),senderName:'Maya Reed',senderRole:'teacher',body:'Compare one current checking step.',sentAt:'2026-10-05T09:01:00Z',delivery:'DELIVERED_IN_APP',status:'VISIBLE',moderationVersion:0,recipientReadAt:'2026-10-05T09:02:00Z'}};
globalThis.fetch=async(input,init)=>{const path=new URL(String(input)).pathname;if(init?.method==='POST'){f.writes.push(path);throw Error('No protected writes authorized');}return Response.json(path.endsWith('/messages')?{items:[f.message],nextCursor:null}:path.endsWith('/reports')?{items:[],nextCursor:null}:{...thread,canModerate:f.role==='teacher'});};
const journal=new CommandJournal(),drafts=new FormDrafts();function Harness(){const[role,setRole]=useState('parent');globalThis.actionRole=next=>{f.role=next;setRole(next)};return<C.Provider value={{membership:{schoolId:id(10),userId:role==='parent'?id(3):id(4),role,entitlements:['community']},apiUrl:'https://conversation.fixture.invalid',accessToken:'fictional',accessGeneration:1,status:'ready',online:true,locale:'en',commandJournal:journal,formDrafts:drafts,announce(){},reportDiagnostic(){},refreshAccess(){}}}><main><ConversationThread key={role} intent={{id:thread.id,learnerId:thread.learnerId,parentId:thread.parentId,teacherId:thread.teacherId,classId:thread.classId,subjectId:thread.subjectId}} onBack={()=>{}}/></main></C.Provider>}createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader:{'.webp':'dataurl'}, plugins: [{ name: 'fictional-actor-only', setup(bundler) { bundler.onLoad({ filter: /shared[\\/]session[\\/]providers\.tsx$/ }, () => ({ loader: 'js', contents: 'export function useApp(){return globalThis.actionUC(globalThis.actionC)}' })); } }] });
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: result.outputFiles[0].text });
  const thread = page.getByRole('region', { name: 'Current family checking', exact: true });
  const message = thread.locator('[data-message-id="b9000000-0000-4000-8000-000000000007"]');
  await expect(message.getByText('Recipient confirmed reading', { exact: true })).toBeVisible();
  await message.getByRole('button', { name: 'Report a message concern', exact: true }).click();
  await expect(message.getByRole('region', { name: 'Report a message concern', exact: true })).toHaveCount(0);
  const report = thread.getByRole('region', { name: 'Report a message concern', exact: true });
  await report.getByLabel('Reason', { exact: true }).fill('Please review this exact current message.');
  await expect(report.getByLabel('Reason', { exact: true })).toHaveValue('Please review this exact current message.');
  await page.evaluate(() => (globalThis as unknown as { actionRole: (role: string) => void }).actionRole('teacher'));
  await message.getByRole('button', { name: 'Hide this message', exact: true }).click();
  const moderation = thread.getByRole('region', { name: 'Hide this message', exact: true });
  await moderation.getByLabel('Reason', { exact: true }).fill('Current assigned teacher review.');
  await expect(moderation.getByLabel('I approve this moderation action', { exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => (globalThis as unknown as { actionFixture: { writes: string[] } }).actionFixture.writes)).toEqual([]); expect(errors).toEqual([]);
});
