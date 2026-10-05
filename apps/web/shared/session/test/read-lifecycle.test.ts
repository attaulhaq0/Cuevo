import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
async function subject() { let module: Record<string, unknown> = {}; try { module = await import(pathToFileURL(resolve(import.meta.dirname, '../read-lifecycle.ts')).href); } catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; } assert.equal(typeof module.SessionReadLifecycle, 'function', 'session read lifecycle exists'); return module as typeof import('../read-lifecycle'); }

test('pausing read lifecycle aborts its admitted signal synchronously before a revocation callback', async () => {
  const { SessionReadLifecycle } = await subject(); const reads = new SessionReadLifecycle();
  const original = reads.capture(); let aborted = false; original.signal.addEventListener('abort', () => { aborted = true; });
  const ticket = reads.pause(); assert.equal(aborted, true); assert.equal(original.signal.aborted, true); assert.equal(reads.isCurrent(original), false); assert.equal(reads.enabled, false);
  assert.equal(reads.resume(ticket), true); const next = reads.capture(); assert.equal(next.signal.aborted, false); assert.equal(reads.isCurrent(original), false); assert.equal(reads.isCurrent(next), true);
});
test('an earlier failed sign-out cannot reopen a lifecycle invalidated by a newer actor event', async () => {
  const { SessionReadLifecycle } = await subject(); const reads = new SessionReadLifecycle(); const old = reads.pause(); const current = reads.pause();
  assert.equal(reads.resume(old), false); assert.equal(reads.enabled, false); assert.equal(reads.resume(current), true);
  const retained = reads.capture(); reads.pause(); assert.equal(reads.isCurrent(retained), false);
});
