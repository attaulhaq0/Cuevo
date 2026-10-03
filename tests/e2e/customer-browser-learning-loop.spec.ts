import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Account = { role: string; email: string; password: string };
type Receipt = { id: string; [field: string]: unknown };
const api = 'http://localhost:4000';

/** Every domain write in this test is a visible form/button action. No API setup or mutation helper. */
test('a teacher and learner operate the entire evidence, analysis and measured support loop through the UI', async ({ page }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15000);
  const accounts = JSON.parse(await readFile('.local/synthetic-accounts.json', 'utf8')) as Account[];
  const identities=JSON.parse(await readFile('supabase/seed/identities.json','utf8'))as{actors:{role:string;email:string;displayName:string}[]};
  const studentName=identities.actors.find(item=>item.email===accounts.find(account=>account.role==='student')?.email)?.displayName;
  if(!studentName)throw Error('The synthetic learner display name is unavailable');
  const run = new Date().toISOString().replace(/[:.]/g, '-');
  const title = `Explain and check — ${run}`;
  const baselineTitle = `${title} first assessment`;
  const followUpTitle = `${title} follow-up assessment`;
  const practiceTitle = `${title} reviewed practice`;
  const directory = resolve('.local/customer-readiness/browser-learning-loop', run, test.info().project.name);
  await mkdir(directory, { recursive: true });
  const errors: string[] = []; const consoleErrors: string[] = []; const hydration: string[] = [];
  const writes: { path: string; id: string; status: number }[] = [];
  let learningCourseId='';let learningActivityId='';let learningCompletionId='';
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type()==='error')consoleErrors.push(message.text()); if (['error', 'warning'].includes(message.type()) && /hydration|hydrated|server rendered|attributes.*match|React error #418/i.test(message.text())) hydration.push(message.text()); });

  async function signIn(role: string) {
    const account = accounts.find(item => item.role === role); if (!account) throw Error(`Synthetic ${role} account required`);
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel('School email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('School access verified', { exact: true })).toBeVisible();
  }
  async function signOut() { await page.getByRole('button', { name: 'Sign out', exact: true }).last().click(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(); }
  async function navigate(name: string) { await page.getByRole('navigation').getByRole('button', { name, exact: true }).click(); await settled(page); }
  async function capture(name: string) { await page.screenshot({ path: resolve(directory, name), fullPage: true }); }
  async function visibleMutation(path: string, action: () => Promise<void>): Promise<Receipt> {
    const pending = page.waitForResponse(response => response.url() === `${api}${path}` && response.request().method() === 'POST');
    await action(); const response = await pending;
    expect(response.status(), `Visible action ${path} returns a confirmed receipt`).toBe(200);
    const result = await response.json() as Receipt; expect(typeof result.id).toBe('string');
    writes.push({ path, id: result.id, status: response.status() }); return result;
  }
  async function loadTarget(target: Locator, container: Locator) {
    await settled(page);
    for (let pass = 0; pass < 30 && !await target.count(); pass++) {
      const buttons = container.getByRole('button', { name: 'Load more', exact: true });
      if (!await buttons.count()) break;
      await buttons.first().click(); await settled(page);
    }
    await expect(target).toBeVisible();
  }
  async function selectHumanLabel(select: Locator, label: string | RegExp, container?: Locator) {
    await expect(select).toBeVisible();
    for (let pass = 0; pass < 30; pass++) {
      const texts = await select.locator('option').allTextContents();
      const selected = texts.find(text => typeof label === 'string' ? text === label : label.test(text));
      if (selected) { await select.selectOption({ label: selected }); return selected; }
      const more = container?.getByRole('button', { name: 'Load more', exact: true });
      if (!more || !await more.count()) {
        await expect.poll(async()=>{const labels=await select.locator('option').allTextContents();return labels.some(text=>typeof label==='string'?text===label:label.test(text));},{timeout:15000}).toBe(true);
        const ready=(await select.locator('option').allTextContents()).find(text=>typeof label==='string'?text===label:label.test(text));if(ready){await select.selectOption({label:ready});return ready;}break;
      }
      await more.last().click(); await settled(page);
    }
    throw Error(`Visible authorized choice unavailable: ${String(label)}`);
  }
  async function createAssessment(label: string) {
    await navigate('Learning');const back=page.getByRole('button',{name:'Back to courses',exact:true});if(await back.count())await back.click();await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    await page.getByRole('button', { name: 'Create assessment', exact: true }).click();
    const form = page.getByRole('region', { name: 'Create assessment', exact: true });
    await selectHumanLabel(form.getByLabel('Course', { exact: true }), title, page.locator('.learning-workspace'));
    await form.getByLabel('Title', { exact: true }).fill(label);
    await form.getByLabel('Maximum score', { exact: true }).fill('10');
    await form.getByLabel('Instructions', { exact: true }).fill('Explain the school-authored example and describe a checking step.');
    const result = await visibleMutation('/v1/assessments', () => form.getByRole('button', { name: 'Save', exact: true }).click());
    const row=page.locator('.assessment-section').filter({has:page.getByRole('heading',{name:label,exact:true})});await expect(row).toBeVisible();
    const preparation=row.locator('.learning-form').filter({has:page.getByRole('heading',{name:'Edit task preparation',exact:true})}).last();await selectHumanLabel(preparation.getByLabel('Approved learning objective',{exact:true}),'Synthetic school-authored explanation objective');await visibleMutation(`/v1/assessments/${result.id}/preparation`,()=>preparation.getByRole('button',{name:'Save preparation',exact:true}).click());
    await visibleMutation(`/v1/assessments/${result.id}/publish`,()=>row.locator('.learning-form').filter({has:page.getByRole('heading',{name:'Publish prepared assessment',exact:true})}).last().getByRole('button',{name:'Publish prepared assessment',exact:true}).click());return result;
  }
  async function submitAssessment(label: string, assessmentId: string, useDraft: boolean) {
    await navigate('Learning');const back=page.getByRole('button',{name:'Back to courses',exact:true});if(await back.count())await back.click();await page.getByRole('button', { name: 'Assessments', exact: true }).click();
    const row = page.locator('.assessment-section').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
    await loadTarget(row, page.locator('.learning-workspace')); const openTask = row.getByRole('button', { name: 'Open task', exact: true }); if (await openTask.count()) await openTask.click(); await expect(row.getByLabel('Your response', { exact: true })).toBeVisible();
    await row.getByLabel('Your response', { exact: true }).fill('I explained the school example and checked my reasoning.');
    if (useDraft) {
      await row.getByRole('button', { name: 'Save draft', exact: true }).first().click();
      const draftForm = row.getByRole('region', { name: 'Save draft', exact: true });
      const draft = await visibleMutation(`/v1/assessments/${assessmentId}/draft`, () => draftForm.getByRole('button', { name: 'Save draft', exact: true }).click());
      expect(draft).toMatchObject({ assessmentId, status: 'DRAFT', revision: 1 });
      await navigate('Overview'); await navigate('Learning'); await page.getByRole('button', { name: 'Assessments', exact: true }).click();
      await loadTarget(row, page.locator('.learning-workspace'));
      await expect(row.getByLabel('Your response', { exact: true })).toHaveValue('I explained the school example and checked my reasoning.');
    }
    const submitted = await visibleMutation(`/v1/assessments/${assessmentId}/submissions`, () => row.getByRole('region', { name: 'Submit work', exact: true }).getByRole('button', { name: 'Submit work', exact: true }).click());
    expect(submitted).toMatchObject({ assessmentId, status: 'SUBMITTED', revision: 1 });
    await expect(row.getByText('Your work was submitted.', { exact: true })).toBeVisible(); return submitted;
  }
  async function markAndRelease(label: string, submission: Receipt, score: number) {
    await navigate('Academic'); const queue = page.locator('.marking-queue__item').filter({ hasText: label });
    await loadTarget(queue, page.locator('.academic-workspace')); await queue.click();
    const linked = page.getByRole('region', { name: 'Link approved objective', exact: true });
    if(await linked.count()){
      await selectHumanLabel(linked.getByLabel('Academic objective', { exact: true }), /^Synthetic school-authored explanation objective \(/);
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
    const pending = page.waitForResponse(response => /\/v1\/learners\/[^/]+\/state$/.test(response.url()) && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Refresh learner state', exact: true }).click(); const response = await pending;
    expect(response.status()).toBe(200); return response.json();
  }

  try {
    await test.step('Teacher plans and publishes actual learning through forms', async () => {
      await signIn('teacher'); await navigate('Learning');
      await page.getByRole('button', { name: 'Create course', exact: true }).click();
      let form = page.getByRole('region', { name: 'Create course', exact: true });
      await selectHumanLabel(form.getByLabel('Class', { exact: true }), 'Year 1 · Cedar · Year 1 · 2026–2027');
      await selectHumanLabel(form.getByLabel('Subject', { exact: true }), 'Mathematics');
      await form.getByLabel('Title', { exact: true }).fill(title); await form.getByLabel('Description', { exact: true }).fill('A school-authored explanation, practice and feedback sequence.');
      const course = await visibleMutation('/v1/courses', () => form.getByRole('button', { name: 'Save', exact: true }).click());
      learningCourseId=course.id;
      const row = page.locator('.course-list > li').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      await loadTarget(row, page.locator('.learning-workspace')); await row.getByRole('button', { name: 'Open course', exact: true }).click();
      await page.getByRole('button', { name: 'Add unit', exact: true }).click(); form = page.getByRole('region', { name: 'Add unit', exact: true });
      await form.getByLabel('Title', { exact: true }).fill('Explain and check');
      const unit = await visibleMutation(`/v1/courses/${course.id}/units`, () => form.getByRole('button', { name: 'Save', exact: true }).click());
      await page.getByRole('button', { name: 'Add lesson', exact: true }).click(); form = page.getByRole('region', { name: 'Add lesson', exact: true });
      await form.getByLabel('Title', { exact: true }).fill('Our school example'); await form.getByLabel('Lesson content', { exact: true }).fill('Read the school example, explain a step and check your reasoning.');
      const lesson = await visibleMutation(`/v1/units/${unit.id}/lessons`, () => form.getByRole('button', { name: 'Save', exact: true }).click());
      await page.getByRole('button', { name: 'Add activity', exact: true }).click(); form = page.getByRole('region', { name: 'Add activity', exact: true });
      await form.getByLabel('Title', { exact: true }).fill('Explain a checking step'); await form.getByLabel('Activity type', { exact: true }).selectOption({ label: 'Practice' }); await form.getByLabel('Instructions', { exact: true }).fill('Use the teacher example, explain a step, and show one check.');
      const activity=await visibleMutation(`/v1/lessons/${lesson.id}/activities`, () => form.getByRole('button', { name: 'Save', exact: true }).click());learningActivityId=activity.id;
      await page.getByRole('button', { name: 'Publish course', exact: true }).click(); form = page.getByRole('region', { name: 'Publish course', exact: true });
      await visibleMutation(`/v1/courses/${course.id}/publish`, () => form.getByRole('button', { name: 'Publish course', exact: true }).click());
      await capture('01-teacher-learning-plan.png');
    });
    const baselineAssessment = await createAssessment(baselineTitle); await signOut();
    await signIn('student');
    await navigate('Learning');const learningCourse=page.locator('.course-list > li').filter({has:page.getByRole('heading',{name:title,exact:true})});await loadTarget(learningCourse,page.locator('.learning-workspace'));await learningCourse.getByRole('button',{name:'Open course',exact:true}).click();await expect(page.getByText('Read the school example, explain a step and check your reasoning.',{exact:true})).toBeVisible();
    const activityRow=page.locator('.activity-section').filter({has:page.getByRole('heading',{name:'Explain a checking step',exact:true})});await activityRow.getByLabel('Reflection (optional)',{exact:true}).fill('I read the example and explained a checking step.');const learningCompletion=await visibleMutation(`/v1/activities/${learningActivityId}/complete`,()=>activityRow.getByRole('button',{name:'Complete activity',exact:true}).click());learningCompletionId=learningCompletion.id;
    await page.getByRole('button',{name:'Back to courses',exact:true}).click();await learningCourse.getByRole('button',{name:'Open course',exact:true}).click();await expect(activityRow.getByText('Activity completion confirmed.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to courses',exact:true}).click();
    const baselineSubmission = await submitAssessment(baselineTitle, baselineAssessment.id, true); await capture('02-learner-submitted-work.png'); await signOut();
    await signIn('teacher'); const baseline = await markAndRelease(baselineTitle, baselineSubmission, 2); await capture('03-reviewed-native-result.png'); await signOut();

    await signIn('student'); await navigate('Academic');
    const feedback = page.locator('.academic-row').filter({ has: page.getByRole('heading', { name: baselineTitle, exact: true }) });
    await loadTarget(feedback, page.locator('.academic-workspace')); await expect(feedback.locator('.native-score strong')).toHaveText('2');
    const evidenceRead = page.waitForResponse(response => response.url() === `${api}/v1/evidence/${baseline.evidenceId}` && response.request().method() === 'GET');
    await feedback.getByRole('button', { name: 'View evidence', exact: true }).click();
    const evidence = await (await evidenceRead).json(); expect(evidence).toMatchObject({ resultId: baseline.id, sourceObjectId: baselineSubmission.id, learnerId: baselineSubmission.learnerId });
    await navigate('Progress'); await expect.poll(async () => (await refreshState()).academic.some((source: { resultId: string }) => source.resultId === baseline.id), { timeout: 20000 }).toBe(true); await signOut();

    await signIn('teacher'); await navigate('Next steps'); await page.getByRole('button', { name: 'Request analysis', exact: true }).click();
    const analysisForm = page.getByRole('region', { name: 'Request analysis', exact: true });
    const visibleBaseline=await selectHumanLabel(analysisForm.getByLabel('Released baseline result', { exact: true }), new RegExp(`${escapeRegExp(studentName)}.*${escapeRegExp(baselineTitle)}.*2 / 10`), page.locator('.improvement-workspace'));
    expect(visibleBaseline).toContain('Year 1 · Cedar');
    const proposal = await visibleMutation('/v1/intelligence/analyze', () => analysisForm.getByRole('button', { name: 'Request analysis', exact: true }).click());
    expect(proposal).toMatchObject({ origin: 'AI_GENERATED', generationMode: 'FIXTURE', status: 'AWAITING_HUMAN', baselineResultId: baseline.id, learnerId: baselineSubmission.learnerId });
    const proposalRow = page.locator('.proposal-row').filter({ has: page.getByRole('heading', { name: String(proposal.recommendation), exact: true }) }).filter({ hasText: String(proposal.observation) });
    const exactProposalRow = page.locator(`[data-recommendation-id="${proposal.id}"]`); await loadTarget(exactProposalRow, page.locator('.improvement-workspace')); expect(await proposalRow.count()).toBeGreaterThan(0);
    const contextRead = page.waitForResponse(response => response.url() === `${api}/v1/intelligence/runs/${proposal.intelligenceRunId}/context` && response.request().method() === 'GET');
    await exactProposalRow.getByRole('button', { name: 'Show analysis source context', exact: true }).click(); const contextResponse = await contextRead; expect(contextResponse.status()).toBe(200); const context = (await contextResponse.json()).context;
    expect(context.recentResults.some((source: { resultId: string; evidenceId: string }) => source.resultId === baseline.id && source.evidenceId === baseline.evidenceId)).toBe(true);
    expect(context.learningOptions.some((option: { title: string }) => option.title === 'Explain a checking step')).toBe(true);expect(context.observations.some((observation:{sourceObjectId:string})=>observation.sourceObjectId===learningCompletionId)).toBe(true);
    const contextPanel=exactProposalRow.getByRole('region',{name:'Authorized analysis context',exact:true});await expect(contextPanel).toContainText(title);await expect(contextPanel).toContainText('Year 1 · Cedar');await expect(contextPanel).toContainText(studentName);await capture('04-grounded-proposal-context.png');
    await exactProposalRow.getByRole('button', { name: 'Approve practice', exact: true }).click(); const approvalForm = exactProposalRow.getByRole('region', { name: 'Approve practice', exact: true });
    await approvalForm.getByLabel('Decision reason', { exact: true }).fill('I reviewed the school evidence and the proposed practice.'); await approvalForm.getByLabel('Review or edit practice title', { exact: true }).fill(practiceTitle);
    const decision = await visibleMutation(`/v1/recommendations/${proposal.id}/decision`, () => approvalForm.getByRole('button', { name: 'Approve practice', exact: true }).click());
    expect(decision.status).toBe('APPROVED'); const interventionId = String(decision.interventionId); await signOut();

    await signIn('student'); await navigate('Next steps'); const practice = page.locator(`[data-intervention-id="${interventionId}"]`);
    await loadTarget(practice, page.locator('.improvement-workspace')); await expect(practice.getByRole('heading', { name: practiceTitle, exact: true })).toBeVisible();
    await practice.getByLabel('Reflection (optional)', { exact: true }).fill('I used the school example and checked each step.');
    const completed = await visibleMutation(`/v1/interventions/${interventionId}/complete`, () => practice.getByRole('button', { name: 'Complete practice', exact: true }).click());
    expect(completed.status).toBe('COMPLETED'); await capture('05-completed-reviewed-practice.png'); await signOut();

    await signIn('teacher'); const followUpAssessment = await createAssessment(followUpTitle); await signOut();
    await signIn('student'); const followUpSubmission = await submitAssessment(followUpTitle, followUpAssessment.id, false); await signOut();
    await signIn('teacher'); const followUp = await markAndRelease(followUpTitle, followUpSubmission, 7);
    await navigate('Next steps'); await page.getByRole('button', { name: 'Practice tasks', exact: true }).click();
    await loadTarget(practice, page.locator('.improvement-workspace')); await practice.getByRole('button', { name: 'Link follow-up assessment', exact: true }).click();
    const linkForm = practice.getByRole('region', { name: 'Link follow-up assessment', exact: true });
    await selectHumanLabel(linkForm.getByLabel('Published follow-up assessment', { exact: true }), `${followUpTitle} (10)`, page.locator('.improvement-workspace'));
    const linked = await visibleMutation(`/v1/interventions/${interventionId}/reassessment`, () => linkForm.getByRole('button', { name: 'Link follow-up assessment', exact: true }).click()); expect(linked.followUpAssessmentId).toBe(followUpAssessment.id);
    await practice.getByRole('button', { name: 'Measure observed change', exact: true }).click(); const measureForm = practice.getByRole('region', { name: 'Measure observed change', exact: true });
    await selectHumanLabel(measureForm.getByLabel('Released follow-up result', { exact: true }), new RegExp(`${escapeRegExp(studentName)}.*${escapeRegExp(followUpTitle)}.*7 / 10`), page.locator('.improvement-workspace'));
    await measureForm.getByLabel('Minimum change on the raw score scale', { exact: true }).fill('1');
    const outcome = await visibleMutation(`/v1/interventions/${interventionId}/measure`, () => measureForm.getByRole('button', { name: 'Measure observed change', exact: true }).click());
    expect(outcome).toMatchObject({ baselineResultId: baseline.id, followUpResultId: followUp.id, difference: 5, status: 'improved', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF' }); await signOut();

    await signIn('student'); await navigate('Progress'); let state: Record<string, unknown> = {};
    await expect.poll(async () => { state = await refreshState(); return (state.impact as { outcomes: { id: string }[] }).outcomes.some(item => item.id === outcome.id); }, { timeout: 20000 }).toBe(true);
    expect((state.sourceEventIds as string[]).length).toBeGreaterThan(0); const outcomeRow = page.locator(`[data-outcome-id="${outcome.id}"]`); await expect(outcomeRow).toContainText('Observed change is not proof that the practice caused the outcome.');
    await capture('06-source-linked-measured-outcome.png'); await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'العربية', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.emulateMedia({ reducedMotion: 'reduce' }); expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]); await capture('07-arabic-mobile-outcome.png');
    await page.getByRole('button', { name: 'English', exact: true }).click(); await page.setViewportSize({ width: 1440, height: 900 }); await signOut();

    await signIn('coordinator'); await navigate('Progress'); const classRead = page.waitForResponse(response => /\/v1\/classes\/[^/]+\/learning-summary\?/.test(response.url()) && response.request().method() === 'GET');
    await selectHumanLabel(page.getByLabel('Class', { exact: true }), 'Year 1 · Cedar · Year 1 · 2026–2027'); const summary = await (await classRead).json();
    const learnerSummary = summary.items.find((item: { learnerId: string }) => item.learnerId === baselineSubmission.learnerId); expect(learnerSummary.academic.numericCount).toBeGreaterThanOrEqual(2); expect(learnerSummary.outcomes.measurementIds).toContain(outcome.id);
    await capture('08-coordinator-class-evidence.png'); await signOut();
    await signIn('parent'); await navigate('Academic'); const childSelect = page.getByLabel('Child', { exact: true });
    await selectHumanLabel(childSelect,new RegExp(`${escapeRegExp(studentName)}.*Year 1.*Cedar`));const parentResult = page.locator('.academic-row').filter({ has: page.getByRole('heading', { name: followUpTitle, exact: true }) });
    await loadTarget(parentResult, page.locator('.academic-workspace')); await expect(parentResult.locator('.native-score strong')).toHaveText('7'); await expect(page.getByRole('navigation').getByRole('button', { name: 'Next steps', exact: true })).toHaveCount(0);
    await capture('09-parent-approved-native-result.png');
    await signOut();await signIn('student');await navigate('Portfolio');await page.getByRole('button',{name:'Select released work',exact:true}).click();
    const selectWork=page.getByRole('region',{name:'Select released work',exact:true});await selectHumanLabel(selectWork.getByLabel('Released source evidence',{exact:true}),followUpTitle,page.locator('.portfolio-workspace'));
    await selectWork.getByLabel('Portfolio title',{exact:true}).fill(`${title} selected explanation`);await selectWork.getByLabel('What I learned',{exact:true}).fill('I used teacher feedback, practised a checking step and explained it in the follow-up work.');
    const portfolio=await visibleMutation('/v1/portfolio/items',()=>selectWork.getByRole('button',{name:'Save',exact:true}).click());expect(portfolio).toMatchObject({revision:1,status:'AWAITING_REVIEW'});await signOut();
    await signIn('teacher');await navigate('Portfolio');const portfolioRow=page.locator(`[data-portfolio-id="${portfolio.id}"]`);await loadTarget(portfolioRow,page.locator('.portfolio-workspace'));await portfolioRow.getByRole('button',{name:'Review selected work',exact:true}).click();
    const reviewWork=portfolioRow.getByRole('region',{name:'Review selected work',exact:true});await reviewWork.getByLabel('I reviewed this exact submitted work and reflection',{exact:true}).check();await reviewWork.getByLabel('Teacher feedback',{exact:true}).fill('This reflection accurately describes the reviewed school evidence.');await reviewWork.getByLabel('Share this exact revision with current parents / guardians',{exact:true}).check();await reviewWork.getByLabel('I approve parent sharing of this reviewed revision',{exact:true}).check();
    await visibleMutation(`/v1/portfolio/items/${portfolio.id}/review`,()=>reviewWork.getByRole('button',{name:'Save',exact:true}).click());await signOut();
    await signIn('parent');await navigate('Portfolio');const portfolioChild=page.getByLabel('Child',{exact:true});await selectHumanLabel(portfolioChild,new RegExp(`${escapeRegExp(studentName)}.*Year 1`));await loadTarget(portfolioRow,page.locator('.portfolio-workspace'));await expect(portfolioRow).toContainText('I used teacher feedback, practised a checking step');await expect(portfolioRow.locator('.native-score strong')).toHaveText('7');await capture('10-parent-approved-portfolio.png');await signOut();
    await signIn('teacher');await navigate('Portfolio');await loadTarget(portfolioRow,page.locator('.portfolio-workspace'));await portfolioRow.getByRole('button',{name:'Revoke parent sharing',exact:true}).click();const revoke=portfolioRow.getByRole('region',{name:'Revoke parent sharing',exact:true});await revoke.getByLabel('Reason',{exact:true}).fill('The school reviewed and withdrew current family publication.');await visibleMutation(`/v1/portfolio/items/${portfolio.id}/parent-revoke`,()=>revoke.getByRole('button',{name:'Save',exact:true}).click());await expect(portfolioRow).toContainText('Sharing is off.');await signOut();
    await signIn('parent');await navigate('Portfolio');await selectHumanLabel(page.getByLabel('Child',{exact:true}),new RegExp(`${escapeRegExp(studentName)}.*Year 1`));await page.getByRole('button',{name:'Refresh portfolio',exact:true}).click();await settled(page);await expect(portfolioRow).toHaveCount(0);await capture('11-revoked-portfolio-hidden.png');
    expect(errors).toEqual([]); expect(consoleErrors).toEqual([]); expect(hydration).toEqual([]);
    await writeFile(resolve(directory, 'evidence.json'), JSON.stringify({ status: 'VERIFIED', mutationMode: 'VISIBLE_UI_ONLY', writes, sourceLoop: { course:learningCourseId,learningCompletion:learningCompletionId,baseline: baseline.id, evidence: baseline.evidenceId, proposal: proposal.id, intervention: interventionId, followUp: followUp.id, outcome: outcome.id }, provenance: 'Authorized browser receipts, evidence and processed learner-state source events; no owner audit/DB read.', officialCurriculumClaim: false, pageErrors: errors.length, consoleErrors: consoleErrors.length, hydrationWarnings: hydration.length }, null, 2));
  } catch (failure) { if(!page.isClosed())await capture('failure.png').catch(()=>undefined);await writeFile(resolve(directory, 'failure.json'), JSON.stringify({ status: 'FAILED', mutationMode: 'VISIBLE_UI_ONLY', confirmedWriteCount: writes.length, consoleErrorCount: errors.length, hydrationWarningCount: hydration.length }, null, 2)); throw failure; }
});

async function settled(page: Page) { await expect(page.locator('main [role="status"]').filter({ hasText: /^(Loading|جارٍ تحميل)/ })).toHaveCount(0); }
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,match=>String.fromCharCode(92)+match);}


