import type { Assessment, Submission } from '../learning/model.ts';
import type { ReleasedResult } from '../academic/model.ts';
import type { Intervention } from '../improvement/model.ts';
import type { Achievement, Ledger, LearnerGoal, Period, Summary } from '../development/model.ts';
import type { LearningApiError } from '../../shared/api/client.ts';
import { pendingWork } from './model.ts';
import type { NavigationIntent } from '../../shared/session/navigation-intent.ts';
import type { StudentTrailContext } from './trail-model.ts';

export type HomeSourcePage<T> = { data: T[]; loaded: boolean; loading: boolean; nextCursor: string | null; error: LearningApiError | null; moreError: LearningApiError | null };
export type StudentHomeItem = { title: string; description: string; course: string | null; dueAt: string | null; kind: 'practice' | 'revision' | 'assessment' | 'submitted' | 'submitted-unresolved'; destination: NavigationIntent };
const current = <T,>(page: HomeSourcePage<T>) => page.loaded && !page.loading && !page.error && !page.moreError;
const complete = <T,>(page: HomeSourcePage<T>) => current(page) && !page.nextCursor;

/** Same identity alone cannot validate an earlier access/refresh read. */
export function currentStudentHomeSummary(snapshot: { scope: string; summary: Summary } | null, scope: string): Summary | null {
  return snapshot?.scope === scope ? snapshot.summary : null;
}

export type NativeFeedbackDisclosure = { resultId: string; open: boolean };
/** Disclosure intent survives a read gap; it never carries protected result facts. */
export function currentNativeFeedbackDisclosure(snapshot: NativeFeedbackDisclosure | null, resultId: string | null): boolean {
  return resultId !== null && snapshot?.resultId === resultId && snapshot.open;
}

/** Source presence is explicit: a bounded independent queue cannot prove absence. */
export function selectStudentHomeSources(input: {
  learnerId: string; now: number; assessments: HomeSourcePage<Assessment>; submissions: HomeSourcePage<Submission>;
  interventions: HomeSourcePage<Intervention>; results: HomeSourcePage<ReleasedResult>; goals: HomeSourcePage<LearnerGoal>;
}) {
  const assessments = current(input.assessments) ? input.assessments.data : [];
  const submissions = complete(input.submissions) ? input.submissions.data : [];
  const knownAssessments = assessments.filter(item => item.currentSubmission !== undefined || complete(input.submissions));
  const actions = pendingWork(knownAssessments, submissions, input.learnerId, input.now);
  const practices = current(input.interventions) ? input.interventions.data.filter(item => item.learnerId === input.learnerId && item.status === 'ASSIGNED' && !item.requiresReview) : [];
  const queue: StudentHomeItem[] = [
    ...practices.map(item => ({ title: item.title, description: item.instructions, course: null, dueAt: null, kind: 'practice' as const, destination: { view: 'improvement', source: 'intervention', id: item.id } as const })),
    ...actions.map(item => {
      const source = assessments.find(source => source.id === item.assessmentId)!;
      return { title: item.title, description: source.instructions, course: source.courseTitle || null, dueAt: item.dueAt, kind: item.needsRevision ? 'revision' as const : 'assessment' as const, destination: { view: 'learning', source: 'assessment', id: item.assessmentId } as const };
    }),
  ];
  const results = current(input.results) ? input.results.data.filter(item => item.learnerId === input.learnerId && item.status === 'RELEASED').toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  const goals = complete(input.goals) ? input.goals.data.filter(item => item.learnerId === input.learnerId && item.status === 'ACTIVE') : [];
  const workKnown = complete(input.assessments) && knownAssessments.length === assessments.length;
  const submitted = workKnown ? assessments.flatMap(assessment => {
    const source = assessment.currentSubmission !== undefined ? assessment.currentSubmission : submissions.find(item => item.assessmentId === assessment.id && item.learnerId === input.learnerId);
    return assessment.status === 'PUBLISHED' && source?.learnerId === input.learnerId && ['SUBMITTED', 'RESUBMITTED'].includes(source.status) && !results.some(result => result.submissionId === source.id) ? [{ assessment, source }] : [];
  }).toSorted((a, b) => Date.parse(b.source.submittedAt) - Date.parse(a.source.submittedAt))[0] : null;
  const submittedTask: StudentHomeItem | null = !queue.length && submitted ? { title: submitted.assessment.title, description: submitted.assessment.instructions, course: submitted.assessment.courseTitle || null, dueAt: submitted.assessment.dueAt, kind: complete(input.results) ? 'submitted' : 'submitted-unresolved', destination: { view: 'learning', source: 'assessment', id: submitted.assessment.id } } : null;
  return { queue, results, goal: goals.length === 1 ? goals[0] : null, workKnown, submittedTask, unresolvedWork: !workKnown || !complete(input.interventions) };
}

/** Totals are current server facts, never sums or client-awarded thresholds. */
export function studentRecognition(input: { learnerId: string; period: Period | null; summary: { data: Summary | null; loading: boolean; error: LearningApiError | null }; ledger: HomeSourcePage<Ledger>; achievements: HomeSourcePage<Achievement> }): StudentTrailContext['recognition'] & { earnedMilestones: Achievement[] } {
  const unavailable: StudentTrailContext['recognition'] & { earnedMilestones: Achievement[] } = { status: 'unavailable', totalPoints: null, periodLabel: input.period?.title ?? null, entries: [], currentMilestone: null, earnedMilestones: [] };
  const summary = input.summary.data;
  if (!input.period || input.summary.loading || input.summary.error || !summary || summary.learnerId !== input.learnerId || summary.periodId !== input.period.id) return unavailable;
  if (summary.status === 'DISABLED') return { ...unavailable, status: 'disabled' };
  const inScope = (item: Ledger | Achievement) => item.learnerId === input.learnerId && item.periodId === input.period!.id && item.policyId === input.period!.policyId;
  const achievements = current(input.achievements) ? input.achievements.data.filter(inScope).toSorted((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt)) : [];
  return { ...unavailable, status: 'recorded', totalPoints: summary.totalPoints, currentMilestone: achievements[0]?.title ?? null, earnedMilestones: achievements,
    entries: current(input.ledger) ? input.ledger.data.filter(inScope).map(item => ({ label: item.occurredAt, kind: item.kind, points: item.points })) : [] };
}
