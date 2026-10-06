import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const source = ts.createSourceFile('period-planning.tsx', readFileSync(new URL('../components/period-planning.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let navigate = '', update = '', cancel = '';
function find(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const code = node.initializer.getText(source), name = node.name.getText(source);
    if (name === 'choose' && code.includes('formDrafts.saveModel(selectionSlot')) navigate = code;
    if (name === 'updateIntent') update = code;
    if (name === 'close' && code.includes('formDrafts.remove(inputSlot')) cancel = code;
  }
  ts.forEachChild(node, find);
}
find(source);
assert.ok(navigate && update && cancel, 'Read the actual planning navigation, editor and cancel owners');
const script = ts.transpileModule('globalThis.navigate=' + navigate + ';globalThis.update=' + update + ';globalThis.cancel=' + cancel + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test('planning browsing and pagination stay clean while an opened change survives until its own Cancel', () => {
  const drafts = new FormDrafts(), selectionSlot = 'school:actor:period-planning-selection', inputSlot = 'school:actor:/v1/curriculum/courses/course/plans:period:period:intent';
  const runtime = createContext({ formDrafts: drafts, selectionSlot, inputSlot, selectionLocked: false, pending: false, selectionRef: { current: null }, inputFocus: { current: null }, focusHeading: { current: false }, intent: { editor: null, cursor: null }, setCourseId() {}, setPeriodId() {}, setIntent() {}, emptyPeriodPlanningIntent: () => ({ editor: null, cursor: null }) });
  new Script(script).runInContext(runtime);
  (runtime.navigate as (course: string, period: string) => void)('course', 'period');
  assert.equal(drafts.hasWorkingInput(), false);
  (runtime.update as (patch: unknown) => void)({ cursor: 'next-page' });
  assert.equal(drafts.hasWorkingInput(), false);
  (runtime.update as (patch: unknown) => void)({ editor: { kind: 'assessment' }, assessmentId: 'chosen-task', assessmentVersion: 2 });
  assert.equal(drafts.hasWorkingInput(), true);
  (runtime.cancel as () => void)();
  assert.equal(drafts.hasWorkingInput(), false);
  assert.ok(drafts.model(selectionSlot), 'Cancel retains the clean course/period reading context');
});
