import type { Activity, Assessment, Lesson } from './model';
import type { ReleasedResult } from '../academic/model';
import { LearningApiError } from '../../shared/api/client';
import { parseAssessment } from './model';

export type JourneyState = 'available' | 'completed' | 'submitted' | 'returned' | 'released' | 'unknown';
export function journeyFeedbackRows<T extends ReleasedResult & { scope: string }>(rows: T[], scope: string, error: LearningApiError | null, moreError: LearningApiError | null): ReleasedResult[] {
  if ([error, moreError].some(value => value && ['denied', 'unauthorized'].includes(value.kind))) return [];
  return rows.filter(row => row.scope === scope);
}
export function journeySelection(lesson: Lesson, id: string | null): Activity | null {
  const rows = lesson.activities.filter(row => row.id === id);
  return rows.length === 1 ? rows[0] : null;
}
export function parseJourneyTask(value: unknown, activity: Activity, courseId: string): Assessment {
  const task = parseAssessment(value);
  if (!activity.assessmentId || task.id !== activity.assessmentId || task.courseId !== courseId) throw new LearningApiError('invalid');
  return task;
}
export function journeyTaskContext(activity: Activity, task: Assessment | null, results: ReleasedResult[], learnerId: string) {
  if (!activity.assessmentId) return { state: activity.completion ? 'completed' as const : activity.completion === null ? 'available' as const : 'unknown' as const, submission: null, feedback: null, earlier: false };
  if (!task || task.id !== activity.assessmentId) return { state: 'unknown' as const, submission: null, feedback: null, earlier: false };
  const submission = task.currentSubmission ?? null;
  if (submission && (submission.learnerId !== learnerId || submission.assessmentId !== task.id)) throw new LearningApiError('invalid');
  const matching = results.filter(row => row.learnerId === learnerId && row.assessmentId === task.id && row.status === 'RELEASED').toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const feedback = matching[0] ?? null;
  const currentReleased = !!submission && matching.some(row => row.submissionId === submission.id);
  const state: JourneyState = task.currentSubmission === undefined ? 'unknown' : submission?.status === 'RETURNED' ? 'returned' : currentReleased ? 'released' : submission ? 'submitted' : 'available';
  return { state, submission, feedback, earlier: !!feedback && feedback.submissionId !== submission?.id };
}
