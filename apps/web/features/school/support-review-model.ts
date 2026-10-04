import { z } from 'zod';
import { learningSupportSchema, learningSupportRevokeSchema } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client.ts';

export const supportPath = '/v1/school/learning-support';
export type SupportSelection = { courseId: string; learnerId: string };
export type SupportInput = z.infer<typeof learningSupportSchema>;
type CourseSource = { id: string; title: string; status: string; contentState?: string };
type LearnerSource = { id: string; displayName: string; role: string; status: string };
type AssessmentSource = { id: string; courseId: string; title: string };

/** The endpoint remains the command journal slot; only working input is tuple-owned. */
export function supportDraftKey(selection: SupportSelection): string {
  return `${supportPath}:review:${selection.courseId}:${selection.learnerId}`;
}
export function parseSupportSelection(value: unknown): SupportSelection | null {
  const parsed = z.object({ courseId: z.string(), learnerId: z.string() }).strict().safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function supportRecovery(command: Command | undefined): { key: string; input: SupportInput } | null {
  if (!command || command.path !== supportPath) return null;
  const input = learningSupportSchema.safeParse(command.body);
  return input.success ? { key: command.key, input: input.data } : null;
}
export function supportChoices(rows: readonly { id: string; label: string }[], unavailable: string) {
  return rows.map(row => ({ value: row.id, label: row.label.trim() || unavailable, requiresReview: !row.label.trim() || rows.filter(other => other.label.trim() === row.label.trim()).length !== 1 }));
}
export function publishedSupportCourses(courses: readonly CourseSource[]): CourseSource[] {
  return courses.filter(course => course.status === 'PUBLISHED' && (course.contentState === undefined || course.contentState === 'PUBLISHED'));
}
export function currentSupportSelection(selection: SupportSelection, courses: readonly CourseSource[], learners: readonly LearnerSource[]): SupportSelection | null {
  const course = publishedSupportCourses(courses).find(row => row.id === selection.courseId);
  const learner = learners.find(row => row.id === selection.learnerId && row.role === 'student' && row.status === 'active');
  if (!course || !learner || !course.title.trim() || !learner.displayName.trim()
    || courses.filter(row => row.title.trim() === course.title.trim()).length !== 1
    || learners.filter(row => row.role === 'student' && row.displayName.trim() === learner.displayName.trim()).length !== 1) return null;
  return { courseId: course.id, learnerId: learner.id };
}
export function supportApprovalBody(selection: SupportSelection, values: FormData, assessments: readonly AssessmentSource[]): SupportInput {
  const assessmentId = String(values.get('assessmentId') ?? '') || null;
  if (!supportAssessmentCurrent(selection, assessmentId, assessments)) throw new LearningApiError('conflict');
  const input = learningSupportSchema.safeParse({ ...selection, assessmentId, title: String(values.get('title') ?? ''), instructions: String(values.get('instructions') ?? ''), effectiveFrom: String(values.get('effectiveFrom') ?? ''), effectiveTo: String(values.get('effectiveTo') ?? ''), studentVisible: values.get('studentVisible') === 'on', parentVisible: values.get('parentVisible') === 'on', reason: String(values.get('reason') ?? ''), confirmApproval: values.get('confirmApproval') === 'on' });
  if (!input.success) throw new LearningApiError('invalid');
  return input.data;
}
export function supportAssessmentCurrent(selection: SupportSelection, assessmentId: string | null, assessments: readonly AssessmentSource[]): boolean {
  if (!assessmentId) return true;
  const task = assessments.find(row => row.id === assessmentId && row.courseId === selection.courseId);
  return !!task && !!task.title.trim() && assessments.filter(row => row.courseId === selection.courseId && row.title.trim() === task.title.trim()).length === 1;
}
const receiptSchema = z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict();
/** The server supplies only id/revision; no returned learner/course identity is inferred. */
export function validateSupportReceipt(receipt: unknown, original: Command): void {
  const parsed = receiptSchema.safeParse(receipt);
  if (!parsed.success) throw new LearningApiError('invalid');
  if (original.path === supportPath) {
    if (!learningSupportSchema.safeParse(original.body).success || parsed.data.revision !== 1) throw new LearningApiError('invalid');
    return;
  }
  const target = original.path.match(/^\/v1\/school\/learning-support\/([^/]+)\/revoke$/)?.[1];
  const input = learningSupportRevokeSchema.safeParse(original.body);
  if (!target || !z.uuid().safeParse(target).success || !input.success || input.data.expectedRevision !== 1 || parsed.data.id !== target || parsed.data.revision !== 2) throw new LearningApiError('invalid');
}
