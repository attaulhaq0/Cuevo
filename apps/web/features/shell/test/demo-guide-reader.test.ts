import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { quickLoginSession } from '../../auth/model.ts';
import type { DemoGuideManifest } from '../../../shared/session/demo-guide.ts';
import type { DemoGuideStep } from '../demo-guide-model.ts';

const component = readFileSync(new URL('../components/demo-guide.tsx', import.meta.url), 'utf8');
const readerSource = component.slice(component.indexOf('const visible='), component.indexOf('export function DemoGuide(')).replace('export function revealDemoScene', 'function revealDemoScene');
const parsed = ts.createSourceFile('demo-guide.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let goSource = '';
function findGo(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'go') goSource = node.getText(parsed);
  ts.forEachChild(node, findGo);
}
findGo(parsed);
assert.ok(readerSource.includes('function revealDemoScene') && goSource, 'Tests execute the actual reader and handoff functions.');
const extracted = ts.transpileModule(readerSource + '\n' + goSource + '\nglobalThis.reader = revealDemoScene; globalThis.go = go;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

/** Minimal DOM for selector branches. This does not simulate React, native
 * layout, protected source APIs or provider authentication. */
class ElementStub {
  parent: ElementStub | null = null;
  children: ElementStub[] = [];
  disabled = false;
  shown = true;
  clicks = 0;
  open = false;
  value = '';
  defaultValue = '';
  options: { value: string }[] = [];
  constructor(readonly tagName = 'div', readonly attrs: Record<string, string> = {}, readonly text = '') {}
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
  get dataset(): Record<string, string> { return Object.fromEntries(Object.entries(this.attrs).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])); }
  add(...children: ElementStub[]): this { children.forEach(child => { child.parent = this; this.children.push(child); }); return this; }
  getAttribute(name: string) { return this.attrs[name] ?? null; }
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  removeAttribute(name: string) { delete this.attrs[name]; }
  getClientRects() { return this.shown ? [{}] : []; }
  click() { this.clicks++; }
  dispatchEvent() { return true; }
  scrollIntoView() {}
  focus() {}
  matches(selector: string): boolean {
    const name = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (name && this.tagName.toLowerCase() !== name.toLowerCase()) return false;
    for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!(this.attrs.class ?? '').split(' ').includes(match[1])) return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (!(match[1] in this.attrs) || match[2] !== undefined && this.attrs[match[1]] !== match[2]) return false;
    return !selector.includes(':disabled') || this.disabled;
  }
  private descendants(): ElementStub[] { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector: string): ElementStub[] {
    return this.descendants().filter(element => selector.split(',').some(choice => {
      const chain = choice.trim().split(/\s+/); if (!element.matches(chain.pop()!)) return false;
      let ancestor = element.parent;
      for (const part of chain.reverse()) { while (ancestor && !ancestor.matches(part)) ancestor = ancestor.parent; if (!ancestor) return false; ancestor = ancestor.parent; }
      return true;
    }));
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector: string): ElementStub | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
}
class ButtonStub extends ElementStub { constructor(attrs: Record<string, string> = {}, text = '') { super('button', attrs, text); } }
class InputStub extends ElementStub {}
class TextareaStub extends ElementStub {}
class SelectStub extends ElementStub {}
const uuid = (index: number) => 'ce000000-0000-4000-8000-' + String(index).padStart(12, '0');
const manifest = {
  version: 1, schoolId: uuid(1), actors: { admin: uuid(2), coordinator: uuid(3), teacher: uuid(4), student: uuid(5), parent: uuid(6) },
  records: { courseId: uuid(11), baselineResultId: uuid(12), followupResultId: uuid(13), assignedPracticeId: uuid(14), measuredPracticeId: uuid(15), outcomeId: uuid(16), portfolioId: uuid(17), periodId: uuid(18), roomId: uuid(19), lessonId: uuid(20), activityId: uuid(21), proposalId: uuid(22), baselineSubmissionId: uuid(23), agenticProposalId: uuid(24), agenticRunId: uuid(25), agenticPracticeId: uuid(26) },
} as DemoGuideManifest & { records: { proposalId: string } };
const scene = (target: DemoGuideStep['target']): DemoGuideStep => ({ key: target, role: 'student', title: 'Current source', explain: 'Read current source', view: 'overview', target });
function runtime(main: ElementStub, extra: Record<string, unknown> = {}) {
  const document = new ElementStub('document').add(main);
  const context = createContext({ document, HTMLButtonElement: ButtonStub, HTMLInputElement: InputStub, HTMLTextAreaElement: TextareaStub, HTMLSelectElement: SelectStub, AbortSignal, requestAnimationFrame() {}, ...extra });
  new Script(extracted, { filename: 'demo-guide-extracted.js' }).runInContext(context);
  return context as typeof context & { reader: (step: DemoGuideStep, manifest: DemoGuideManifest) => ElementStub | null; go: (index: number) => Promise<void> };
}

