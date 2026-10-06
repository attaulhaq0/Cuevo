import { openCurrentResult } from './result-reader';
import { openCurrentPractice } from './practice-reader';
import { openCurrentProposal } from './proposal-reader';
import { expectTrailWorkspace, openTrailWorkspace, signOutTrailWorkspace, selectTrailPortfolioRecord } from './trail-workspace';
import { expect, type Page, type Locator, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { membershipSchema, idempotencyKeySchema, learnerStateSchema, classLearningSummarySchema, type MembershipResponse } from '@cuevo/contracts';
import { z } from 'zod';
import { humanContextLabel, selectHumanChoice } from './human-choice';
import { currentCoursePreparationOutline } from './learning-source-navigation';

export type CustomerLearningLoopRole = 'admin' | 'coordinator' | 'teacher' | 'student' | 'parent';
export type CustomerLearningLoopActor = { role: CustomerLearningLoopRole; actorId: string; schoolId: string; email: string; displayName: string };
export type CustomerLearningLoopAccount = CustomerLearningLoopActor & { password: string };
export type CustomerLearningLoopReceipt = { id: string; [field: string]: unknown };
export type CustomerLearningLoopMutationIntent = { path: string; actor: Readonly<CustomerLearningLoopActor>; scopeGeneration: number };
export type CustomerLearningLoopCommandObservation = CustomerLearningLoopMutationIntent & { request: Request; key: string; body: Record<string, unknown>; receipt: CustomerLearningLoopReceipt; status: number };
export type CustomerLearningLoopInput = {
  webOrigin: string; apiOrigin: string; accounts: readonly CustomerLearningLoopAccount[]; title: string;
  context: { schoolId: string; classId: string; classLabel: string; className: string; yearGroupName: string; classShortName: string; subjectId: string; subjectName: string; referenceId: string; referenceTitle: string };
};
export type CustomerLearningLoopControls = {
  signIn: (role: CustomerLearningLoopRole) => Promise<void>;
  signOut: () => Promise<void>;
  navigate: (name: string) => Promise<void>;
  visibleMutation: (path: string, action: () => Promise<void>) => Promise<CustomerLearningLoopReceipt>;
};
export type CustomerLearningLoopPorts = {
  step?: (name: string, work: () => Promise<void>) => Promise<void>;
  capture?: (name: string) => Promise<void>;
  beforeLoop?: (controls: CustomerLearningLoopControls) => Promise<void>;
  beforeMutation?: (intent: CustomerLearningLoopMutationIntent) => Promise<void>;
  onCommand?: (observation: CustomerLearningLoopCommandObservation) => Promise<void>;
  sessionStarting?: (actor: Readonly<CustomerLearningLoopActor>) => Promise<void>;
  sessionStarted?: (actor: Readonly<CustomerLearningLoopActor>, membership: MembershipResponse) => Promise<void>;
  sessionEnded?: (actor: Readonly<CustomerLearningLoopActor>) => Promise<void>;
  cleanup?: () => Promise<void>;
  verifyQuality?: () => Promise<void>;
};
export type CustomerLearningLoopObservation = {
  writes: { path: string; id: string; status: number }[];
  sourceLoop: { course: string; learningCompletion: string; baseline: string; evidence: string; proposal: string; intervention: string; followUp: string; outcome: string };
  nativeOutcome: { baseline: 2; followUp: 7; maxScore: 10; difference: 5; limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' };
};

function validateLoopInput(value: CustomerLearningLoopInput): CustomerLearningLoopInput {
  const role = z.enum(['admin','coordinator','teacher','student','parent']);
  const origin = z.string().url().refine(value => new URL(value).origin === value);
  const text = z.string().trim().min(1).max(1000);
  const input = z.object({webOrigin:origin,apiOrigin:origin,title:z.string().trim().min(1).max(150),accounts:z.array(z.object({role,actorId:z.uuid(),schoolId:z.uuid(),email:z.email(),displayName:text,password:z.string().min(1).max(128)}).strict()).length(5),context:z.object({schoolId:z.uuid(),classId:z.uuid(),classLabel:text,className:text,yearGroupName:text,classShortName:text,subjectId:z.uuid(),subjectName:text,referenceId:z.uuid(),referenceTitle:text}).strict()}).strict().parse(value);
  if(new Set(input.accounts.map(account=>account.role)).size!==5||new Set(input.accounts.map(account=>account.actorId)).size!==5||new Set(input.accounts.map(account=>account.email)).size!==5||input.accounts.some(account=>account.schoolId!==input.context.schoolId))throw Error('The exact selected learning-loop actors require review.');
  return input;
}

/** Observe one existing visible command. This helper never prepares, sends or retries a command. */
export async function observeCustomerLearningLoopMutation(page: Page, input: {
  apiOrigin: string; intent: CustomerLearningLoopMutationIntent; isCurrent: () => boolean; action: () => Promise<void>;
  beforeMutation?: CustomerLearningLoopPorts['beforeMutation']; onCommand?: CustomerLearningLoopPorts['onCommand'];
}): Promise<CustomerLearningLoopReceipt> {
  const intent = { ...input.intent, actor: Object.freeze({ ...input.intent.actor }) };
  if (!input.isCurrent() || new URL(input.apiOrigin).origin !== input.apiOrigin || !intent.path.startsWith('/v1/') || intent.path.includes('?') || intent.path.includes('#')) throw Error('The original visible command scope is unavailable.');
  await input.beforeMutation?.(intent);
  if (!input.isCurrent()) throw Error('The original visible command scope changed before submission.');
  let original: Request | undefined; let requestCount = 0;
  const matches = (request: Request) => request.url() === input.apiOrigin + intent.path && request.method() === 'POST';
  const requested = (request: Request) => { if (matches(request)) { requestCount++; original ??= request; } };
  page.on('request', requested);
  const pending = page.waitForResponse(response => matches(response.request()) && response.request() === original).then(response => ({ response }), () => ({ response: null }));
  try {
    await input.action(); const { response } = await pending;
    if (!response || !original || requestCount !== 1 || !input.isCurrent()) throw Error('The original visible command response could not be confirmed.');
    expect(await response.finished()).toBeNull();
    const headers = original.headers(); const key = idempotencyKeySchema.parse(headers['idempotency-key']);
    if (headers['x-school-id'] !== intent.actor.schoolId || !/^Bearer [^\s]+$/.test(headers.authorization ?? '') || headers['content-type']?.split(';')[0].trim() !== 'application/json') throw Error('The original visible command identity could not be confirmed.');
    const bytes = original.postDataBuffer(); if (!bytes || bytes.length > 65536) throw Error('The original visible command body is unavailable.');
    const body: unknown = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('The original visible command body is invalid.');
    expect(response.status(), 'The visible command returns its own confirmed receipt').toBe(200);
    expect(response.url()).toBe(original.url());
    const parsedReceipt = z.object({ id: z.uuid() }).passthrough().safeParse(await response.json());
    if(!parsedReceipt.success)throw Error('The original visible command receipt is invalid.');
    const receipt = parsedReceipt.data as CustomerLearningLoopReceipt;
    if (!input.isCurrent() || requestCount !== 1) throw Error('The original visible command scope changed before receipt validation.');
    await input.onCommand?.({ ...intent, request: original, key, body: body as Record<string, unknown>, receipt, status: response.status() });
    if (!input.isCurrent() || requestCount !== 1) throw Error('The original visible command scope changed before continuing.');
    return receipt;
  } finally { page.off('request', requested); }
}

export async function selectLoopPreparation(page:Page,title:string,source:{courseId:string;resource:'course'|'unit'|'lesson';id:string},apiOrigin:string){
  const outline=await currentCoursePreparationOutline(page);
  const choice=outline.getByRole('button',{name:title,exact:true});await expect(choice).toHaveCount(1);await expect(choice).toBeEnabled();
  const requested=page.waitForResponse(response=>new URL(response.url()).origin===apiOrigin&&new URL(response.url()).pathname===`/v1/learning-content/${source.resource}/${source.id}`&&response.request().method()==='GET');
  await choice.click();await expect(choice).toHaveAttribute('aria-current','page');const current=await requested;expect(current.ok()).toBe(true);expect(await current.json()).toMatchObject({courseId:source.courseId,sourceId:source.id,resource:source.resource,title});
  await expect(page.locator('.course-view').getByRole('heading',{name:title,level:1,exact:true})).toBeVisible();return page.getByRole('region',{name:'Course preparation',exact:true});
}

/** The current numeric learning loop through normal visible customer controls. */
export async function runCustomerBrowserLearningLoop(page: Page, input: CustomerLearningLoopInput, ports: CustomerLearningLoopPorts = {}): Promise<CustomerLearningLoopObservation> {
  input = validateLoopInput(input);
  page.setDefaultTimeout(15000);
  const { apiOrigin: api, title, context } = input;
  const student = accountFor('student'), teacher = accountFor('teacher'); const studentName = student.displayName;
  const baselineTitle = title+' first assessment', followUpTitle = title+' follow-up assessment', practiceTitle = title+' reviewed practice';
  const writes: CustomerLearningLoopObservation['writes'] = [];
  let learningCourseId='',learningActivityId='',learningCompletionId='';
  let currentActor: Readonly<CustomerLearningLoopActor> | null = null, scopeGeneration = 0;
  let failure: unknown; let failed = false; let result: CustomerLearningLoopObservation | undefined;
  const cleanupFailures: unknown[] = [];
  function accountFor(role: CustomerLearningLoopRole): CustomerLearningLoopAccount {
    const matching=input.accounts.filter(account=>account.role===role&&account.schoolId===context.schoolId);
    if(matching.length!==1||!matching[0].displayName||!matching[0].actorId)throw Error('One exact fictional loop actor is required.');
    return matching[0];
  }
  async function signIn(role: CustomerLearningLoopRole) {
    if(currentActor)throw Error('The previous loop session must be signed out first.');
    const account=accountFor(role);const actor=Object.freeze({role:account.role,actorId:account.actorId,schoolId:account.schoolId,email:account.email,displayName:account.displayName});
    currentActor=actor;scopeGeneration++;
    await ports.sessionStarting?.(actor);
    await page.goto(input.webOrigin+'/'); await page.getByRole('button',{name:'English',exact:true}).click();
    await page.getByLabel('School email',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);
    const pending=page.waitForResponse(response=>response.url()===api+'/v1/me'&&response.request().method()==='GET').then(response=>({response}),()=>({response:null}));
    await page.getByRole('button',{name:'Sign in',exact:true}).click();const {response}=await pending;
    if(!response||response.status()!==200)throw Error('The current loop membership is unavailable.');
    const membership=membershipSchema.parse(await response.json());
    expect(membership).toMatchObject({userId:actor.actorId,schoolId:actor.schoolId,role:actor.role,displayName:actor.displayName});
    expect(membership.school.id).toBe(actor.schoolId);await expectTrailWorkspace(page,role);await ports.sessionStarted?.(actor,membership);
  }
  async function signOut() {
    const actor=currentActor;if(!actor)throw Error('The current loop session is unavailable.');
    await signOutTrailWorkspace(page);await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
    currentActor=null;scopeGeneration++;await ports.sessionEnded?.(actor);
  }
  async function navigate(name: string) { await openTrailWorkspace(page,name); await settled(page); }
  const capture=async(name:string)=>{await ports.capture?.(name);};
  const step=async(name:string,work:()=>Promise<void>)=>{if(ports.step)await ports.step(name,work);else await work();};
  async function visibleMutation(path:string,action:()=>Promise<void>):Promise<CustomerLearningLoopReceipt>{
    const actor=currentActor,generation=scopeGeneration;if(!actor)throw Error('The current loop actor is unavailable.');
    const receipt=await observeCustomerLearningLoopMutation(page,{apiOrigin:api,intent:{path,actor,scopeGeneration:generation},isCurrent:()=>currentActor===actor&&scopeGeneration===generation,action,beforeMutation:ports.beforeMutation,onCommand:ports.onCommand});
    writes.push({path,id:receipt.id,status:200});return receipt;
  }
  async function loadTarget(target: Locator, container: Locator, source: { path: '/v1/courses' | '/v1/assessments' | '/v1/marking'; records: Locator; attribute: 'data-course-choice' | 'data-assessment-choice' | 'data-assessment-id' | 'data-marking-choice' }) {
    await settled(page);
    for (let pass = 0; pass < 30 && !await target.count(); pass++) {
      const buttons = container.getByRole('button', { name: 'Load more', exact: true });
      if (!await buttons.count()) break;
      await expect(container).toHaveCount(1); await expect(buttons, 'One current source owns this continuation').toHaveCount(1); await expect(buttons).toBeEnabled(); const expectedCursor = await buttons.getAttribute('data-page-cursor'); if (expectedCursor !== null) expect(expectedCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); const currentPage = page.waitForResponse(response => new URL(response.url()).origin === api && new URL(response.url()).pathname === source.path && (expectedCursor === null || new URL(response.url()).searchParams.get('cursor') === expectedCursor) && response.request().method() === 'GET'); await buttons.click(); const response = await currentPage; expect(response.ok()).toBe(true); expect(await response.finished()).toBeNull(); const current = await response.json() as { items: { id: string }[]; nextCursor: string | null }; expect(Array.isArray(current.items) && current.items.length <= 100).toBe(true); const ids = current.items.map(item => item.id); expect(new Set(ids).size).toBe(ids.length); for (const id of ids) { expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); await expect(source.records.locator(`[${source.attribute}="${id}"]`)).toHaveCount(1); } if (current.nextCursor !== null) { expect(current.nextCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); expect(current.nextCursor).not.toBe(new URL(response.url()).searchParams.get('cursor')); } await expect(container.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0); await expect(container.getByRole('alert')).toHaveCount(0); if (current.nextCursor === null) await expect(buttons).toHaveCount(0); else { expect(current.items.length).toBeGreaterThan(0); if (expectedCursor !== null) await expect(buttons).toHaveAttribute('data-page-cursor', current.nextCursor); await expect(buttons).toBeEnabled(); } await settled(page);
    }
    await expect(target).toBeVisible();
  }
  async function selectHumanLabel(select: Locator, label: string | RegExp, container?: Locator, expectedValue?: string, sourcePath?: '/v1/results') {
    await expect(select).toBeVisible();
    for (let pass = 0; pass < 30; pass++) {
      const texts = await select.locator('option').allTextContents();
      const selected = texts.find(text => typeof label === 'string' ? text === label : label.test(text));
      if (selected) return (await selectHumanChoice(select, label, expectedValue)).label;
      const more = container?.getByRole('button', { name: 'Load more', exact: true });
      if (!more || !await more.count()) {
        await expect.poll(async()=>{const labels=await select.locator('option').allTextContents();return labels.some(text=>typeof label==='string'?text===label:label.test(text));},{timeout:15000}).toBe(true);
        const ready=(await select.locator('option').allTextContents()).find(text=>typeof label==='string'?text===label:label.test(text));if(ready)return (await selectHumanChoice(select,label,expectedValue)).label;break;
      }
      await expect(container!).toHaveCount(1); await expect(more, 'One current source owns this choice continuation').toHaveCount(1); await expect(more).toBeEnabled(); expect(sourcePath, 'The exact current choice source must be supplied before paging').toBe('/v1/results'); const priorValues = await select.locator('option[value]:not([value=""])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)); const expectedCursor = await more.getAttribute('data-page-cursor'); if (expectedCursor !== null) expect(expectedCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); const requested = page.waitForResponse(response => new URL(response.url()).origin === api && new URL(response.url()).pathname === sourcePath && (expectedCursor === null || new URL(response.url()).searchParams.get('cursor') === expectedCursor) && response.request().method() === 'GET'); await more.click(); const response = await requested; expect(response.ok()).toBe(true); expect(await response.finished()).toBeNull(); const current = await response.json() as { items: { id: string; evidenceId: string }[]; nextCursor: string | null }; expect(Array.isArray(current.items) && current.items.length <= 100).toBe(true); const ids = current.items.map(item => item.id); expect(new Set(ids).size).toBe(ids.length); for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); if (current.nextCursor !== null) { expect(current.nextCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); expect(current.nextCursor).not.toBe(new URL(response.url()).searchParams.get('cursor')); } await expect(container!.getByRole('button', { name: 'Loading more…', exact: true })).toHaveCount(0); await expect(container!.getByRole('alert')).toHaveCount(0); await expect.poll(async () => { const values = await select.locator('option[value]:not([value=""])').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)); return current.nextCursor === null ? await more.count() === 0 : values.some(value => !priorValues.includes(value)) && (expectedCursor === null || await more.getAttribute('data-page-cursor') === current.nextCursor) && await more.isEnabled(); }, { message: 'The exact current choice page must commit a distinguishable option or its terminal state.' }).toBe(true); await settled(page);
    }
    throw Error(`Visible authorized choice unavailable: ${String(label)}`);
  }
  async function completePracticeChoiceSources(practice: Locator, nextAction: 'Link follow-up assessment' | 'Measure observed change') {
    const workspace = page.locator('.improvement-workspace'); await expect(workspace.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0);
    for (const source of [{ path: '/v1/results', owner: workspace.locator(':scope > .notice').filter({ has: page.getByText('Released baseline result', { exact: true }) }), name: 'Load more' }, { path: '/v1/assessments', owner: workspace.locator(':scope > section[aria-label="Published follow-up assessment"]'), name: 'Load more: Published follow-up assessment' }]) {
      await expect(source.owner.getByRole('button', { name: source.path === '/v1/results' ? 'Loading more…' : 'Loading more…: Published follow-up assessment', exact: true })).toHaveCount(0); const more = source.owner.getByRole('button', { name: source.name, exact: true }); const seen = new Set<string>();
      for (let part = 0; await more.count(); part++) {
        expect(part, 'Current follow-up choice continuation remains bounded').toBeLessThan(30); await expect(source.owner).toHaveCount(1); await expect(more).toHaveCount(1); await expect(more).toBeEnabled();
        const requestedCursor = await more.getAttribute('data-page-cursor'); expect(requestedCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); const received = page.waitForResponse(response => new URL(response.url()).origin === api && new URL(response.url()).pathname === source.path && new URL(response.url()).searchParams.get('cursor') === requestedCursor && response.request().method() === 'GET'); await more.click(); const response = await received; expect(response.ok()).toBe(true); expect(await response.finished()).toBeNull();
        const current = await response.json() as { items: { id: string }[]; nextCursor: string | null }; expect(Array.isArray(current.items) && current.items.length <= 100).toBe(true); const ids = current.items.map(item => item.id); expect(new Set(ids).size).toBe(ids.length); for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
        if (current.nextCursor !== null) { expect(current.items.length).toBeGreaterThan(0); expect(current.nextCursor).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i); expect(current.nextCursor).not.toBe(new URL(response.url()).searchParams.get('cursor')); expect(seen.has(current.nextCursor)).toBe(false); seen.add(current.nextCursor); }
        await expect(source.owner.getByRole('button', { name: source.path === '/v1/results' ? 'Loading more…' : 'Loading more…: Published follow-up assessment', exact: true })).toHaveCount(0); await expect(source.owner.getByRole('alert')).toHaveCount(0); if (current.nextCursor === null) await expect(more).toHaveCount(0); else { await expect(more).toHaveAttribute('data-page-cursor', current.nextCursor); await expect(more).toBeEnabled(); }
      }
    }
    await expect(practice.getByRole('button', { name: nextAction, exact: true })).toBeEnabled();
    await expect(workspace.getByRole('alert')).toHaveCount(0);
  }
  async function createAssessment(label: string) {
    await navigate('Learning');const back=page.getByRole('button',{name:'Back to courses',exact:true});if(await back.count())await back.click();await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    await page.getByRole('button', { name: 'Create assessment', exact: true }).click();
    const form = page.getByRole('region', { name: 'Create assessment', exact: true });
    await selectHumanLabel(form.getByLabel('Course', { exact: true }), `${title} · ${context.classLabel} · ${context.subjectName}`, undefined, learningCourseId);
    await form.getByLabel('Title', { exact: true }).fill(label);
    await form.getByLabel('Maximum score', { exact: true }).fill('10');
    await form.getByLabel('Instructions', { exact: true }).fill('Explain the school-authored example and describe a checking step.');
    const result = await visibleMutation('/v1/assessments', () => form.getByRole('button', { name: 'Save', exact: true }).click());
    const choice=page.locator(`.learning-staff-directory [data-assessment-choice="${result.id}"]`);await loadTarget(choice,page.locator('.learning-workspace > .pagination-actions'),{path:'/v1/assessments',records:page.locator('.learning-workspace'),attribute:'data-assessment-choice'});await expect(choice).toHaveCount(1);await expect(choice.locator('strong')).toHaveText(label);const selected=page.waitForResponse(response=>new URL(response.url()).origin===api&&new URL(response.url()).pathname===`/v1/assessments/${result.id}`&&response.request().method()==='GET');await choice.getByRole('button').click();const current=await selected;expect(current.ok()).toBe(true);expect(await current.json()).toMatchObject({id:result.id,title:label});const row=page.locator(`.assessment-section[data-assessment-id="${result.id}"]`);await expect(row.getByRole('heading',{name:label,level:2,exact:true})).toBeVisible();
    const preparation=row.locator('.learning-form').filter({has:page.locator(':scope > form')}).filter({has:page.getByRole('heading',{name:'Edit task preparation',exact:true})});await expect(preparation).toHaveCount(1);await selectHumanLabel(preparation.getByLabel('Approved learning objective',{exact:true}),humanContextLabel(context.referenceTitle),undefined,context.referenceId);const prepared=await visibleMutation(`/v1/assessments/${result.id}/preparation`,()=>preparation.getByRole('button',{name:'Save preparation',exact:true}).click());expect(prepared.referenceId).toBe(context.referenceId);
    const publication=row.locator('.learning-form').filter({has:page.locator(':scope > form')}).filter({has:page.getByRole('heading',{name:'Publish prepared assessment',exact:true})});await expect(publication).toHaveCount(1);await visibleMutation(`/v1/assessments/${result.id}/publish`,()=>publication.getByRole('button',{name:'Publish prepared assessment',exact:true}).click());return result;
  }
  async function submitAssessment(label: string, assessmentId: string, useDraft: boolean) {
    await navigate('Learning');const back=page.getByRole('button',{name:'Back to courses',exact:true});if(await back.count())await back.click();await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    const row = page.locator('.assessment-section').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
    await loadTarget(row, page.locator('.learning-workspace > .pagination-actions'), { path: '/v1/assessments', records: page.locator('.learning-workspace'), attribute: 'data-assessment-id' }); const openTask = row.getByRole('button', { name: 'Open task', exact: true }); if (await openTask.count()) await openTask.click(); await expect(row.getByLabel('Your response', { exact: true })).toBeVisible();
    await row.getByLabel('Your response', { exact: true }).fill('I explained the school example and checked my reasoning.');
    if (useDraft) {
      await row.getByRole('button', { name: 'Save draft', exact: true }).first().click();
      const draftForm = row.getByRole('region', { name: 'Save draft', exact: true });
      const draft = await visibleMutation(`/v1/assessments/${assessmentId}/draft`, () => draftForm.getByRole('button', { name: 'Save draft', exact: true }).click());
      expect(draft).toMatchObject({ assessmentId, status: 'DRAFT', revision: 1 });
      await navigate('Overview'); await navigate('Learning'); await page.getByRole('button', { name: 'Assessments', exact: true }).click();
      await loadTarget(row, page.locator('.learning-workspace > .pagination-actions'), { path: '/v1/assessments', records: page.locator('.learning-workspace'), attribute: 'data-assessment-id' });
      await expect(row.getByLabel('Your response', { exact: true })).toHaveValue('I explained the school example and checked my reasoning.');
    }
    const submitted = await visibleMutation(`/v1/assessments/${assessmentId}/submissions`, () => row.getByRole('region', { name: 'Submit work', exact: true }).getByRole('button', { name: 'Submit work', exact: true }).click());
    expect(submitted).toMatchObject({ assessmentId, status: 'SUBMITTED', revision: 1 });
    await expect(row.getByText('Your work was submitted.', { exact: true })).toBeVisible(); return submitted;
  }
  async function markAndRelease(label: string, submission: CustomerLearningLoopReceipt, score: number) {
    await navigate('Academic'); const queue = page.locator('.marking-queue__item').filter({ hasText: label });
    await loadTarget(queue, page.locator('.academic-workspace > .pagination-actions'), { path: '/v1/marking', records: page.locator('.academic-workspace'), attribute: 'data-marking-choice' }); await queue.click();
    const linked = page.getByRole('region', { name: 'Link approved objective', exact: true });
    if(await linked.count()){
      await selectHumanLabel(linked.getByLabel('Academic objective', { exact: true }), humanContextLabel(context.referenceTitle), undefined, context.referenceId);
      const configuration = await visibleMutation(`/v1/assessments/${submission.assessmentId}/reference`, () => linked.getByRole('button', { name: 'Link approved objective', exact: true }).click());expect(configuration).toMatchObject({ id: submission.assessmentId, policyVersion: 2 });
    }
    const form = page.getByRole('region', { name: 'Save marking draft', exact: true });
    await form.getByLabel('Score (0–10)', { exact: true }).fill(String(score));
    await form.getByLabel('Teacher feedback', { exact: true }).fill('Review the school example, explain your checking step, and discuss it with your teacher.');
    const mark = await visibleMutation(`/v1/submissions/${submission.id}/results`, () => form.getByRole('button', { name: 'Save marking draft', exact: true }).click());
    expect(mark).toMatchObject({ submissionId: submission.id, score, revision: 1, status: 'REVIEW' });
    await expect(page.locator('.mark-review').getByText('Marking draft — review before release', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Release result', exact: true }).click();
    const releaseForm = page.getByRole('region', { name: 'Release result', exact: true });
    await expect(releaseForm.getByRole('checkbox')).not.toBeChecked();
    await releaseForm.getByLabel('Approve this released result for the current parent / guardian view', { exact: true }).check();
    const released = await visibleMutation(`/v1/results/${mark.id}/release`, () => releaseForm.getByRole('button', { name: 'Release result', exact: true }).click());
    expect(released).toMatchObject({ submissionId: submission.id, assessmentId: submission.assessmentId, learnerId: submission.learnerId, score, maxScore: 10, parentVisible: true, nativeResult: { type: 'numeric', score, maxScore: 10, policyVersion: 2 } });
    await expect(page.locator('.mark-review').getByText('Released', { exact: true })).toBeVisible(); return released;
  }
  async function refreshState() {
    const pending = page.waitForResponse(response => response.url()===api+'/v1/learners/'+student.actorId+'/state' && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Refresh learner state', exact: true }).click(); const response = await pending;
    expect(response.status()).toBe(200); expect(response.request().headers()['x-school-id']).toBe(context.schoolId); const state=learnerStateSchema.parse(await response.json()); expect(state.learnerId).toBe(student.actorId); return state;
  }

  try {
    await ports.beforeLoop?.({signIn,signOut,navigate,visibleMutation});
    await step('Teacher plans and publishes actual learning through forms', async () => {
      await signIn('teacher'); await navigate('Learning');
      await page.getByRole('button', { name: 'Create course', exact: true }).click();
      let form = page.getByRole('region', { name: 'Create course', exact: true });
      await selectHumanLabel(form.getByLabel('Class', { exact: true }), context.classLabel, undefined, context.classId);
      await selectHumanLabel(form.getByLabel('Subject', { exact: true }), context.subjectName, undefined, context.subjectId);
      await form.getByLabel('Title', { exact: true }).fill(title); await form.getByLabel('Description', { exact: true }).fill('A school-authored explanation, practice and feedback sequence.');
      const course = await visibleMutation('/v1/courses', () => form.getByRole('button', { name: 'Save', exact: true }).click());
      learningCourseId=course.id;
      const row = page.locator('.course-list > li').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      await loadTarget(row, page.locator('.learning-workspace > .pagination-actions'), { path: '/v1/courses', records: page.locator('.learning-workspace'), attribute: 'data-course-choice' }); await row.getByRole('button', { name: 'Open course', exact: true }).click();
      await page.getByRole('button', { name: 'Add unit', exact: true }).click(); form = page.getByRole('region', { name: 'Add unit', exact: true });
      await form.getByLabel('Title', { exact: true }).fill('Explain and check');
      const unit = await visibleMutation(`/v1/courses/${course.id}/units`, () => form.getByRole('button', { name: 'Save', exact: true }).click());
      await selectLoopPreparation(page,'Explain and check',{courseId:course.id,resource:'unit',id:unit.id},api);await page.getByRole('region',{name:'Course preparation',exact:true}).getByRole('button', { name: 'Add lesson', exact: true }).click(); form = page.getByRole('region', { name: 'Add lesson', exact: true });
      await form.getByLabel('Title', { exact: true }).fill('Our school example'); await form.getByLabel('Lesson content', { exact: true }).fill('Read the school example, explain a step and check your reasoning.');
      const lesson = await visibleMutation(`/v1/units/${unit.id}/lessons`, () => form.getByRole('button', { name: 'Save', exact: true }).click());
      await selectLoopPreparation(page,'Our school example',{courseId:course.id,resource:'lesson',id:lesson.id},api);await page.getByRole('region',{name:'Course preparation',exact:true}).getByRole('button', { name: 'Add activity', exact: true }).click(); form = page.getByRole('region', { name: 'Add activity', exact: true });
      await form.getByLabel('Title', { exact: true }).fill('Explain a checking step'); await form.getByLabel('Activity type', { exact: true }).selectOption({ label: 'Practice' }); await form.getByLabel('Instructions', { exact: true }).fill('Use the teacher example, explain a step, and show one check.');
      const activity=await visibleMutation(`/v1/lessons/${lesson.id}/activities`, () => form.getByRole('button', { name: 'Save', exact: true }).click());learningActivityId=activity.id;
      await selectLoopPreparation(page,title,{courseId:course.id,resource:'course',id:course.id},api);await page.getByRole('button', { name: 'Publish course', exact: true }).click(); form = page.getByRole('region', { name: 'Publish course', exact: true });
      await visibleMutation(`/v1/courses/${course.id}/publish`, () => form.getByRole('button', { name: 'Publish course', exact: true }).click());
      await capture('01-teacher-learning-plan.png');
    });
    const baselineAssessment = await createAssessment(baselineTitle); await signOut();
    await signIn('student');
    await navigate('Learning');const learningCourse=page.locator('.course-list > li').filter({has:page.getByRole('heading',{name:title,exact:true})});await loadTarget(learningCourse,page.locator('.learning-workspace > .pagination-actions'),{path:'/v1/courses',records:page.locator('.learning-workspace'),attribute:'data-course-choice'});await learningCourse.getByRole('button',{name:'Open course',exact:true}).click();await page.getByRole('button',{name:'Open lesson: Our school example',exact:true}).click();await expect(page.getByText('Read the school example, explain a step and check your reasoning.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Open activity: Explain a checking step',exact:true}).click();await page.locator('.student-learning-journey').getByRole('button',{name:'Open this task',exact:true}).click();
    const activityRow=page.locator('.activity-section').filter({has:page.getByRole('heading',{name:'Explain a checking step',exact:true})});await activityRow.getByLabel('Reflection (optional)',{exact:true}).fill('I read the example and explained a checking step.');const learningCompletion=await visibleMutation(`/v1/activities/${learningActivityId}/complete`,()=>activityRow.getByRole('button',{name:'Complete activity',exact:true}).click());expect(learningCompletion).toMatchObject({activityId:learningActivityId,learnerId:student.actorId});learningCompletionId=learningCompletion.id;
    await page.getByRole('button',{name:'Back to courses',exact:true}).click();await learningCourse.getByRole('button',{name:'Open course',exact:true}).click();await page.getByRole('button',{name:'Open lesson: Our school example',exact:true}).click();await page.getByRole('button',{name:'Open activity: Explain a checking step',exact:true}).click();await page.locator('.student-learning-journey').getByRole('button',{name:'Open this task',exact:true}).click();await expect(activityRow.getByText('Activity completion confirmed.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to courses',exact:true}).click();
    const baselineSubmission = await submitAssessment(baselineTitle, baselineAssessment.id, true); await capture('02-learner-submitted-work.png'); await signOut();
    await signIn('teacher'); const baseline = await markAndRelease(baselineTitle, baselineSubmission, 2); await capture('03-reviewed-native-result.png'); await signOut();

    await signIn('student'); await navigate('Academic');
    await expect(page.getByRole('heading', { name: 'Released results', exact: true, level: 1 })).toBeVisible();
    const feedback = page.locator('.academic-row').filter({ has: page.getByRole('heading', { name: baselineTitle, exact: true }) });
    await openCurrentResult(page,String(baseline.id)); await expect(feedback.locator('.native-score strong')).toHaveText('2');
    expect(await feedback.innerText()).not.toContain('synthetic-school-1');
    const evidenceRead = page.waitForResponse(response => response.url() === `${api}/v1/evidence/${baseline.evidenceId}` && response.request().method() === 'GET');
    await feedback.getByRole('button', { name: 'View evidence', exact: true }).click();
    await expect(feedback.locator('.evidence-context')).toContainText(baselineTitle);
    await expect(feedback.locator('.evidence-provenance')).toContainText(teacher.displayName);
    expect(await feedback.locator('.evidence-context').innerText()).not.toContain(baselineSubmission.id);
    const evidence = await (await evidenceRead).json(); expect(evidence).toMatchObject({ resultId: baseline.id, sourceObjectId: baselineSubmission.id, learnerId: baselineSubmission.learnerId });
    const technicalEvidence = feedback.locator('.evidence-reading > details');
    await technicalEvidence.getByText('Technical details', { exact: true }).click();
    await expect(technicalEvidence).toContainText(evidence.referenceVersion);
    await expect(technicalEvidence).toContainText(baselineSubmission.id);
    await technicalEvidence.getByText('Technical details', { exact: true }).click();
    await navigate('Progress'); await expect.poll(async () => (await refreshState()).academic.some((source: { resultId: string }) => source.resultId === baseline.id), { timeout: 20000 }).toBe(true); await signOut();

    await signIn('teacher'); await navigate('Next steps'); await page.getByRole('button', { name: 'Request analysis', exact: true }).click();
    const analysisForm = page.getByRole('region', { name: 'Request analysis', exact: true });
    const visibleBaseline=await selectHumanLabel(analysisForm.getByLabel('Released baseline result', { exact: true }), new RegExp(`${escapeCustomerLearningLoopLabel(studentName)}.*${escapeCustomerLearningLoopLabel(baselineTitle)}.*2 / 10`), page.locator('.improvement-workspace > .notice').filter({ has: page.getByText('Released baseline result', { exact: true }) }), String(baseline.id), '/v1/results');
    expect(visibleBaseline).toContain(context.className);
    const proposal = await visibleMutation('/v1/intelligence/analyze', () => analysisForm.getByRole('button', { name: 'Request analysis', exact: true }).click());
    expect(proposal).toMatchObject({ origin: 'AI_GENERATED', generationMode: 'FIXTURE', status: 'AWAITING_HUMAN', baselineResultId: baseline.id, learnerId: baselineSubmission.learnerId });
    const proposalRow = page.locator('.proposal-row').filter({ has: page.getByRole('heading', { name: String(proposal.recommendation), exact: true }) }).filter({ hasText: String(proposal.observation) });
    const exactProposalRow = page.locator(`[data-recommendation-id="${proposal.id}"]`); await openCurrentProposal(page, String(proposal.id)); expect(await proposalRow.count()).toBeGreaterThan(0);
    const contextRead = page.waitForResponse(response => response.url() === `${api}/v1/intelligence/runs/${proposal.intelligenceRunId}/context` && response.request().method() === 'GET');
    await exactProposalRow.getByRole('button', { name: 'Show analysis source context', exact: true }).click(); const contextResponse = await contextRead; expect(contextResponse.status()).toBe(200); const analysisContext = (await contextResponse.json()).context;
    expect(analysisContext.recentResults.some((source: { resultId: string; evidenceId: string }) => source.resultId === baseline.id && source.evidenceId === baseline.evidenceId)).toBe(true);
    expect(analysisContext.learningOptions.some((option: { title: string }) => option.title === 'Explain a checking step')).toBe(true);expect(analysisContext.observations.some((observation:{sourceObjectId:string})=>observation.sourceObjectId===learningCompletionId)).toBe(true);
    const contextPanel=exactProposalRow.getByRole('region',{name:'Authorized analysis context',exact:true});await expect(contextPanel).toContainText(title);await expect(contextPanel).toContainText(context.className);await expect(contextPanel).toContainText(studentName);await capture('04-grounded-proposal-context.png');
    await exactProposalRow.getByRole('button', { name: 'Approve practice', exact: true }).click(); const approvalForm = exactProposalRow.getByRole('region', { name: 'Approve practice', exact: true });
    await approvalForm.getByLabel('Decision reason', { exact: true }).fill('I reviewed the school evidence and the proposed practice.'); await approvalForm.getByLabel('Review or edit practice title', { exact: true }).fill(practiceTitle);
    const decision = await visibleMutation(`/v1/recommendations/${proposal.id}/decision`, () => approvalForm.getByRole('button', { name: 'Approve practice', exact: true }).click());
    expect(decision.status).toBe('APPROVED'); const interventionId = String(decision.interventionId); await signOut();

    await signIn('student'); await navigate('Next steps'); const practice = page.locator(`[data-intervention-id="${interventionId}"]`);
    await openCurrentPractice(page, interventionId); await expect(practice.getByRole('heading', { name: practiceTitle, exact: true })).toBeVisible();
    await practice.getByLabel('Reflection (optional)', { exact: true }).fill('I used the school example and checked each step.');
    const completed = await visibleMutation(`/v1/interventions/${interventionId}/complete`, () => practice.getByRole('button', { name: 'Complete practice', exact: true }).click());
    expect(completed.status).toBe('COMPLETED'); await capture('05-completed-reviewed-practice.png'); await signOut();

    await signIn('teacher'); const followUpAssessment = await createAssessment(followUpTitle); await signOut();
    await signIn('student'); const followUpSubmission = await submitAssessment(followUpTitle, followUpAssessment.id, false); await signOut();
    await signIn('teacher'); const followUp = await markAndRelease(followUpTitle, followUpSubmission, 7);
    await navigate('Next steps'); await page.getByRole('button', { name: 'Practice tasks', exact: true }).click();
    await openCurrentPractice(page, interventionId); await completePracticeChoiceSources(practice, 'Link follow-up assessment'); await practice.getByRole('button', { name: 'Link follow-up assessment', exact: true }).click();
    const linkForm = practice.getByRole('region', { name: 'Link follow-up assessment', exact: true });
    await selectHumanLabel(linkForm.getByLabel('Published follow-up assessment', { exact: true }), `${followUpTitle} (10)`, undefined, String(followUpAssessment.id));
    const linked = await visibleMutation(`/v1/interventions/${interventionId}/reassessment`, () => linkForm.getByRole('button', { name: 'Link follow-up assessment', exact: true }).click()); expect(linked.followUpAssessmentId).toBe(followUpAssessment.id);
    await completePracticeChoiceSources(practice, 'Measure observed change'); await practice.getByRole('button', { name: 'Measure observed change', exact: true }).click(); const measureForm = practice.getByRole('region', { name: 'Measure observed change', exact: true });
    await selectHumanLabel(measureForm.getByLabel('Released follow-up result', { exact: true }), new RegExp(`${escapeCustomerLearningLoopLabel(studentName)}.*${escapeCustomerLearningLoopLabel(followUpTitle)}.*7 / 10`), undefined, String(followUp.id));
    await measureForm.getByLabel('Minimum change on the raw score scale', { exact: true }).fill('1');
    const outcome = await visibleMutation(`/v1/interventions/${interventionId}/measure`, () => measureForm.getByRole('button', { name: 'Measure observed change', exact: true }).click());
    expect(outcome).toMatchObject({ baselineResultId: baseline.id, followUpResultId: followUp.id, difference: 5, status: 'improved', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' }); await signOut();

    await signIn('student'); await navigate('Progress'); let state: Record<string, unknown> = {};
    await expect.poll(async () => { state = await refreshState(); return (state.impact as { outcomes: { id: string }[] }).outcomes.some(item => item.id === outcome.id); }, { timeout: 20000 }).toBe(true);
    expect((state.sourceEventIds as string[]).length).toBeGreaterThan(0); const outcomeRow = page.locator(`[data-outcome-id="${outcome.id}"]`); const outcomeLabel = `Observed change · ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(String(outcome.measuredAt)))}`; const outcomeOpener = page.locator('.support-outcome-disclosure > button').filter({ hasText: outcomeLabel }); await expect(outcomeOpener).toHaveCount(1); const outcomeSource = page.waitForResponse(response => new URL(response.url()).origin === api && new URL(response.url()).pathname === `/v1/interventions/${interventionId}` && response.request().method() === 'GET'); await outcomeOpener.click(); const outcomeRead = await outcomeSource; expect(outcomeRead.ok()).toBe(true); expect(await outcomeRead.json()).toMatchObject({ id: interventionId, learnerId: baselineSubmission.learnerId, baselineResultId: baseline.id }); await expect(outcomeRow).toContainText('Observed change is not proof that the practice caused the outcome.');
    await expect(outcomeRow.getByRole('heading',{name:practiceTitle,exact:true})).toBeVisible();
    await expect(outcomeRow).toContainText(studentName);
    await expect(outcomeRow).toContainText(baselineTitle);
    await expect(outcomeRow).toContainText(followUpTitle);
    await capture('06-source-linked-measured-outcome.png'); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const arabicFollowUp = page.locator('.academic-row').filter({ has: page.getByRole('heading', { name: followUpTitle, exact: true }) }).locator('.native-score');
    await expect(arabicFollowUp).toHaveAttribute('role', 'img');
    await expect(arabicFollowUp).toHaveAttribute('aria-label', `${new Intl.NumberFormat('ar').format(7)} من ${new Intl.NumberFormat('ar').format(10)}`);
    await expect(arabicFollowUp.locator('bdi')).toHaveAttribute('dir', 'ltr');
    const direction = await arabicFollowUp.locator('bdi').evaluate(element => getComputedStyle(element).direction);
    expect(direction).toBe('ltr');
    const arabicOutcome = page.locator(`[data-outcome-id="${outcome.id}"]`);
    const outcomeRatios = arabicOutcome.locator('.outcome-reading__sources .outcome-reading__ratio[dir="ltr"]');
    await expect(outcomeRatios).toHaveCount(2);
    await expect(outcomeRatios.nth(0)).toHaveText(`${new Intl.NumberFormat('ar').format(2)} / ${new Intl.NumberFormat('ar').format(10)}`);
    await expect(outcomeRatios.nth(1)).toHaveText(`${new Intl.NumberFormat('ar').format(7)} / ${new Intl.NumberFormat('ar').format(10)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.emulateMedia({ reducedMotion: 'reduce' }); expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]); await capture('07-arabic-mobile-outcome.png');
    await page.getByRole('button', { name: 'English', exact: true }).click(); await page.setViewportSize({ width: 1440, height: 900 }); await signOut();

    await signIn('coordinator'); await navigate('Progress'); const classRead = page.waitForResponse(response => new URL(response.url()).origin===api&&new URL(response.url()).pathname==='/v1/classes/'+context.classId+'/learning-summary' && response.request().method() === 'GET');
    await selectHumanLabel(page.getByLabel('Class', { exact: true }), context.classLabel); const summary = classLearningSummarySchema.parse(await (await classRead).json()); expect(summary).toMatchObject({schoolId:context.schoolId,classId:context.classId});
    const learnerSummary = summary.items.find((item: { learnerId: string }) => item.learnerId === baselineSubmission.learnerId); expect(learnerSummary).toBeDefined(); expect(learnerSummary!.academic.numericCount).toBeGreaterThanOrEqual(2); expect(learnerSummary!.outcomes.measurementIds).toContain(outcome.id);
    await capture('08-coordinator-class-evidence.png'); await signOut();
    await signIn('parent'); await navigate('Academic'); const childSelect = page.getByLabel('Child', { exact: true });
    await expect(page.getByRole('heading', { name: 'Released results', exact: true, level: 1 })).toBeVisible();
    await selectHumanLabel(childSelect,new RegExp(`${escapeCustomerLearningLoopLabel(studentName)}.*${escapeCustomerLearningLoopLabel(context.yearGroupName)}.*${escapeCustomerLearningLoopLabel(context.classShortName)}`));const parentResult = page.locator('.academic-row').filter({ has: page.getByRole('heading', { name: followUpTitle, exact: true }) });
    await openCurrentResult(page,String(followUp.id)); await expect(parentResult.locator('.native-score strong')).toHaveText('7'); await expect(page.locator('.workspace-chrome__navigation').getByRole('button', { name: 'Next steps', exact: true })).toHaveCount(0);
    await capture('09-parent-approved-native-result.png');
    await signOut();await signIn('student');await navigate('Portfolio');await page.getByRole('button',{name:'Select released work',exact:true}).click();
    const selectWork=page.getByRole('region',{name:'Select released work',exact:true});const releasedChoices=page.locator('.portfolio-workspace > .notice').filter({has:page.getByText('Released source evidence',{exact:true})});const selectedWork=await selectHumanLabel(selectWork.getByLabel('Released source evidence',{exact:true}),humanContextLabel(followUpTitle),releasedChoices,String(followUp.evidenceId),'/v1/results');expect(selectedWork).toContain('Objective: '+context.referenceTitle);expect(selectedWork).toContain('Result revision: 1');expect(selectedWork).toContain('Result recorded:');
    await selectWork.getByLabel('Portfolio title',{exact:true}).fill(`${title} selected explanation`);await selectWork.getByLabel('What I learned',{exact:true}).fill('I used teacher feedback, practised a checking step and explained it in the follow-up work.');
    const portfolio=await visibleMutation('/v1/portfolio/items',()=>selectWork.getByRole('button',{name:'Save',exact:true}).click());expect(portfolio).toMatchObject({revision:1,status:'AWAITING_REVIEW'});await signOut();
    await signIn('teacher');await navigate('Portfolio');let portfolioRow=await selectTrailPortfolioRecord(page,portfolio.id,`${title} selected explanation`);await portfolioRow.getByRole('button',{name:'Review selected work',exact:true}).click();
    const reviewWork=portfolioRow.getByRole('region',{name:'Review selected work',exact:true});await reviewWork.getByLabel('I reviewed this exact submitted work and reflection',{exact:true}).check();await reviewWork.getByLabel('Teacher feedback',{exact:true}).fill('This reflection accurately describes the reviewed school evidence.');await reviewWork.getByLabel('Share this exact revision with current parents / guardians',{exact:true}).check();await reviewWork.getByLabel('I approve parent sharing of this reviewed revision',{exact:true}).check();
    await visibleMutation(`/v1/portfolio/items/${portfolio.id}/review`,()=>reviewWork.getByRole('button',{name:'Save',exact:true}).click());await signOut();
    await signIn('parent');await navigate('Portfolio');const portfolioChild=page.getByLabel('Child',{exact:true});await selectHumanLabel(portfolioChild,new RegExp(`${escapeCustomerLearningLoopLabel(studentName)}.*${escapeCustomerLearningLoopLabel(context.yearGroupName)}`));portfolioRow=await selectTrailPortfolioRecord(page,portfolio.id,`${title} selected explanation`);await expect(portfolioRow).toContainText('I used teacher feedback, practised a checking step');await expect(portfolioRow.locator('.native-score strong')).toHaveText('7');await capture('10-parent-approved-portfolio.png');await signOut();
    await signIn('teacher');await navigate('Portfolio');portfolioRow=await selectTrailPortfolioRecord(page,portfolio.id,`${title} selected explanation`);await portfolioRow.getByRole('button',{name:'Revoke parent sharing',exact:true}).click();const revoke=portfolioRow.getByRole('region',{name:'Revoke parent sharing',exact:true});await revoke.getByLabel('Reason',{exact:true}).fill('The school reviewed and withdrew current family publication.');await visibleMutation(`/v1/portfolio/items/${portfolio.id}/parent-revoke`,()=>revoke.getByRole('button',{name:'Save',exact:true}).click());await expect(portfolioRow).toHaveCount(0);portfolioRow=await selectTrailPortfolioRecord(page,portfolio.id,`${title} selected explanation`);await expect(portfolioRow).toContainText('Sharing is off.');await signOut();
    await signIn('parent');await navigate('Portfolio');await selectHumanLabel(page.getByLabel('Child',{exact:true}),new RegExp(`${escapeCustomerLearningLoopLabel(studentName)}.*${escapeCustomerLearningLoopLabel(context.yearGroupName)}`));await page.getByRole('button',{name:'Refresh portfolio',exact:true}).click();await settled(page);await expect(portfolioRow).toHaveCount(0);await expect(page.locator('.parent-portfolio-directory li').filter({has:page.getByRole('heading',{name:`${title} selected explanation`,exact:true})})).toHaveCount(0);await capture('11-revoked-portfolio-hidden.png');
    await signOut(); await ports.verifyQuality?.();
    result={writes,sourceLoop:{course:learningCourseId,learningCompletion:learningCompletionId,baseline:String(baseline.id),evidence:String(baseline.evidenceId),proposal:String(proposal.id),intervention:interventionId,followUp:String(followUp.id),outcome:String(outcome.id)},nativeOutcome:{baseline:2,followUp:7,maxScore:10,difference:5,limitation:'OBSERVED_CHANGE_NOT_CAUSAL_PROOF'}};
  } catch(error) { failed=true; failure=error; }
  finally {
    try { if(currentActor&&!page.isClosed()&&await page.locator('.workspace-chrome').count())await signOut(); } catch(error) { cleanupFailures.push(error); }
    try { await ports.cleanup?.(); } catch(error) { cleanupFailures.push(error); }
  }
  if(cleanupFailures.length)throw new AggregateError(failed?[failure,...cleanupFailures]:cleanupFailures,'The visible learning-loop verification or session cleanup failed.',failed?{cause:failure}:undefined);
  if(failed)throw failure;
  if(!result)throw Error('The visible loop did not produce an observation.');
  return result;
}

async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0); }
export function escapeCustomerLearningLoopLabel(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,match=>String.fromCharCode(92)+match);}
