import { LearningApiError } from './learning-api.ts';

export type Choice = { id: string; name: string };
export type Course = { id: string; classId: string; subjectId: string; title: string; description: string; status: string; createdAt: string };
export type Activity = { id: string; title: string; kind: string; instructions: string; sequence: number };
export type Lesson = { id: string; title: string; sequence: number; body: string; status: string; activities: Activity[] };
export type Unit = { id: string; title: string; sequence: number; lessons: Lesson[] };
export type CourseDetail = Course & { units: Unit[] };
export type Assessment = { id: string; courseId: string; title: string; instructions: string; maxScore: number; status: string; dueAt: string | null; policyVersion: number };
export type Submission = { id: string; assessmentId: string; learnerId: string; content: string; status: string; revision: number; submittedAt: string; assessmentTitle: string; learnerName: string };
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function hasStrings(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string'); }
function date(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function parseList<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!isObject(value) || !Array.isArray(value.items) || value.items.length > 100) throw new LearningApiError('invalid');
  return value.items.map(parse);
}
export function parseChoice(value: unknown): Choice { if (!isObject(value) || !hasStrings(value, ['id', 'name'])) throw new LearningApiError('invalid'); return value as Choice; }
export function parseCourse(value: unknown): Course { if (!isObject(value) || !hasStrings(value, ['id', 'classId', 'subjectId', 'title', 'description', 'status', 'createdAt']) || !date(value.createdAt)) throw new LearningApiError('invalid'); return value as Course; }
export function parseActivity(value: unknown): Activity { if (!isObject(value) || !hasStrings(value, ['id', 'title', 'kind', 'instructions']) || typeof value.sequence !== 'number') throw new LearningApiError('invalid'); return value as Activity; }
export function parseLesson(value: unknown): Lesson { if (!isObject(value) || !hasStrings(value, ['id', 'title', 'body', 'status']) || typeof value.sequence !== 'number' || !Array.isArray(value.activities)) throw new LearningApiError('invalid'); return { ...value, activities: value.activities.map(parseActivity) } as Lesson; }
export function parseCourseDetail(value: unknown): CourseDetail {
  const course = parseCourse(value);
  if (!isObject(value) || !Array.isArray(value.units)) throw new LearningApiError('invalid');
  const units = value.units.map((unit) => { if (!isObject(unit) || !hasStrings(unit, ['id', 'title']) || typeof unit.sequence !== 'number' || !Array.isArray(unit.lessons)) throw new LearningApiError('invalid'); return { ...unit, lessons: unit.lessons.map(parseLesson) } as Unit; });
  return { ...course, units };
}
export function parseAssessment(value: unknown): Assessment { if (!isObject(value) || !hasStrings(value, ['id', 'courseId', 'title', 'instructions', 'status']) || typeof value.maxScore !== 'number' || !Number.isFinite(value.maxScore) || value.maxScore <= 0 || typeof value.policyVersion !== 'number' || !Number.isInteger(value.policyVersion) || value.policyVersion < 1 || (value.dueAt !== null && !date(value.dueAt))) throw new LearningApiError('invalid'); return value as Assessment; }
export function parseSubmission(value: unknown): Submission { if (!isObject(value) || !hasStrings(value, ['id', 'assessmentId', 'learnerId', 'content', 'status', 'submittedAt', 'assessmentTitle', 'learnerName']) || !date(value.submittedAt) || typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 1) throw new LearningApiError('invalid'); return value as Submission; }
