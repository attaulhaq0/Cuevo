import { LearningApiError } from '../../shared/api/client.ts';

export type Choice = { id: string; name: string;yearGroupName?:string;academicYearName?:string };
export function choiceLabel(choice:Choice){return[choice.name,choice.yearGroupName,choice.academicYearName].filter(Boolean).join(' · ');}
export function parseLifecycleAvailability(value:unknown):{items:{id:string;readOnly:true}[]}{if(!isObject(value)||!Array.isArray(value.items)||value.items.some(item=>!isObject(item)||typeof item.id!=='string'||item.readOnly!==true))throw new LearningApiError('invalid');return value as{items:{id:string;readOnly:true}[]};}
type ContentMetadata={contentRevision?:number;contentState?:'DRAFT'|'PUBLISHED'|'RETIRED'};
export type Course = ContentMetadata & { id: string; classId: string; subjectId: string; title: string; description: string; status: string; createdAt: string };
export type Activity = { assessmentId?:string|null;contentRevision?:number;contentState?:'DRAFT'|'PUBLISHED'|'RETIRED'; id: string; title: string; kind: string; instructions: string; sequence: number; completion?: { id: string; completedAt: string } | null };
export type Lesson = ContentMetadata & { id: string; title: string; sequence: number; body: string; status: string; activities: Activity[] };
export type Unit = ContentMetadata & { id: string; title: string; sequence: number; lessons: Lesson[]; nextLessonSequence?: number };
export type CourseDetail = Course & { units: Unit[]; selectedUnitId?: string | null; nextUnitCursor?: string | null; nextLessonCursor?: string | null; nextUnitSequence?: number; curriculumContext?: { version: number; programmeId: string | null; referenceId: string | null } };

