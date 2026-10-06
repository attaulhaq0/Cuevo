export type CompanionName = 'foxi' | 'owl' | 'rabbit' | 'turtle';
export type CompanionState = 'ready' | 'read' | 'work' | 'acknowledge';
export type CompanionPose = { src: string; width: number; height: number };
export type CompanionRegistry = Record<CompanionName, Partial<Record<Exclude<CompanionState, 'acknowledge'>, CompanionPose>>>;
export type CompanionReceipt = { key: string; current: true; confirmed: true };

const allowed = ['foxi', 'owl', 'rabbit', 'turtle'] as const;
/** Defensive presentation lookup only; no policy, inference or source award. */
export function resolveCompanionPose(registry: CompanionRegistry, character: string, state: string, failedSources: readonly string[] = []): CompanionPose | null {
  if (!allowed.some(name => name === character)) return null;
  const poses = registry[character as CompanionName];
  const requested = state === 'read' || state === 'work' ? poses[state] : poses.ready;
  const valid = (pose: CompanionPose | undefined) => !!pose && !failedSources.includes(pose.src) && pose.src.trim().length > 0 && Number.isFinite(pose.width) && pose.width > 0 && Number.isFinite(pose.height) && pose.height > 0;
  return valid(requested) ? requested! : valid(poses.ready) ? poses.ready! : null;
}
