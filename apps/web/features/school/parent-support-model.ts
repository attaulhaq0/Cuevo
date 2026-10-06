import { learnerProfileSchema } from '@cuevo/contracts';
import { LearningApiError } from '../../shared/api/client.ts';
import { parseLearningSupport, type LearningSupport } from './model.ts';

export type ParentLearnerProfile = ReturnType<typeof parseParentLearnerProfile>;
export function parseParentLearnerProfile(value: unknown) {
  const parsed = learnerProfileSchema.safeParse(value);
  if (!parsed.success) throw new LearningApiError('invalid');
  return parsed.data;
}
export function parentSupportCourses(profile: ParentLearnerProfile) {
  const choices = profile.courses.map(course => ({ value: course.id, label: [course.title, course.className, course.subjectName].join(' · ') }));
  return choices.map(choice => ({ ...choice, requiresReview: choices.filter(other => other.label === choice.label).length !== 1 }));
}
export function parentSupportPath(profile: ParentLearnerProfile | null, learnerId: string, courseId: string) {
  if (!profile || profile.id !== learnerId || !parentSupportCourses(profile).some(choice => choice.value === courseId && !choice.requiresReview)) return null;
  return `/v1/school/learning-support?limit=25&learnerId=${learnerId}&courseId=${courseId}`;
}
export function parseParentLearningSupport(value: unknown): LearningSupport {
  const source = parseLearningSupport(value);
  if (!value || typeof value !== 'object' || !('parentVisible' in value) || value.parentVisible !== true || 'approvalReason' in value || source.assessmentId !== null && !source.assessmentTitle) throw new LearningApiError('invalid');
  return source;
}
export function parentSupportMatches(sources: LearningSupport[], learnerId: string, courseId: string) {
  return sources.every(source => source.learnerId === learnerId && source.courseId === courseId);
}