/** Display helpers consume current authorized projections; they add no school facts. */
export function learningTitle(title: string, unavailable: string): string { return title.trim() || unavailable; }
export function activityKindLabel(kind: string, labels: Record<string, string>, unavailable: string): string {
  return Object.hasOwn(labels, kind) ? labels[kind] : unavailable;
}
export function activityCompletionState(activity: Activity): 'confirmed' | 'not-recorded' | 'unknown' {
  return activity.completion ? 'confirmed' : activity.completion === null ? 'not-recorded' : 'unknown';
}
export function currentActivityCompletion(value: unknown, activityId: string, learnerId: string): NonNullable<Activity['completion']> {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id || value.activityId !== activityId || value.learnerId !== learnerId || !date(value.completedAt) || !(value.reflection === null || typeof value.reflection === 'string')) throw new LearningApiError('invalid', true);
  return { id: value.id, completedAt: value.completedAt as string };
}
export function currentCourseReading(value: unknown, courseId: string, selectedUnitId: string | null): CourseDetail {
  const course = parseCourseDetail(value);
  if (course.id !== courseId || selectedUnitId && course.selectedUnitId !== undefined && course.selectedUnitId !== selectedUnitId) throw new LearningApiError('invalid');
  return course;
}
export function courseReadingContext(course: CourseDetail, lessonId: string | null, activityId: string | null) {
  const unit = course.selectedUnitId !== undefined
    ? course.units.find(item => item.id === course.selectedUnitId) ?? null
    : course.units.find(item => item.lessons.some(lesson => lesson.id === lessonId)) ?? course.units.find(item => item.lessons.length > 0) ?? course.units[0] ?? null;
  const lesson = unit?.lessons.find(item => item.id === lessonId) ?? null;
  const activity = lesson?.activities.find(item => item.id === activityId) ?? null;
  return { unit, lesson, activity };
}
type AssessmentBase = { courseTitle?:string|null;id: string; courseId: string; title: string; instructions: string; status: string; dueAt: string | null; policyVersion: number; availableFrom: string | null; availableUntil: string | null; allowLate: boolean; assignmentState: 'OPEN' | 'CLOSED'; availabilityVersion: number; submissionKind: 'TEXT' | 'QUIZ';preparationVersion?:number;intendedSubmissionKind?:'TEXT'|'QUIZ';intendedModel?:'numeric'|'rubric';referenceId?:string|null; currentSubmission?: Submission | null };
export type NumericAssessment = AssessmentBase & { model: 'numeric'; maxScore: number; rubricId: null };
export type Assessment = NumericAssessment | AssessmentBase & { model: 'rubric'; rubricId: string };
export type Submission = { id: string; assessmentId: string; learnerId: string; content: string; responseKind?: 'TEXT' | 'FILE'; artifactCount?: number; status: 'SUBMITTED' | 'RETURNED' | 'RESUBMITTED' | 'CLOSED'; revision: number; submittedAt: string; assessmentTitle: string; learnerName: string; previousSubmissionId: string | null; sourceReturnId: string | null; returnId: string | null; returnFeedback: string | null; returnedAt: string | null };
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
function contentMetadata(value:Record<string,unknown>){return(value.contentRevision===undefined||Number.isInteger(value.contentRevision)&&Number(value.contentRevision)>0)&&(value.contentState===undefined||['DRAFT','PUBLISHED','RETIRED'].includes(String(value.contentState)));}
export function parseCourse(value: unknown): Course { if (!isObject(value) || !hasStrings(value, ['id', 'classId', 'subjectId', 'title', 'description', 'status', 'createdAt']) || !date(value.createdAt)||!contentMetadata(value)) throw new LearningApiError('invalid'); return value as Course; }
export function parseActivity(value: unknown): Activity { if (!isObject(value) || !hasStrings(value, ['id', 'title', 'kind', 'instructions']) || typeof value.sequence !== 'number'||!contentMetadata(value)||value.assessmentId!==undefined&&value.assessmentId!==null&&typeof value.assessmentId!=='string' || value.completion !== undefined && value.completion !== null && (!isObject(value.completion) || !hasStrings(value.completion, ['id']) || !date(value.completion.completedAt))) throw new LearningApiError('invalid'); return value as Activity; }
export function parseLesson(value: unknown): Lesson { if (!isObject(value) || !hasStrings(value, ['id', 'title', 'body', 'status']) || typeof value.sequence !== 'number'||!contentMetadata(value) || !Array.isArray(value.activities)) throw new LearningApiError('invalid'); return { ...value, activities: value.activities.map(parseActivity) } as Lesson; }
export function parseCourseDetail(value: unknown): CourseDetail {
  const course = parseCourse(value);
  if (!isObject(value) || !Array.isArray(value.units)) throw new LearningApiError('invalid');
  const units = value.units.map((unit) => { if (!isObject(unit) || !hasStrings(unit, ['id', 'title']) || typeof unit.sequence !== 'number'||!contentMetadata(unit) || !Array.isArray(unit.lessons)) throw new LearningApiError('invalid'); return { ...unit, lessons: unit.lessons.map(parseLesson) } as Unit; });
  if (['selectedUnitId', 'nextUnitCursor', 'nextLessonCursor'].some(key => value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string')) throw new LearningApiError('invalid');
  if (value.curriculumContext !== undefined && (!isObject(value.curriculumContext) || !Number.isInteger(value.curriculumContext.version) || Number(value.curriculumContext.version) < 1)) throw new LearningApiError('invalid');
  return { ...course, units, ...(value.curriculumContext !== undefined ? { curriculumContext: value.curriculumContext as CourseDetail['curriculumContext'] } : {}), ...(value.nextUnitSequence !== undefined ? { nextUnitSequence: Number(value.nextUnitSequence) } : {}), ...(value.selectedUnitId !== undefined ? { selectedUnitId: value.selectedUnitId as string | null, nextUnitCursor: value.nextUnitCursor as string | null, nextLessonCursor: value.nextLessonCursor as string | null } : {}) };
}
export function parseAssessment(value: unknown): Assessment {
  if(isObject(value)&&(value.courseTitle!==undefined&&value.courseTitle!==null&&(typeof value.courseTitle!=='string'||!value.courseTitle.trim())))throw new LearningApiError('invalid');
  if (!isObject(value) || !hasStrings(value, ['id', 'courseId', 'title', 'instructions', 'status']) || typeof value.policyVersion !== 'number' || !Number.isInteger(value.policyVersion) || value.policyVersion < 1 || (value.dueAt !== null && !date(value.dueAt))) throw new LearningApiError('invalid');
  const model = value.model ?? 'numeric';
  if(!['DRAFT','PUBLISHED'].includes(String(value.status))||value.status==='DRAFT'&&(value.assignmentState!=='CLOSED'||!Number.isInteger(value.preparationVersion)||Number(value.preparationVersion)<1||!['TEXT','QUIZ'].includes(String(value.intendedSubmissionKind))||!['numeric','rubric'].includes(String(value.intendedModel))))throw new LearningApiError('invalid');
  if (value.model !== undefined && ['availableFrom', 'availableUntil', 'allowLate', 'assignmentState', 'availabilityVersion', 'submissionKind'].some(key => value[key] === undefined)) throw new LearningApiError('invalid');
  if (model === 'numeric' ? typeof value.maxScore !== 'number' || !Number.isFinite(value.maxScore) || value.maxScore <= 0 || value.rubricId !== undefined && value.rubricId !== null : model !== 'rubric' || typeof value.rubricId !== 'string' || !value.rubricId || value.maxScore !== undefined) throw new LearningApiError('invalid');
  const availableFrom = value.availableFrom ?? null; const availableUntil = value.availableUntil ?? null;
  if (!(availableFrom === null || date(availableFrom)) || !(availableUntil === null || date(availableUntil)) || availableFrom && availableUntil && Date.parse(String(availableUntil)) <= Date.parse(String(availableFrom)) || value.assignmentState !== undefined && !['OPEN', 'CLOSED'].includes(String(value.assignmentState)) || value.submissionKind !== undefined && !['TEXT', 'QUIZ'].includes(String(value.submissionKind))) throw new LearningApiError('invalid');
  if (value.allowLate !== undefined && typeof value.allowLate !== 'boolean' || value.availabilityVersion !== undefined && (typeof value.availabilityVersion !== 'number' || !Number.isInteger(value.availabilityVersion) || value.availabilityVersion < 1)) throw new LearningApiError('invalid');
  if (value.currentSubmission !== undefined && value.currentSubmission !== null && parseSubmission(value.currentSubmission).assessmentId !== value.id) throw new LearningApiError('invalid');
  return { ...value, model, rubricId: model === 'numeric' ? null : value.rubricId, availableFrom, availableUntil, allowLate: value.allowLate ?? true, assignmentState: value.assignmentState ?? 'OPEN', availabilityVersion: value.availabilityVersion ?? 1, submissionKind: value.submissionKind ?? 'TEXT' } as Assessment;
}
export function parseSubmission(value: unknown): Submission {
  if (!isObject(value) || !hasStrings(value, ['id', 'assessmentId', 'learnerId', 'status', 'submittedAt', 'assessmentTitle', 'learnerName']) || typeof value.content !== 'string' || (!value.content && !(value.responseKind === 'FILE' && typeof value.artifactCount === 'number' && Number.isInteger(value.artifactCount) && value.artifactCount > 0 && value.artifactCount <= 5)) || value.responseKind !== undefined && !['TEXT', 'FILE'].includes(String(value.responseKind)) || !['SUBMITTED', 'RETURNED', 'RESUBMITTED', 'CLOSED'].includes(String(value.status)) || !date(value.submittedAt) || typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 1) throw new LearningApiError('invalid');
  const previousSubmissionId = value.previousSubmissionId ?? null; const sourceReturnId = value.sourceReturnId ?? null;
  const returnId = value.returnId ?? null; const returnFeedback = value.returnFeedback ?? null; const returnedAt = value.returnedAt ?? null;
  if ([previousSubmissionId, sourceReturnId, returnId, returnFeedback].some(field => field !== null && (typeof field !== 'string' || !field)) || !(returnedAt === null || date(returnedAt)) || value.revision > 1 && (!previousSubmissionId || !sourceReturnId) || value.status === 'RETURNED' && (!returnId || !returnFeedback || !returnedAt)) throw new LearningApiError('invalid');
  return { ...value, previousSubmissionId, sourceReturnId, returnId, returnFeedback, returnedAt } as Submission;
}
