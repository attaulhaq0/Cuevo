import type { Command } from '../../shared/api/client.ts';

/** Source-changing academic commands keep the current reader/recovery reachable. */
export function academicNavigationLocked(commands: readonly Command[]): boolean {
  return commands.some(command => /^\/v1\/(?:academic-references(?:\/[^/]+\/approve)?|rubrics|assessments\/[^/]+\/(?:reference|rubric)|submissions\/[^/]+\/(?:results|closed-result|return|close)|results\/[^/]+\/(?:release|publication)|courses\/[^/]+\/gradebook\/release)$/.test(command.path));
}
