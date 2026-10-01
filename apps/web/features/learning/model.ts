import { LearningApiError } from '../../shared/api/client.ts';

export type Choice = { id: string; name: string };
export type Course = { id: string; classId: string; subjectId: string; title: string; description: string; status: string; createdAt: string };
export type Activity = { id: string; title: string; kind: string; instructions: string; sequence: number };
export type Lesson = { id: string; title: string; sequence: number; body: string; status: string; activities: Activity[] };
export type Unit = { id: string; title: string; sequence: number; lessons: Lesson[] };
export type CourseDetail = Course & { units: Unit[] };
type AssessmentBase = { id: string; courseId: string; title: string; instructions: string; status: string; dueAt: string | null; policyVersion: number; availableFrom: string | null; availableUntil: string | null; allowLate: boolean; assignmentState: 'OPEN' | 'CLOSED'; availabilityVersion: number; submissionKind: 'TEXT' | 'QUIZ' };
export type NumericAssessment = AssessmentBase & { model: 'numeric'; maxScore: number; rubricId: null };
export type Assessment = NumericAssessment | AssessmentBase & { model: 'rubric'; rubricId: string };
export type Submission = { id: string; assessmentId: string; learnerId: string; content: string; status: 'SUBMITTED' | 'RETURNED' | 'RESUBMITTED' | 'CLOSED'; revision: number; submittedAt: string; assessmentTitle: string; learnerName: string; previousSubmissionId: string | null; sourceReturnId: string | null; returnId: string | null; returnFeedback: string | null; returnedAt: string | null };
export type SubmissionDraft = { id: string | null; assessmentId: string; content: string; status: 'DRAFT'; revision: number; updatedAt: string | null };
export type Quiz = { id: string; assessmentId: string; version: string; policyVersion: number; questions: { key: string; prompt: string; options: { key: string; label: string }[] }[] };
export type QuizAttempt = { id: string; quizId: string; assessmentId: string; learnerId: string; submissionId: string; createdAt: string; status: 'CHECKED_NOT_GRADED'; checkedAnswers: { questionKey: string; optionKey: string; status: 'CORRECT' | 'INCORRECT' }[] };
export type QuizDefinition = Omit<Quiz, 'policyVersion' | 'questions'> & { createdAt: string; published: boolean; questions: (Quiz['questions'][number] & { correctOptionKey: string })[] };
export function parseDraft(value: unknown): SubmissionDraft {
  if (!isObject(value) || value.status !== 'DRAFT' || typeof value.assessmentId !== 'string' || typeof value.content !== 'string' || typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 0 || !(value.id === null || typeof value.id === 'string' && value.id) || !(value.updatedAt === null || date(value.updatedAt)) || (value.id === null) !== (value.revision === 0) || value.id === null && (value.content !== '' || value.updatedAt !== null)) throw new LearningApiError('invalid');
  return value as SubmissionDraft;
}
function quizQuestions(value: unknown, author: boolean) {
  if (!Array.isArray(value) || !value.length || value.length > 30 || new Set(value.map(question => isObject(question) ? question.key : null)).size !== value.length) return false;
  return value.every(question => isObject(question) && hasStrings(question, ['key', 'prompt']) && Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 10 && new Set(question.options.map(option => isObject(option) ? option.key : null)).size === question.options.length && question.options.every(option => isObject(option) && hasStrings(option, ['key', 'label'])) && (author ? typeof question.correctOptionKey === 'string' && question.options.some(option => option.key === question.correctOptionKey) : question.correctOptionKey === undefined));
}
export function parseQuiz(value: unknown): Quiz {
  if (!isObject(value) || !hasStrings(value, ['id', 'assessmentId', 'version']) || typeof value.policyVersion !== 'number' || !Number.isInteger(value.policyVersion) || value.policyVersion < 1 || !quizQuestions(value.questions, false)) throw new LearningApiError('invalid');
  return value as Quiz;
}
export function parseQuizDefinition(value: unknown): QuizDefinition {
  if (!isObject(value) || !hasStrings(value, ['id', 'assessmentId', 'version']) || !date(value.createdAt) || typeof value.published !== 'boolean' || !quizQuestions(value.questions, true)) throw new LearningApiError('invalid');
  return value as QuizDefinition;
}
export function parseQuizAttempt(value: unknown): QuizAttempt {
  if (!isObject(value) || !hasStrings(value, ['id', 'quizId', 'assessmentId', 'learnerId', 'submissionId']) || !date(value.createdAt) || value.status !== 'CHECKED_NOT_GRADED' || !Array.isArray(value.checkedAnswers) || !value.checkedAnswers.length || value.checkedAnswers.some(answer => !isObject(answer) || !hasStrings(answer, ['questionKey', 'optionKey']) || !['CORRECT', 'INCORRECT'].includes(String(answer.status)))) throw new LearningApiError('invalid');
  return value as QuizAttempt;
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function hasStrings(value: Record<string, unknown>, keys: string[]) { return keys.every((key) => typeof value[key] === 'string'); }
function date(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
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
export function parseAssessment(value: unknown): Assessment {
  if (!isObject(value) || !hasStrings(value, ['id', 'courseId', 'title', 'instructions', 'status']) || typeof value.policyVersion !== 'number' || !Number.isInteger(value.policyVersion) || value.policyVersion < 1 || (value.dueAt !== null && !date(value.dueAt))) throw new LearningApiError('invalid');
  const model = value.model ?? 'numeric';
  if (value.model !== undefined && ['availableFrom', 'availableUntil', 'allowLate', 'assignmentState', 'availabilityVersion', 'submissionKind'].some(key => value[key] === undefined)) throw new LearningApiError('invalid');
  if (model === 'numeric' ? typeof value.maxScore !== 'number' || !Number.isFinite(value.maxScore) || value.maxScore <= 0 || value.rubricId !== undefined && value.rubricId !== null : model !== 'rubric' || typeof value.rubricId !== 'string' || !value.rubricId || value.maxScore !== undefined) throw new LearningApiError('invalid');
  const availableFrom = value.availableFrom ?? null; const availableUntil = value.availableUntil ?? null;
  if (!(availableFrom === null || date(availableFrom)) || !(availableUntil === null || date(availableUntil)) || availableFrom && availableUntil && Date.parse(String(availableUntil)) <= Date.parse(String(availableFrom)) || value.assignmentState !== undefined && !['OPEN', 'CLOSED'].includes(String(value.assignmentState)) || value.submissionKind !== undefined && !['TEXT', 'QUIZ'].includes(String(value.submissionKind))) throw new LearningApiError('invalid');
  if (value.allowLate !== undefined && typeof value.allowLate !== 'boolean' || value.availabilityVersion !== undefined && (typeof value.availabilityVersion !== 'number' || !Number.isInteger(value.availabilityVersion) || value.availabilityVersion < 1)) throw new LearningApiError('invalid');
  return { ...value, model, rubricId: model === 'numeric' ? null : value.rubricId, availableFrom, availableUntil, allowLate: value.allowLate ?? true, assignmentState: value.assignmentState ?? 'OPEN', availabilityVersion: value.availabilityVersion ?? 1, submissionKind: value.submissionKind ?? 'TEXT' } as Assessment;
}
export function parseSubmission(value: unknown): Submission {
  if (!isObject(value) || !hasStrings(value, ['id', 'assessmentId', 'learnerId', 'content', 'status', 'submittedAt', 'assessmentTitle', 'learnerName']) || !['SUBMITTED', 'RETURNED', 'RESUBMITTED', 'CLOSED'].includes(String(value.status)) || !date(value.submittedAt) || typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 1) throw new LearningApiError('invalid');
  const previousSubmissionId = value.previousSubmissionId ?? null; const sourceReturnId = value.sourceReturnId ?? null;
  const returnId = value.returnId ?? null; const returnFeedback = value.returnFeedback ?? null; const returnedAt = value.returnedAt ?? null;
  if ([previousSubmissionId, sourceReturnId, returnId, returnFeedback].some(field => field !== null && (typeof field !== 'string' || !field)) || !(returnedAt === null || date(returnedAt)) || value.revision > 1 && (!previousSubmissionId || !sourceReturnId) || value.status === 'RETURNED' && (!returnId || !returnFeedback || !returnedAt)) throw new LearningApiError('invalid');
  return { ...value, previousSubmissionId, sourceReturnId, returnId, returnFeedback, returnedAt } as Submission;
}