test('thinking focus refuses a missing exact activity rather than declaring the whole journey ready', () => {
  const main = new ElementStub('main').add(new ElementStub('section', { class: 'student-learning-journey', 'data-lesson-id': manifest.records.lessonId }).add(
    new ButtonStub({ 'data-activity-choice': uuid(99), 'aria-current': 'step', 'aria-label': 'Open activity: Different activity' }),
    new ElementStub('div', { class: 'student-learning-journey__thinking' }),
  ));
  assert.equal(runtime(main).reader(scene('task-focus'), manifest), null);
});

test('a collapsed activity trail opens its existing chooser before selecting only the exact task', () => {
  const chooser = new ButtonStub({ class: 'student-learning-journey__change-step', 'aria-expanded': 'false' }, 'Change activity');
  const exact = new ButtonStub({ 'data-activity-choice': manifest.records.activityId, 'aria-label': 'Open activity: Use a method in a new example' });
  const previous = new ButtonStub({ 'data-activity-choice': uuid(99), 'aria-current': 'step' }, 'Previous activity');
  const commands = ['Submit work', 'Complete activity', 'Approve'].map(label => new ButtonStub({}, label));
  const focus = new ElementStub('div', { class: 'student-learning-journey__thinking' });
  exact.shown = false;
  const journey = new ElementStub('section', { class: 'student-learning-journey', 'data-lesson-id': manifest.records.lessonId }).add(chooser, previous, exact, focus, ...commands);
  const owner = runtime(new ElementStub('main').add(journey));
  assert.equal(owner.reader(scene('task-focus'), manifest), null);
  assert.equal(chooser.clicks, 1); assert.equal(exact.clicks, 0);
  chooser.setAttribute('aria-expanded', 'true');
  assert.equal(owner.reader(scene('task-focus'), manifest), null);
  assert.equal(chooser.clicks, 1, 'An already open chooser is never toggled closed while waiting');
  exact.shown = true;
  assert.equal(owner.reader(scene('task-focus'), manifest), null);
  assert.equal(exact.clicks, 1); assert.equal(previous.clicks, 0);
  exact.setAttribute('aria-current', 'step');
  assert.equal(owner.reader(scene('task-focus'), manifest), focus);
  assert.equal(chooser.clicks, 1); assert.equal(exact.clicks, 1);
  assert.ok(commands.every(button => button.clicks === 0));
});

test('same-name lesson choices use only the manifest record reading control', () => {
  const wrong = new ButtonStub({ 'data-lesson-choice': uuid(99), 'aria-label': 'Open lesson: Thinking through a checking step' });
  const exact = new ButtonStub({ 'data-lesson-choice': manifest.records.lessonId, 'aria-label': 'Open lesson: Thinking through a checking step' });
  const main = new ElementStub('main').add(wrong, exact);
  assert.equal(runtime(main).reader(scene('learning'), manifest), null);
  assert.equal(exact.clicks, 1); assert.equal(wrong.clicks, 0);
});

