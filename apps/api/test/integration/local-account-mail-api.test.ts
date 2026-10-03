import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalAccountMail } from '../../src/platform/identity/local-account-mail';
import { assertCuevoLocalTarget, type LocalStatus } from '../../../../scripts/configure-local';
import { withFixtureCleanup } from './fixture-cleanup';

describe.skipIf(process.env.CUEVO_REQUIRE_INTEGRATION !== '1')('fixed local Mailpit invitation capture', () => {
  it('captures one exact owned bilingual invitation and removes only its captured message', async () => {
    const status = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as LocalStatus & { INBUCKET_URL?: string };
    assertCuevoLocalTarget(status);
    if (status.INBUCKET_URL !== 'http://127.0.0.1:56324') throw Error('Exact local capture service required.');
    const requestId = randomUUID(); const email = `mail-proof-${requestId}@example.test`;
    const url = `http://localhost:3000/account/admission#id=${requestId}&type=invite&token_hash=nonredeemable-proof&admission_secret=${'a'.repeat(64)}`;
    const capture = createLocalAccountMail({ mode: 'LOCAL_SYNTHETIC', webOrigin: 'http://localhost:3000' });
    const lookup = async () => {
      const response = await fetch(`http://127.0.0.1:56324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=2`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      if (!response.ok) throw Error('Owned capture lookup unavailable.');
      const result = await response.json() as { messages: { ID: string }[] };
      if (!Array.isArray(result.messages)) throw Error('Owned capture lookup invalid.'); return result.messages;
    };
    let ids: string[] = [];
    await withFixtureCleanup(async () => {
      expect(await lookup()).toEqual([]);
      expect(await capture({ requestId, email, admissionUrl: url, expiresAt: new Date(Date.now() + 60000).toISOString(), signal: new AbortController().signal })).toEqual({ state: 'ACCEPTED' });
      const messages = await lookup(); ids = messages.map(row => row.ID); expect(ids).toHaveLength(1);
      const response = await fetch(`http://127.0.0.1:56324/api/v1/message/${ids[0]}`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      expect(response.ok).toBe(true);
      const message = await response.json() as { Text: string; To: { Address: string }[]; Subject: string };
      expect(message.Subject).toBe('Cuevo school invitation · دعوة المدرسة'); expect(message.To).toEqual([{ Name: '', Address: email }]);
      expect(message.Text).toContain(url); expect(message.Text).toContain('تابع فقط');
    }, [async () => {
      if (!ids.length) ids = (await lookup()).map(row => row.ID);
      if (ids.length) {
        if (ids.length !== 1 || !/^[A-Za-z0-9_-]{1,100}$/.test(ids[0])) throw Error('Capture cleanup refuses uncertain message ownership.');
        const removed = await fetch('http://127.0.0.1:56324/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: ids }), signal: AbortSignal.timeout(3000), redirect: 'error' });
        if (!removed.ok) throw Error('Owned capture removal unavailable.'); expect(await lookup()).toEqual([]);
      }
    }]);
  }, 20000);
});
