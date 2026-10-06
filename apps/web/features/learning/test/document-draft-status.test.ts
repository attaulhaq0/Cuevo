import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';

const source = ts.createSourceFile('submission-documents.tsx', readFileSync(new URL('../components/submission-documents.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveWorking = '', onSaved = '';
function find(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'saveWorking') saveWorking = node.getText(source);
  if (ts.isJsxAttribute(node) && node.name.getText(source) === 'onSaved' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && node.initializer.expression.getText(source).includes('saveWorking(saved.artifacts')) onSaved = node.initializer.expression.getText(source);
  ts.forEachChild(node, find);
}
find(source);
assert.ok(saveWorking && onSaved, 'Read the actual saved-document owner and receipt callback');
const script = ts.transpileModule(saveWorking + '\nglobalThis.change=saveWorking;globalThis.saved=' + onSaved + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test('the document owner marks only its confirmed saved baseline clean and later artifact edits dirty', () => {
  const drafts = new FormDrafts(), slot = 'school:actor:submission-documents:assessment', changes: unknown[] = [];
  const runtime = createContext({ formDrafts: drafts, slot, mode: 'draft', responseKind: 'FILE', setWorking: (value: unknown) => changes.push(value), setReceipt() {}, setMode() {}, onChanged() {} });
  new Script(script).runInContext(runtime);
  const saved = { artifacts: [{ id: 'retained-file' }], responseKind: 'FILE' };
  (runtime.saved as (value: unknown) => void)(saved);
  assert.equal(drafts.hasWorkingInput(), false); assert.equal(changes.length, 1);
  assert.equal(drafts.model<{ artifacts: { id: string }[] }>(slot)?.artifacts[0].id, 'retained-file');
  (runtime.change as (artifacts: unknown[], kind: string) => void)([], 'FILE');
  assert.equal(drafts.hasWorkingInput(), true, 'Removing a persisted artifact remains unsent work');
  (runtime.saved as (value: unknown) => void)({ artifacts: [], responseKind: 'FILE' });
  assert.equal(drafts.hasWorkingInput(), false);
});