test('a same-title different proposal is refused and duplicate labels select only the exact record', () => {
  const selected = new ElementStub('section', { class: 'proposal-selected' }).add(new ElementStub('article', { 'data-recommendation-id': uuid(99) }).add(new ElementStub('h3', {}, 'Try a short checking exercise, then complete a follow-up.')));
  const wrong = new ButtonStub({ 'data-proposal-choice': uuid(99) }, 'Try a short checking exercise, then complete a follow-up.');
  const exact = new ButtonStub({ 'data-proposal-choice': manifest.records.proposalId }, 'Try a short checking exercise, then complete a follow-up.');
  const main = new ElementStub('main').add(selected, new ElementStub('section', { class: 'proposal-directory' }).add(wrong, exact));
  assert.equal(runtime(main).reader(scene('proposal'), manifest), null);
  assert.equal(exact.clicks, 1); assert.equal(wrong.clicks, 0);
});

test('an exact selected proposal and reviewed task region are the only ready source readers', () => {
  const proposal = new ElementStub('article', { 'data-recommendation-id': manifest.records.proposalId }).add(new ElementStub('h3', {}, 'Try a short checking exercise, then complete a follow-up.'));
  const main = new ElementStub('main').add(new ElementStub('section', { class: 'proposal-selected' }).add(proposal));
  assert.equal(runtime(main).reader(scene('proposal'), manifest), proposal);
  const focus = new ElementStub('div', { class: 'student-learning-journey__thinking' });
  const choice = new ButtonStub({ 'data-activity-choice': manifest.records.activityId, 'aria-current': 'step', 'aria-label': 'Open activity: Use a method in a new example' });
  const lesson = new ElementStub('section', { class: 'student-learning-journey', 'data-lesson-id': manifest.records.lessonId }).add(choice, focus);
  assert.equal(runtime(new ElementStub('main').add(lesson)).reader(scene('task-focus'), manifest), focus);
  assert.equal(choice.clicks, 0);
});

test('loaded exact analysis context stays open without toggling its existing read control', () => {
  const context = new ElementStub('section', { class: 'insight-context' });
  const opener = new ButtonStub({ 'aria-expanded': 'true' }, 'Show analysis source context');
  const proposal = new ElementStub('article', { 'data-recommendation-id': manifest.records.agenticProposalId! }).add(opener, context);
  const main = new ElementStub('main').add(new ElementStub('section', { class: 'proposal-selected' }).add(proposal));
  assert.equal(runtime(main).reader(scene('agentic-context'), manifest), context);
  assert.equal(opener.clicks, 0);
});

test('generated proposal and assigned practice refuse another source with the same title', () => {
  const otherProposal = new ElementStub('article', { 'data-recommendation-id': uuid(99) });
  const otherPractice = new ElementStub('article', { 'data-intervention-id': uuid(99) });
  const main = new ElementStub('main').add(new ElementStub('section', { class: 'proposal-selected' }).add(otherProposal), otherPractice);
  const owner = runtime(main);
  assert.equal(owner.reader(scene('agentic-proposal'), manifest), null);
  assert.equal(owner.reader(scene('agentic-practice'), manifest), null);
  const exactPractice = new ElementStub('article', { 'data-intervention-id': manifest.records.agenticPracticeId! }); main.add(exactPractice);
  assert.equal(owner.reader(scene('agentic-practice'), manifest), exactPractice);
});

test('personalization locates only its explicit ready panel after source checks settle', () => {
  const pending = new ElementStub('section', { 'data-presentation-personalization': '', 'data-personalization-state': 'loading' });
  const owner = runtime(new ElementStub('main').add(pending));
  assert.equal(owner.reader(scene('personalization'), manifest), null);
  pending.setAttribute('data-personalization-state', 'ready');
  assert.equal(owner.reader(scene('personalization'), manifest), pending);
});

test('discussion source errors and a generic directory never count as a ready room', () => {
  const states: Record<string, string>[] = [{ role: 'alert' }, { 'data-state': 'loading' }, { 'data-state': 'error' }];
  for (const attrs of states) {
    const reader = new ElementStub('section', { class: 'community-discussion' }).add(new ElementStub('div', attrs), new ElementStub('article', { class: 'community-post' }));
    const main = new ElementStub('main').add(new ElementStub('h1', {}, 'Checking ideas - class discussion'), reader);
    assert.equal(runtime(main).reader(scene('discussion'), manifest), null);
  }
  assert.equal(runtime(new ElementStub('main').add(new ElementStub('div', { class: 'community-workspace' }))).reader(scene('discussion'), manifest), null);
});

