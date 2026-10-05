import type { Command } from '../../shared/api/client';

/** Every command currently mounted by MarkingDetail owns its original source
 * until receipt settlement; reader navigation cannot orphan that recovery. */
export function markingNavigationLocked(commands: readonly Command[]): boolean {
  return commands.some(command => /^\/v1\/(?:submissions\/[^/]+\/(?:results|closed-result|return|close)|results\/[^/]+\/release|assessments\/[^/]+\/reference)$/.test(command.path));
}
