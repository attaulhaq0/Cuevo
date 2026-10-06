import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryDumpArgs, recoveryDumpScope } from './recovery-dump';

test('full and scratch backups share one synchronized snapshot without dropping domain authority', () => {
  const full = recoveryDumpArgs('full', '00000003-0000002A-1', '/tmp/cuevo_recovery_1790950000000-full.dump');
  const scratch = recoveryDumpArgs('scratch-domain', '00000003-0000002A-1', '/tmp/cuevo_recovery_1790950000000-scratch.dump');
  assert.deepEqual(full, ['exec', 'supabase_db_cuevo', 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc', '--no-owner', '--snapshot=00000003-0000002A-1', '-f', '/tmp/cuevo_recovery_1790950000000-full.dump']);
  assert.deepEqual(scratch, ['exec', 'supabase_db_cuevo', 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc', '--no-owner', '--snapshot=00000003-0000002A-1', '--exclude-extension=pg_cron', '--exclude-schema=cron', '-f', '/tmp/cuevo_recovery_1790950000000-scratch.dump']);
  assert.equal(full.some(value => value.startsWith('--exclude-')), false);
  assert.deepEqual(scratch.filter(value => value.startsWith('--exclude-')), ['--exclude-extension=pg_cron', '--exclude-schema=cron']);
  assert.deepEqual(recoveryDumpScope('full'), { kind: 'full', excludedExtensions: [], excludedSchemas: [], schedulerRestore: 'INCLUDED_NOT_TARGET_VERIFIED' });
  assert.deepEqual(recoveryDumpScope('scratch-domain'), { kind: 'scratch-domain', excludedExtensions: ['pg_cron'], excludedSchemas: ['cron'], schedulerRestore: 'REQUIRES_SEPARATE_TARGET_VERIFICATION' });
});

test('dump commands refuse arbitrary database, file and snapshot inputs', () => {
  for (const snapshot of ['', 'private snapshot', 'name;select', '../other', '00000003-0000002A-1\n']) assert.throws(() => recoveryDumpArgs('full', snapshot, '/tmp/cuevo_recovery_1790950000000-full.dump'));
  for (const path of ['/tmp/other.dump', '/tmp/cuevo_recovery_1790950000000.dump', '/tmp/../postgres.dump', 'C:/output.dump']) assert.throws(() => recoveryDumpArgs('full', '00000003-0000002A-1', path));
  assert.throws(() => recoveryDumpArgs('other' as 'full', '00000003-0000002A-1', '/tmp/cuevo_recovery_1790950000000-full.dump'));
});
