import type { Assessment, Submission } from '../learning/model.ts';
import type{NavigationIntent}from'../../shared/session/navigation-intent.ts';
export type HomeTarget = 'learning' | 'academic' | 'progress' | 'improvement' | 'school' | 'community' | 'portfolio' | 'development' | 'curriculum';
export type HomeDestination=HomeTarget|NavigationIntent;
export type PendingWork = { assessmentId: string; title: string; dueAt: string | null; needsRevision: boolean };
export function pendingWork(assessments: Assessment[], submissions: Submission[], learnerId: string, now: number): PendingWork[] {
  return assessments.filter(assessment => assessment.status === 'PUBLISHED' && assessment.assignmentState === 'OPEN' && (!assessment.availableFrom || Date.parse(assessment.availableFrom) <= now) && (!assessment.availableUntil || Date.parse(assessment.availableUntil) > now) && (assessment.allowLate || !assessment.dueAt || Date.parse(assessment.dueAt) >= now)).flatMap(assessment => {
    const source = assessment.currentSubmission !== undefined ? assessment.currentSubmission : submissions.find(item => item.assessmentId === assessment.id && item.learnerId === learnerId);
    if (source && source.learnerId !== learnerId) return [];
    return source && source.status !== 'RETURNED' ? [] : [{ assessmentId: assessment.id, title: assessment.title, dueAt: assessment.dueAt, needsRevision: source?.status === 'RETURNED' }];
  }).sort((a, b) => Number(b.needsRevision) - Number(a.needsRevision) || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
}
export function scheduledUpcoming<T extends { startsAt: string; endsAt: string }>(items: T[], now: number): T[] { return items.filter(item => Date.parse(item.endsAt) >= now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)); }
