import assert from 'node:assert/strict';
import test from 'node:test';
import type { DemoGuideManifest } from '../../../shared/session/demo-guide.ts';
const guide = await import('../demo-guide-model.ts').catch(() => ({})) as typeof import('../demo-guide-model.ts');
const uuid = (index: number) => 'ce000000-0000-4000-8000-' + String(index).padStart(12, '0');
const manifest = () => ({ version: 1, schoolId: uuid(1), actors: { admin: uuid(2), coordinator: uuid(3), teacher: uuid(4), student: uuid(5), parent: uuid(6) }, records: { courseId: uuid(11), lessonId: uuid(20), activityId: uuid(21), proposalId: uuid(22), baselineSubmissionId: uuid(23), baselineResultId: uuid(12), followupResultId: uuid(13), assignedPracticeId: uuid(14), measuredPracticeId: uuid(15), outcomeId: uuid(16), portfolioId: uuid(17), periodId: uuid(18), roomId: uuid(19) } }) as DemoGuideManifest;

test('one bilingual product story moves between actual source roles in a fixed readable sequence', () => {
  assert.equal(typeof guide.getProductDemoSteps, 'function');
  const en = guide.getProductDemoSteps('en', manifest()), ar = guide.getProductDemoSteps('ar', manifest());
  assert.equal(en.length, 22); assert.equal(en[0].role, 'student'); assert.equal(en[0].view, 'overview');
  assert.deepEqual(ar.map(step => [step.key, step.role, step.target, step.view, step.intent]), en.map(step => [step.key, step.role, step.target, step.view, step.intent]));
  assert.equal(new Set(en.map(step => step.key)).size, en.length);
  assert.ok(en.every(step => step.title.trim() && step.explain.trim() && !/ce000000|[<>]/.test(step.title + step.explain)));
  const arabic = /[\u0600-\u06ff]/;
  assert.equal(arabic.test('Parents see the approved child story'), false);
  assert.ok(ar.every(step => arabic.test(step.title) && arabic.test(step.explain)));
  assert.ok(en.some(step => step.role === 'teacher')); assert.ok(en.some(step => step.role === 'coordinator')); assert.ok(en.some(step => step.role === 'parent'));
});
test('exact typed destinations retain existing record intent semantics and one shared manifest', () => {
  const input = manifest(), before = structuredClone(input), steps = guide.getProductDemoSteps('en', input);
  assert.deepEqual(steps.find(step => step.key === 'learning')?.intent, { view: 'learning', source: 'course', id: uuid(11) });
  assert.deepEqual(steps.find(step => step.key === 'baseline')?.intent, { view: 'academic', source: 'result', id: uuid(12) });
  assert.deepEqual(steps.find(step => step.key === 'teacher-review')?.intent, { view: 'academic', source: 'marking', id: uuid(23) });
  assert.deepEqual(steps.find(step => step.key === 'objective')?.intent, { view: 'academic', source: 'marking', id: uuid(23) });
  assert.deepEqual(steps.find(step => step.key === 'practice')?.intent, { view: 'improvement', source: 'intervention', id: uuid(15) });
  assert.deepEqual(steps.find(step => step.key === 'followup')?.intent, { view: 'academic', source: 'result', id: uuid(13) });
  assert.deepEqual(steps.find(step => step.key === 'discussion')?.intent, { view: 'community', section: 'rooms' });
  assert.deepEqual(input, before); assert.equal(Object.isFrozen(steps), true); assert.ok(steps.every(step => Object.isFrozen(step)));
});
test('Parent portion opens only approved child portfolio and school communication', () => {
  const steps = guide.getProductDemoSteps('en', manifest()).filter(step => step.role === 'parent');
  assert.ok(steps.length > 0); assert.ok(steps.every(step => ['portfolio', 'community', 'academic', 'overview'].includes(step.view)));
  assert.ok(steps.every(step => !['proposal', 'practice', 'outcome', 'progress', 'development', 'task-focus'].includes(step.target)));
});
test('guide target identifiers cannot supply selectors or commands and no automatic authority action is planned', () => {
  const steps = guide.getProductDemoSteps('en', manifest());
  const targets = ['home', 'learning', 'task-focus', 'baseline', 'objective', 'teacher-review', 'proposal', 'practice', 'outcome', 'followup', 'progress', 'habits', 'portfolio', 'development', 'discussion', 'announcements', 'notifications', 'school', 'curriculum', 'agentic-proposal', 'agentic-context', 'personalization', 'agentic-practice', 'learning-loop', 'rubric', 'self-regulation', 'institution', 'signals'];
  assert.ok(steps.every(step => targets.includes(step.target)));
  assert.ok(steps.every(step => Object.keys(step).every(key => ['key', 'role', 'title', 'explain', 'view', 'intent', 'target'].includes(key))));
  assert.ok(steps.every(step => !/approve|submit|delete|POST|award/.test(step.target)));
});

