import assert from 'node:assert/strict';
import test from 'node:test';
import type { Membership } from '../../../shared/session/membership.ts';
import type { WorkspaceTarget } from '../../../shared/session/capabilities.ts';
import type { NavigationIntent } from '../../../shared/session/navigation-intent.ts';
import * as navigation from '../model.ts';

const labels: Record<WorkspaceTarget, string> = {
  overview: 'Overview', school: 'School', community: 'Community', portfolio: 'Portfolio',
  development: 'Development', curriculum: 'Curriculum context', restricted: 'Restricted records',
  learning: 'Learning', academic: 'Academic', progress: 'Progress', improvement: 'Next steps',
  access: 'Access details', account: 'Account',
};
const entitlements = ['school.operations', 'community', 'portfolio', 'learning', 'assessment', 'curriculum', 'learner.state', 'improvement', 'restricted.records'];
const member = (role: Membership['role'], enabled = entitlements) => ({ role, entitlements: enabled });

test('Brand uses workspace history for plain activation while preserving new-tab and window gestures', () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(navigation.isWorkspaceHomeActivation(plain), true);
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
    assert.equal(navigation.isWorkspaceHomeActivation({ ...plain, [modifier]: true }), false);
  }
  assert.equal(navigation.isWorkspaceHomeActivation({ ...plain, button: 1 }), false);
});

test('current role capabilities supply the sole destination catalogue without widening parent or student access', () => {
  assert.deepEqual(navigation.workspaceNavigation(member('parent'), labels).map(item => item.id),
    ['overview', 'school', 'community', 'portfolio', 'learning', 'academic', 'progress', 'access', 'account']);
  assert.deepEqual(navigation.workspaceNavigation(member('student'), labels).map(item => item.id),
    ['overview', 'school', 'community', 'portfolio', 'development', 'learning', 'academic', 'progress', 'improvement', 'access', 'account']);
  assert.deepEqual(navigation.workspaceNavigation(member('teacher', ['assessment']), labels).map(item => item.id), ['overview', 'access', 'account']);
});

test('unavailable URL destinations fall back to overview under the current catalogue', () => {
  const permitted = navigation.workspaceNavigation(member('parent'), labels);
  assert.equal(navigation.workspaceView(permitted, 'development'), 'overview');
  assert.equal(navigation.workspaceView(permitted, 'restricted'), 'overview');
  assert.equal(navigation.workspaceView(permitted, 'made-up'), 'overview');
  assert.equal(navigation.workspaceView(permitted, 'academic'), 'academic');
});

test('navigation refuses forbidden targets before history and preserves exact source intent and native Home history', () => {
  const permitted = navigation.workspaceNavigation(member('parent'), labels);
  const writes: { data: unknown; title: string; url: string | URL | null | undefined }[] = [];
  const history = { pushState(data: unknown, title: string, url?: string | URL | null) { writes.push({ data, title, url }); } };
  assert.equal(navigation.openWorkspaceDestination('development', permitted, '/school', history), false);
  assert.deepEqual(writes, []);
  const intent: NavigationIntent = { view: 'academic', source: 'result', id: '34c3a838-4d97-4c58-bb55-b41c86f26de4' };
  assert.equal(navigation.openWorkspaceDestination(intent, permitted, '/school', history), true);
  assert.equal(navigation.openWorkspaceDestination('overview', permitted, '/school', history), true);
  assert.deepEqual(writes, [
    { data: null, title: '', url: '/school?view=academic&source=result&id=34c3a838-4d97-4c58-bb55-b41c86f26de4' },
    { data: null, title: '', url: '/school' },
  ]);
});

test('profile destinations retain deep-link authority while the main rail contains only product workspaces', () => {
  const permitted = navigation.workspaceNavigation(member('parent'), labels);
  const rail = navigation.workspaceRailNavigation(permitted);
  assert.deepEqual(rail.map(item => item.id), ['overview', 'school', 'community', 'portfolio', 'learning', 'academic', 'progress']);
  assert.equal(navigation.workspaceView(permitted, 'account'), 'account');
  assert.equal(navigation.workspaceView(permitted, 'access'), 'access');
  assert.equal(rail[0], permitted[0]);
});

test('a confirmed command notice remains on its originating location and cannot become access-page feedback', () => {
  const message = 'Create named collection: Saved';
  assert.equal(navigation.currentWorkspaceNotice(message, '/?view=portfolio', '/?view=portfolio'), message);
  assert.equal(navigation.currentWorkspaceNotice(message, '/?view=portfolio', '/?view=access'), null);
  assert.equal(navigation.currentWorkspaceNotice(message, '/?view=academic&source=result&id=one', '/?view=academic&source=result&id=two'), null);
  assert.equal(navigation.currentWorkspaceNotice(null, null, '/?'), null);
});
test('notifications intent enters only the current authorized Community destination',()=>{
 const permitted=navigation.workspaceNavigation(member('student'),labels),writes:string[]=[];
 const history={pushState(_data:unknown,_title:string,url?:string|URL|null){writes.push(String(url));}};
 assert.equal(navigation.openWorkspaceDestination({view:'community',section:'notifications'},permitted,'/',history),true);
 assert.deepEqual(writes,['/?view=community&section=notifications']);
 assert.equal(navigation.openWorkspaceDestination({view:'community',section:'notifications'},navigation.workspaceNavigation(member('student',[]),labels),'/',history),false);
 assert.equal(writes.length,1);
});
