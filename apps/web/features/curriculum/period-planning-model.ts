import { z } from 'zod';
import { objectivePlanSchema, objectiveReplanSchema, objectiveTaughtSchema, objectiveAssessmentSchema } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { parseSchoolRow, type SchoolRow } from '../school/model.ts';
import { parseCourseDetail, choiceLabel, type Choice, type Lesson } from '../learning/model.ts';
import type { AcademicReference } from '../academic/model.ts';
import { parsePeriodCoverage, type PeriodCoverage } from './model.ts';

const uuid = z.uuid(), revision = z.number().int().positive();
const editorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), periodRevision: revision }).strict(),
  z.object({ kind: z.literal('replan'), planId: uuid, referenceId: uuid, periodRevision: revision, planRevision: revision }).strict(),
  z.object({ kind: z.enum(['taught', 'assessment']), planId: uuid, referenceId: uuid, periodRevision: revision }).strict(),
]);
export type PeriodPlanningEditor = z.infer<typeof editorSchema>;
const intentSchema = z.object({ editor: editorSchema.nullable(), cursor: uuid.nullable(), unitId: uuid.nullable(), unitCursor: uuid.nullable(), lessonCursor: uuid.nullable(), assessmentId: uuid.nullable(), assessmentVersion: revision.nullable(), referenceId: uuid.nullable(), referenceVersion: z.string().trim().min(1).max(200).nullable() }).strict();
export type PeriodPlanningIntent = z.infer<typeof intentSchema>;
export function parsePeriodPlanningSelection(value: unknown): { courseId: string; periodId: string } | null { const result = z.object({ courseId: z.union([uuid, z.literal('')]), periodId: z.union([uuid, z.literal('')]) }).strict().safeParse(value); return result.success ? result.data : null; }
export function parsePeriodPlanningIntent(value: unknown): PeriodPlanningIntent | null { const result = intentSchema.safeParse(value); return result.success ? result.data : null; }
export function emptyPeriodPlanningIntent(): PeriodPlanningIntent { return { editor: null, cursor: null, unitId: null, unitCursor: null, lessonCursor: null, assessmentId: null, assessmentVersion: null, referenceId: null, referenceVersion: null }; }
export type PeriodPlanningReadContext = { apiUrl: string; membership: { schoolId: string; userId: string; role: string; entitlements: string[] } | null; accessToken: string | null; accessGeneration: number; online: boolean; status: string };
export type PeriodPlanningRead<T> = { scope: string | null; value: T };
export function periodPlanningReadScope(context: PeriodPlanningReadContext, path: string, refresh: number): string | null {
  if (!context.online || context.status !== 'ready' || !context.accessToken || !context.membership || !['admin', 'teacher', 'coordinator'].includes(context.membership.role) || !['curriculum', 'learning', 'assessment', 'school.operations'].every(key => context.membership!.entitlements.includes(key))) return null;
  return JSON.stringify([context.apiUrl, context.membership.schoolId, context.membership.userId, context.membership.role, context.accessToken, context.online, context.accessGeneration, path, refresh]);
}
export { updateCurriculumSourceDenials as updatePeriodPlanningDenials, curriculumHasSourceDenial as periodPlanningHasDenial } from './workspace-model.ts';
export function currentPeriodPlanningRead<T>(read: PeriodPlanningRead<T> | null | undefined, scope: string | null): T | null { return scope && read?.scope === scope ? read.value : null; }
export type { CurriculumSourceRead as PeriodPlanningSourceRead, CurriculumSourceDenials as PeriodPlanningDenials } from './workspace-model.ts';
export function parseCurrentPeriodCoverage(value: unknown, courseId: string, periodId: string, periodRevision: number, cursor: string | null = null): PeriodCoverage {
  const coverage = parsePeriodCoverage(value);
  if (coverage.courseId !== courseId || coverage.periodId !== periodId || coverage.periodRevision !== periodRevision || coverage.endsOn < coverage.startsOn || coverage.items.some((plan, index) => plan.periodRevision > periodRevision || plan.sourceStatus === 'CURRENT' && plan.periodRevision !== periodRevision || cursor !== null && plan.id <= cursor || index > 0 && plan.id <= coverage.items[index - 1].id) || new Set(coverage.items.map(plan => plan.referenceId)).size !== coverage.items.length || coverage.nextCursor !== null && coverage.nextCursor !== coverage.items.at(-1)?.id) throw new LearningApiError('invalid');
  return coverage;
}
export type PlanningPeriod = SchoolRow & { name: string; startsOn: string; endsOn: string; revision: number };
export function parsePlanningPeriod(value: unknown): PlanningPeriod {
  const period = parseSchoolRow(value);
  if (!uuid.safeParse(period.id).success || typeof period.name !== 'string' || !period.name.trim() || !revision.safeParse(period.revision).success || !z.iso.date().safeParse(period.startsOn).success || !z.iso.date().safeParse(period.endsOn).success) throw new LearningApiError('invalid');
  return period as PlanningPeriod;
}
function choices(rows: { id: string; label: string; unavailable?: boolean }[]) { return rows.map(row => ({ value: row.id, label: row.label, requiresReview: !!row.unavailable || !row.label.trim() || rows.filter(other => other.label === row.label).length !== 1 })); }
export function periodPlanningChoices(rows: readonly SchoolRow[]) { return choices(rows.map(row => ({ id: row.id, label: `${row.name} · ${row.startsOn}–${row.endsOn}`, unavailable: row.recordState === 'CANCELLED' }))); }
export function periodPlanningCourseChoices(rows: readonly { id: string; title: string; classId: string; subjectId: string }[], classes: readonly Choice[], subjects: readonly Choice[]) {
  return choices(rows.map(row => { const classMatches = classes.filter(item => item.id === row.classId), subjectMatches = subjects.filter(item => item.id === row.subjectId); return { id: row.id, label: [row.title, classMatches.length === 1 ? choiceLabel(classMatches[0]) : null, subjectMatches.length === 1 ? subjectMatches[0].name : null].filter(Boolean).join(' · '), unavailable: classMatches.length !== 1 || subjectMatches.length !== 1 }; }));
}
export function parsePlanningLessons(value: unknown, courseId: string, unitId: string | null) {
  const course = parseCourseDetail(value);
  if (course.id !== courseId || !course.title.trim() || course.selectedUnitId === undefined || unitId !== null && course.selectedUnitId !== unitId || course.selectedUnitId !== null && course.units.filter(unit => unit.id === course.selectedUnitId).length !== 1) throw new LearningApiError('invalid');
  return course;
}
export function periodPlanningPath(courseId: string, editor: PeriodPlanningEditor): string { return editor.kind === 'create' ? `/v1/curriculum/courses/${courseId}/plans` : `/v1/curriculum/plans/${editor.planId}/${editor.kind === 'replan' ? 'revalidate' : editor.kind === 'assessment' ? 'assessments' : 'taught'}`; }
export function periodPlanningPendingPaths(courseId: string, editor: PeriodPlanningEditor | null): string[] { const create = `/v1/curriculum/courses/${courseId}/plans`; return editor && editor.kind !== 'create' ? [create, periodPlanningPath(courseId, editor)] : [create]; }

