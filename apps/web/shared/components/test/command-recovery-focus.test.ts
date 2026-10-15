import assert from 'node:assert/strict';
import test from 'node:test';

function hub() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    addEventListener(type: string, listener: (event: unknown) => void) { const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set); },
    removeEventListener(type: string, listener: (event: unknown) => void) { listeners.get(type)?.delete(listener); },
    emit(type: string, event: unknown) { for (const listener of [...listeners.get(type) ?? []]) listener(event); },
    count() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
  };
}
function fixture() {
  const view = hub();
  const doc = Object.assign(hub(), { body: {}, activeElement: null as unknown, defaultView: view, visibilityState: 'visible', hasFocus: () => true });
  const children = new Set<unknown>();
  const form = { ownerDocument: doc, isConnected: true, contains: (node: unknown) => children.has(node) };
  const calls: unknown[] = [];
  const button = { tagName: 'BUTTON', ownerDocument: doc, form, isConnected: true, disabled: false, getClientRects: () => [{ width: 80, height: 40 }], focus: (options: unknown) => { calls.push(options); doc.activeElement = button; } };
  children.add(button); doc.activeElement = button;
  return { doc, view, form, button, calls, listeners: () => doc.count() + view.count(), lose: () => { button.disabled = true; doc.activeElement = doc.body; doc.emit('focusout', { target: button, relatedTarget: null }); button.disabled = false; } };
}
async function capture(f: ReturnType<typeof fixture>) {
  const api = await import('../command-recovery-focus.ts').catch(() => null);
  assert.equal(typeof api?.captureCommandRecoveryFocus, 'function', 'the browser form must own its bounded recovery focus');
  return api!.captureCommandRecoveryFocus(f.form as unknown as HTMLFormElement, f.button as unknown as HTMLButtonElement)!;
}

test('a focused owned submit that blurs while disabled restores its enabled recovery control once', async () => {
  const f = fixture(), owner = await capture(f); assert.equal(f.listeners(), 4);
  f.lose(); assert.equal(owner.restore(f.button as unknown as HTMLButtonElement), true);
  assert.deepEqual(f.calls, [{ preventScroll: true }]); assert.equal(f.doc.activeElement, f.button); assert.equal(f.listeners(), 0);
  assert.equal(owner.restore(f.button as unknown as HTMLButtonElement), false); owner.cancel(); assert.equal(f.calls.length, 1);
});
test('deliberate outside focus and a nonfocusable outside pointer cancel recovery without stealing focus', async () => {
  for (const type of ['focusin', 'pointerdown']) {
    const f = fixture(), owner = await capture(f); f.lose(); const outside = {};
    if (type === 'focusin') f.doc.activeElement = outside;
    f.doc.emit(type, { target: outside });
    assert.equal(owner.restore(f.button as unknown as HTMLButtonElement), false); assert.equal(f.calls.length, 0); assert.equal(f.listeners(), 0);
  }
});
test('document departure, scope cancellation and detached form or origin cannot restore a stale recovery', async () => {
  for (const mode of ['document', 'cancel', 'form-detached', 'origin-detached']) {
    const f = fixture(), owner = await capture(f); f.lose();
    if (mode === 'document') f.view.emit('blur', { target: f.view });
    if (mode === 'cancel') owner.cancel();
    if (mode === 'form-detached') f.form.isConnected = false;
    if (mode === 'origin-detached') f.button.isConnected = false;
    assert.equal(owner.restore(f.button as unknown as HTMLButtonElement), false); assert.equal(f.calls.length, 0); assert.equal(f.listeners(), 0);
  }
});
test('no observed native loss and a disabled or hidden recovery control never cause focus', async () => {
  for (const mode of ['not-lost', 'disabled', 'hidden']) {
    const f = fixture(), owner = await capture(f);
    if (mode !== 'not-lost') f.lose();
    if (mode === 'disabled') f.button.disabled = true;
    if (mode === 'hidden') f.button.getClientRects = () => [];
    assert.equal(owner.restore(f.button as unknown as HTMLButtonElement), false); assert.equal(f.calls.length, 0); assert.equal(f.listeners(), 0);
  }
});
test('a hidden document cannot receive recovery focus even with a retained focused-state hint', async () => {
  const f = fixture(), owner = await capture(f); f.lose(); f.doc.visibilityState = 'hidden';
  assert.equal(owner.restore(f.button as unknown as HTMLButtonElement), false); assert.equal(f.calls.length, 0); assert.equal(f.listeners(), 0);
});