test('saved demonstration analysis extends one story while keeping the manual outcome separate', () => {
  const input = manifest();
  Object.assign(input.records, { agenticProposalId: uuid(24), agenticRunId: uuid(25), agenticPracticeId: uuid(26) });
  const before = structuredClone(input), en = guide.getProductDemoSteps('en', input), ar = guide.getProductDemoSteps('ar', input);
  assert.equal(en.length, 28);
  assert.deepEqual(ar.map(step => [step.key, step.role, step.view, step.target, step.intent]), en.map(step => [step.key, step.role, step.view, step.target, step.intent]));
  assert.deepEqual(en.map(step => step.key), ['home', 'learning-loop', 'learning', 'focus', 'baseline', 'objective', 'rubric', 'teacher-review', 'proposal', 'practice', 'outcome', 'followup', 'agentic-proposal', 'agentic-context', 'personalization', 'agentic-practice', 'progress', 'habits', 'portfolio', 'self-regulation', 'coordination', 'family', 'development', 'discussion', 'notifications', 'school', 'institution', 'signals']);
  const generated = en.filter(step => step.key.startsWith('agentic-'));
  assert.deepEqual(generated.map(step => step.role), ['teacher', 'teacher', 'student']);
  assert.deepEqual(generated[2].intent, { view: 'improvement', source: 'intervention', id: uuid(26) });
  assert.match(generated[0].explain, /prepared example/i);
  assert.match(generated[0].explain, /E Deviser Intelligence/i);
  assert.match(generated[0].explain, /7 out of 10/i);
  assert.match(generated[0].explain, /live model performance/i);
  assert.match(generated[1].explain, /authorized.*context/i);
  assert.match(generated[2].explain, /assigned/i);
  assert.match(generated[2].explain, /not.*reassessed|unmeasured/i);
  assert.match(generated[2].explain, /3.*7.*manual/i);
  assert.deepEqual(en.find(step => step.key === 'notifications')?.intent, { view: 'community', section: 'notifications' });
  assert.equal(en.find(step => step.key === 'school')?.role, 'admin');
  assert.deepEqual(input, before);
  const text = en.map(step => step.title + step.explain).join(' ');
  assert.doesNotMatch(text, /ce000000|[<>]/);
  assert.ok(en.every(step => Object.isFrozen(step)));
});

test('the objective and habit scenes explain source-linked learning without inferred learner scores', () => {
  const en = guide.getProductDemoSteps('en', manifest()), ar = guide.getProductDemoSteps('ar', manifest());
  const objective = en.find(step => step.key === 'objective')!, habits = en.find(step => step.key === 'habits')!;
  assert.equal(objective.role, 'teacher'); assert.equal(objective.target, 'objective');
  assert.match(objective.explain, /outcome.based.*OBE/i);
  assert.match(objective.explain, /objective.*work.*teacher review.*evidence.*practice.*reassessment/i);
  assert.match(objective.explain, /not.*official.*mastery/i);
  assert.equal(habits.role, 'student'); assert.equal(habits.view, 'progress');
  assert.match(habits.explain, /practice.*revision.*reflection/i);
  assert.match(habits.explain, /BJ Fogg.*motivation.*ability.*prompt/i);
  assert.match(habits.explain, /design lens/i);
  assert.match(habits.explain, /not scored.*predicted/i);
  assert.match(habits.explain, /small.*cue.*help/i);
  assert.match(habits.explain, /not.*trait.*academic/i);
  for (const key of ['objective', 'habits']) {
    const translated = ar.find(step => step.key === key)!;
    assert.ok(/[\u0600-\u06ff]/.test(translated.title) && /[\u0600-\u06ff]/.test(translated.explain));
  }
});
test('fictional manual support native measurement task focus and XP keep their distinct meaning', () => {
  const steps = guide.getProductDemoSteps('en', manifest()), text = steps.map(step => step.explain).join(' ');
  assert.match(text, /fictional/i); assert.match(text, /teacher.authored/i); assert.match(text, /AI analysis.*disabled/i);
  assert.match(text, /not.*learner level/i); assert.match(text, /not.*causation/i); assert.match(text, /points.*separate.*grades/i);
  assert.match(steps.find(step => step.key === 'outcome')!.explain, /3.*7.*4/);
  assert.match(steps.find(step => step.key === 'development')!.explain, /2/);
});
