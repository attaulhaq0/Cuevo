export type WorkspaceTarget = 'overview' | 'access' | 'account' | 'learning' | 'academic' | 'progress' | 'improvement' | 'school' | 'community' | 'portfolio' | 'development' | 'curriculum'|'restricted';
const prerequisites: Record<WorkspaceTarget, readonly string[]> = {
  overview: [], access: [], account: [], school: ['school.operations'], community: ['community'],
  learning: ['learning'], academic: ['learning', 'assessment', 'curriculum'],
  progress: ['learning', 'assessment', 'curriculum', 'learner.state'],
  improvement: ['learning', 'assessment', 'curriculum', 'improvement'],
  portfolio: ['learning', 'assessment', 'curriculum', 'portfolio'],
  development: ['learning', 'learner.state'], curriculum: ['curriculum'],
  restricted:['school.operations','restricted.records'],
};
/** Presentation eligibility only; every API request rechecks current server authority. */
export function canOpenWorkspace(target: WorkspaceTarget, entitlements: readonly string[], role: string): boolean {
  if(target==='restricted'&&!['admin','teacher'].includes(role))return false;
  if ((target === 'improvement' || target === 'development') && role === 'parent') return false;
  if (target === 'curriculum' && !['admin', 'coordinator', 'teacher'].includes(role)) return false;
  return prerequisites[target].every(code => entitlements.includes(code));
}
