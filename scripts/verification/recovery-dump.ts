export type RecoveryDumpKind = 'full' | 'scratch-domain';
export function recoveryDumpScope(kind: RecoveryDumpKind) {
  if (kind !== 'full' && kind !== 'scratch-domain') throw Error('Explicit full or scratch-domain backup required.');
  return kind === 'full'
    ? { kind, excludedExtensions: [] as string[], excludedSchemas: [] as string[], schedulerRestore: 'INCLUDED_NOT_TARGET_VERIFIED' }
    : { kind, excludedExtensions: ['pg_cron'], excludedSchemas: ['cron'], schedulerRestore: 'REQUIRES_SEPARATE_TARGET_VERIFICATION' };
}
export function recoveryDumpArgs(kind: RecoveryDumpKind, snapshot: string, archivePath: string) {
  const scope = recoveryDumpScope(kind);
  if (!/^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}-[1-9][0-9]*$/.test(snapshot) || !new RegExp('^/tmp/cuevo_recovery_[0-9]{1,20}-' + (kind === 'full' ? 'full' : 'scratch') + '\\.dump$').test(archivePath)) throw Error('Recovery dump requires exact synchronized snapshot and generated archive identity.');
  return ['exec', 'supabase_db_cuevo', 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc', '--no-owner', '--snapshot=' + snapshot,
    ...scope.excludedExtensions.map(value => '--exclude-extension=' + value), ...scope.excludedSchemas.map(value => '--exclude-schema=' + value), '-f', archivePath];
}