/** Recover only original command identity. Source facts and fresh approval
 * inputs must still come from current authorized reads. */
export function periodPlanningRecovery(commands:readonly Command[],courseId:string,periodId:string,plans:readonly{id:string;referenceId:string;periodRevision?:number}[]):{path:string;editor:PeriodPlanningEditor}|null {
 const matches=commands.flatMap<{path:string;editor:PeriodPlanningEditor}>(command=>{
  if(command.path===`/v1/curriculum/courses/${courseId}/plans`){const body=objectivePlanSchema.safeParse(command.body);return body.success&&body.data.periodId===periodId?[{path:command.path,editor:{kind:'create' as const,periodRevision:body.data.expectedPeriodRevision}}]:[];}
  const path=command.path.match(/^\/v1\/curriculum\/plans\/([^/]+)\/(revalidate|taught|assessments)$/),plan=path?plans.find(plan=>plan.id===path[1]):null;
  if(!path||!plan)return[];
  const body=path[2]==='revalidate'?objectiveReplanSchema.safeParse(command.body):path[2]==='taught'?objectiveTaughtSchema.safeParse(command.body):objectiveAssessmentSchema.safeParse(command.body);
  if(path[2]==='revalidate')return body.success&&plan.periodRevision?[{path:command.path,editor:{kind:'replan' as const,planId:plan.id,referenceId:plan.referenceId,periodRevision:body.data.expectedPeriodRevision,planRevision:plan.periodRevision}}]:[];
  return body.success?[{path:command.path,editor:{kind:path[2]==='taught'?'taught' as const:'assessment' as const,planId:plan.id,referenceId:plan.referenceId,periodRevision:body.data.expectedPeriodRevision}}]:[];
 });
 return matches.length===1?matches[0]:null;
}
type AssessmentSource = { id: string; courseId: string; referenceId?: string | null; status: string; policyVersion: number };
export function periodPlanningBody(editor: PeriodPlanningEditor, coverage: PeriodCoverage | null, values: Record<string, unknown>, sources: { references?: readonly AcademicReference[]; lessons?: readonly Lesson[]; assessments?: readonly AssessmentSource[] } = {}, todayUtc?: string): Record<string, unknown> {
  if (!coverage || coverage.periodRevision !== editor.periodRevision) throw new LearningApiError('conflict');
  const plan = editor.kind === 'create' ? null : coverage.items.find(row => row.id === editor.planId && row.referenceId === editor.referenceId);
  if (editor.kind === 'replan') {
    if (!plan || plan.periodRevision !== editor.planRevision || plan.sourceStatus !== 'REQUIRES_REVIEW' || editor.periodRevision <= editor.planRevision) throw new LearningApiError('conflict');
    return objectiveReplanSchema.parse({ ...values, expectedPeriodRevision: editor.periodRevision });
  }
  if (editor.kind === 'create' && coverage.planStatus === 'REQUIRES_REVIEW' || editor.kind !== 'create' && (!plan || plan.sourceStatus !== 'CURRENT' || plan.periodRevision !== editor.periodRevision)) throw new LearningApiError('conflict');
  if (editor.kind === 'create') {
    if (sources.references?.filter(row => row.id === values.referenceId && row.status === 'APPROVED').length !== 1) throw new LearningApiError('conflict');
    return objectivePlanSchema.parse({ ...values, periodId: coverage.periodId, expectedPeriodRevision: editor.periodRevision });
  }
  if (editor.kind === 'taught') {
    if (sources.lessons?.filter(row => row.id === values.lessonId).length !== 1 || !todayUtc || !z.iso.date().safeParse(values.taughtOn).success || String(values.taughtOn) < coverage.startsOn || String(values.taughtOn) > coverage.endsOn || String(values.taughtOn) > todayUtc) throw new LearningApiError('conflict');
    return objectiveTaughtSchema.parse({ ...values, expectedPeriodRevision: editor.periodRevision });
  }
  if (sources.assessments?.filter(row => row.id === values.assessmentId && row.courseId === coverage.courseId && row.referenceId === editor.referenceId && row.status === 'PUBLISHED' && row.policyVersion === values.expectedPolicyVersion).length !== 1) throw new LearningApiError('conflict');
  return objectiveAssessmentSchema.parse({ ...values, expectedPeriodRevision: editor.periodRevision });
}
const receiptSchema = z.object({ id: uuid, courseId: uuid, periodRevision: revision }).strict();
/** SQL echoes generated identity, exact course and period revision only. */
export function validatePeriodPlanningReceipt(value: unknown, original: Command, courseId: string, editor?: PeriodPlanningEditor): void {
  try {
    const create = original.path === `/v1/curriculum/courses/${courseId}/plans`, plan = original.path.match(/^\/v1\/curriculum\/plans\/([^/]+)\/(revalidate|taught|assessments)$/);
    const body = create ? objectivePlanSchema.parse(original.body) : plan && uuid.safeParse(plan[1]).success ? plan[2] === 'revalidate' ? objectiveReplanSchema.parse(original.body) : plan[2] === 'taught' ? objectiveTaughtSchema.parse(original.body) : objectiveAssessmentSchema.parse(original.body) : null;
    const receipt = receiptSchema.parse(value);
    if (!body || receipt.courseId !== courseId || receipt.periodRevision !== body.expectedPeriodRevision || editor && (original.path !== periodPlanningPath(courseId, editor) || body.expectedPeriodRevision !== editor.periodRevision || editor.kind === 'replan' && receipt.id === editor.planId)) throw new LearningApiError('invalid');
  } catch { throw new LearningApiError('invalid', true); }
}
