import type { Assessment, Submission } from '../learning/model.ts';
export type { StudentTrailAction, StudentTrailAssets, StudentTrailContext, StudentTrailStage, StudentTrailStageKey } from './trail-model.ts';
export type { TeacherTrailAction, TeacherTrailContext, TeacherTrailItem, TeacherTrailQueueState } from './teacher-trail-model.ts';
export type { ParentTrailAction, ParentTrailChild, ParentTrailContext, ParentTrailSnapshot } from './parent-trail-model.ts';
export type HomeTarget = 'learning' | 'academic' | 'progress' | 'improvement' | 'school' | 'community' | 'portfolio' | 'development' | 'curriculum';
export type PendingWork = { assessmentId: string; title: string; dueAt: string | null; needsRevision: boolean };
export function pendingWork(assessments: Assessment[], submissions: Submission[], learnerId: string, now: number): PendingWork[] {
  return assessments.filter(assessment => assessment.status === 'PUBLISHED' && assessment.assignmentState === 'OPEN' && (!assessment.availableFrom || Date.parse(assessment.availableFrom) <= now) && (!assessment.availableUntil || Date.parse(assessment.availableUntil) > now) && (assessment.allowLate || !assessment.dueAt || Date.parse(assessment.dueAt) >= now)).flatMap(assessment => {
    const source = submissions.find(item => item.assessmentId === assessment.id && item.learnerId === learnerId);
    return source && source.status !== 'RETURNED' ? [] : [{ assessmentId: assessment.id, title: assessment.title, dueAt: assessment.dueAt, needsRevision: source?.status === 'RETURNED' }];
  }).sort((a, b) => Number(b.needsRevision) - Number(a.needsRevision) || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
}
export function scheduledUpcoming<T extends { startsAt: string; endsAt: string }>(items: T[], now: number): T[] { return items.filter(item => Date.parse(item.endsAt) >= now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)); }