test('Parent and learner portfolio readers require the exact item and leave duplicate labels unselected', () => {
  for (const attribute of ['data-parent-portfolio-id', 'data-portfolio-id']) {
    const wrong = new ElementStub('article', { [attribute]: uuid(99) });
    const exact = new ElementStub('article', { [attribute]: manifest.records.portfolioId });
    assert.equal(runtime(new ElementStub('main').add(wrong, exact)).reader(scene('portfolio'), manifest), exact);
  }
  const one = new ButtonStub({}, 'How I checked my work'), two = new ButtonStub({}, 'How I checked my work');
  assert.equal(runtime(new ElementStub('main').add(one, two)).reader(scene('portfolio'), manifest), null);
  assert.equal(one.clicks + two.clicks, 0);
});

test('room reading clicks only the exact native read handle and never authority controls', () => {
  const read = new ButtonStub({}, 'Open discussion');
  const commands = ['Post message', 'Approve', 'Submit', 'Mark as read'].map(label => new ButtonStub({}, label));
  const room = new ElementStub('article', { 'data-room-id': manifest.records.roomId }).add(read, ...commands);
  const main = new ElementStub('main').add(room);
  assert.equal(runtime(main).reader(scene('discussion'), manifest), null);
  assert.equal(read.clicks, 1); assert.ok(commands.every(button => button.clicks === 0));
});

function handoff(drafts: FormDrafts) {
  const calls: string[] = [], errors: string[] = [];
  const app = { membership: { role: 'student', schoolId: manifest.schoolId, userId: manifest.actors.student }, status: 'ready', online: true, locale: 'en', commandJournal: { pending: () => [] }, formDrafts: drafts,
    signOut: async () => { calls.push('signOut'); return true; }, restoreSession: async () => { calls.push('restoreSession'); return true; } };
  const wrapper = new ElementStub('div', { 'data-demo-content': '' }), main = new ElementStub('main'); wrapper.add(main);
  const context = runtime(wrapper, { app, ar: false, latest: { current: { ...app, membership: null, status: 'signed-out' } }, busy: { current: false }, generation: { current: 0 }, panel: { current: null }, available: manifest, story: { manifest, index: 3 },
    getProductDemoSteps: () => [{ ...scene('proposal'), role: 'teacher' }], setError: (error: string) => errors.push(error), setPending() {}, setLocated() {}, onBusy() {}, setStory() {}, clear() {},
    quickLoginSession,
    fetch: async () => { calls.push('quickLogin'); throw Error('No external authentication in unit test'); } });
  return { context, calls, errors, wrapper };
}
const scope = manifest.schoolId + ':' + manifest.actors.student + ':';
const unsentVariants: [string, (drafts: FormDrafts) => void][] = [
    ['reflection', drafts => drafts.save(scope + 'reflection', { reflection: 'Unsent reflection' }, {})],
    ['cleared reflection', drafts => drafts.save(scope + 'reflection', { reflection: '' }, {})],
    ['checkbox', drafts => drafts.save(scope + 'approval', { confirm: false }, {})],
    ['submitted document choice', drafts => drafts.saveModel(scope + 'submission-documents:' + uuid(30), { responseKind: 'FILE', artifacts: [{ assetId: uuid(31) }] })],
    ['mentions', drafts => drafts.saveModel(scope + 'community-mentions:' + manifest.records.roomId, [uuid(32)])],
    ['portfolio documents', drafts => drafts.saveModel(scope + 'portfolio-documents:' + uuid(30) + ':' + uuid(31), [uuid(32)])],
    ['quiz structure', drafts => drafts.saveModel(scope + '/v1/assessments/' + uuid(30) + '/quiz', { questions: [{ id: uuid(31), options: [uuid(32), uuid(33)] }] })],
    ['rubric structure', drafts => drafts.saveModel(scope + '/v1/rubrics', [{ id: uuid(31), levels: [{ id: uuid(32) }] }])],
];
for (const [name, seed] of unsentVariants) {
  test('stored ' + name + ' refuses role handoff before signout with no current form mounted', async () => {
    const drafts = new FormDrafts(); seed(drafts);
    const { context, calls, errors, wrapper } = handoff(drafts); await context.go(0);
    assert.deepEqual(calls, [], name); assert.match(errors.at(-1) ?? '', /unsent work/, name); assert.equal(wrapper.getAttribute('inert'), null, name);
    assert.equal(drafts.hasWorkingInput(), true, name);
  });
}

test('cleared mention recipients and IDs-only source selection are clean presentation state', () => {
  const drafts = new FormDrafts();
  drafts.saveModel(scope + 'community-mentions:' + manifest.records.roomId, []);
  drafts.saveModel(scope + 'selected-practice-reader', { id: manifest.records.measuredPracticeId });
  assert.equal(drafts.hasWorkingInput(), false);
});

test('IDs-only reader selection stays clean and failed signout cannot issue quick login', async () => {
  const drafts = new FormDrafts(); drafts.saveModel(manifest.schoolId + ':' + manifest.actors.student + ':selected-practice-reader', { id: manifest.records.measuredPracticeId });
  assert.equal(drafts.hasWorkingInput(), false);
  const { context, calls, errors } = handoff(drafts);
  (context.app as { signOut: () => Promise<boolean> }).signOut = async () => { assert.equal((context.document as ElementStub).querySelector('[data-demo-content]')?.getAttribute('inert'), ''); calls.push('signOut'); return false; };
  await context.go(0);
  assert.deepEqual(calls, ['signOut']); assert.match(errors.at(-1) ?? '', /could not be opened/);
});

test('a newer current session refuses late quick-login restoration after confirmed signout', async () => {
  const { context, calls, errors, wrapper } = handoff(new FormDrafts());
  context.fetch = async () => {
    calls.push('quickLogin');
    (context.latest as { current: unknown }).current = { membership: { userId: uuid(99) }, status: 'ready' };
    return { ok: true, json: async () => ({ role: 'teacher', session: { access_token: 'unit-token', refresh_token: 'unit-refresh' } }) };
  };
  await context.go(0);
  assert.deepEqual(calls, ['signOut', 'quickLogin']);
  assert.match(errors.at(-1) ?? '', /could not be opened/);
  assert.equal(wrapper.getAttribute('inert'), null);
});

test('offline role handoff retains the session and refuses signout or login', async () => {
  const { context, calls, errors, wrapper } = handoff(new FormDrafts());
  (context.app as { online: boolean }).online = false;
  await context.go(0);
  assert.deepEqual(calls, []);
  assert.match(errors.at(-1) ?? '', /Reconnect/);
  assert.equal(wrapper.getAttribute('inert'), null);
});

test('current scene admission observes membership scope access generation and current parent child', () => {
  // Structural guard only. Browser acceptance must prove that changed authority
  // clears highlighted source/readiness without a forbidden source operation.
  for (const field of ['schoolId', 'role', 'entitlements', 'accessGeneration', 'selectedChildId']) {
    assert.ok(component.includes('latest.current.' + field) || component.includes('latest.current.membership?.' + field) || component.includes('latest.current.membership.' + field) || component.includes('app.' + field) || component.includes('app.membership?.' + field) || component.includes('app.membership.' + field), 'Current guide admission must observe ' + field);
  }
  assert.ok(component.includes('app.selectedChildId') && component.includes('app.accessGeneration'));
});

test('initial guide handoff failure remains visible with an accessible recovery', () => {
  // The first handoff has no confirmed story yet. Inspect that actual return
  // branch, without inventing a React hook tree or a provider session.
  const first = component.indexOf('if(!story)return');
  let initialBranch = '';
  function findInitial(node: ts.Node) {
    if (ts.isIfStatement(node) && node.getStart(parsed) === first) initialBranch = node.getText(parsed);
    ts.forEachChild(node, findInitial);
  }
  findInitial(parsed);
  assert.ok(initialBranch, 'The parser must retain the actual story-null return branch.');
  assert.ok(initialBranch.includes('error') && initialBranch.includes('role="alert"'), 'Initial failure must render its localized error');
  assert.ok(initialBranch.includes('Retry') || initialBranch.includes('أعد المحاولة'), 'Initial failure must offer recovery');
  assert.ok(!initialBranch.includes("app.status==='ready'?"), 'A successful signout followed by quick-login failure must not hide initial recovery');
});
