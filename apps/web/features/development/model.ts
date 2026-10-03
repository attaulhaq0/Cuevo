import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { learnerGoalSchema } from '@cuevo/contracts';
export type LearnerGoal = ReturnType<typeof learnerGoalSchema.parse>;
export function parseLearnerGoal(value: unknown): LearnerGoal { const result = learnerGoalSchema.safeParse(value); if (!result.success) throw new LearningApiError('invalid'); return result.data; }
export {currentLearnerChoices as developmentLearnerChoices} from '../../shared/api/people.ts';
export type RecordedDayStreak = { status: 'PERIOD_REQUIRED' | 'DISABLED' | 'UNOBSERVED' | 'RECORDED' | 'REQUIRES_REVIEW'; basis: 'VERIFIED_RECOGNIZED_ACTION_DAYS'; timezone: 'UTC'; days: number | null; endingOn: string | null; recordedDays: number | null; sourceCount: number | null };
export type Summary = { learnerId: string; status: 'DISABLED' | 'RECORDED_ONLY'; totalPoints: number | null; periodId: string | null; leaderboardEnabled: boolean; streak: RecordedDayStreak };
export type Policy = { id: string; version: number; points: { practice: number; revision: number; reflection: number }; milestones: { key: string; title: string; minimumPoints: number }[]; approvedBy: string; approvedAt: string };
export type Period = { id: string; classId: string; policyId: string; title: string; startsAt: string; endsAt: string };
export type Ledger = { id: string; learnerId: string; periodId: string; observationId: string; kind: 'practice' | 'revision' | 'reflection'; points: number; occurredAt: string; policyId: string };
export type Achievement = { id: string; learnerId: string; periodId: string; policyId: string; key: string; title: string; minimumPoints: number; earnedAt: string };
export type Leaderboard = { periodId: string; status: 'OPT_IN_RECORDED_ACTIONS'; items: { alias: string; points: number; rank: number }[] };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).length === keys.length && Object.keys(row).every(key => keys.includes(key));
const strings = (row: Record<string, unknown>, keys: string[]) => keys.every(key => typeof row[key] === 'string' && row[key] !== '');
const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const utcDay = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && date(value) && new Date(value).toISOString().slice(0, 10) === value;
const positiveCount = (value: unknown) => count(value) && Number.isSafeInteger(value) && Number(value) > 0;

export type DevelopmentSource<T> = { scope: string; value: T };
/** useApiQuery may retain the preceding read for one frame; private facts need
 * both its captured source scope and the current domain identity. */
export function currentDevelopmentSummary(source: DevelopmentSource<Summary> | null, scope: string, learnerId: string, periodId: string | null): Summary | null {
  return source?.scope === scope && source.value.learnerId === learnerId && source.value.periodId === periodId ? source.value : null;
}
export function currentDevelopmentBoard(source: DevelopmentSource<Leaderboard> | null, scope: string, periodId: string): Leaderboard | null {
  return source?.scope === scope && source.value.periodId === periodId ? source.value : null;
}
/** The current period projection lacks a class name. Identical titles/dates
 * cannot become distinguishable through a private key or guessed class. */
export function developmentPeriodChoices(periods: readonly Period[], locale: 'en' | 'ar') {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const choices = periods.map(period => ({ value: period.id, label: `${period.title} · ${date.format(new Date(period.startsAt))} – ${date.format(new Date(period.endsAt))}`, requiresReview: false }));
  return choices.map(choice => ({ ...choice, requiresReview: choices.filter(other => other.label === choice.label).length > 1 }));
}

/** Validate against the journal's original payload, including on an uncertain
 * retry after a newer read. A malformed receipt must leave that key pending. */
export function confirmLearnerGoalReceipt(value: unknown, learnerId: string, command: Command | undefined, original?: LearnerGoal): LearnerGoal {
  try {
    const goal = parseLearnerGoal(value);
    if (!command || goal.learnerId !== learnerId) throw new LearningApiError('invalid');
    const payload = command.body;
    const textMatches = (field: 'title' | 'plannedStep' | 'review') => typeof payload[field] === 'string' && goal[field] === payload[field].trim();
    if (command.path === '/v1/development/goals') {
      if (goal.revision !== 1 || goal.status !== 'ACTIVE' || goal.review !== null || goal.reviewedAt !== null || goal.courseId !== payload.courseId || goal.referenceId !== payload.referenceId || !textMatches('title') || !textMatches('plannedStep')) throw new LearningApiError('invalid');
    } else {
      if (!original || command.path !== `/v1/development/goals/${original.id}/review` || goal.id !== original.id || goal.courseId !== original.courseId || goal.referenceId !== original.referenceId || goal.title !== original.title || goal.plannedStep !== original.plannedStep || !positiveCount(payload.expectedRevision) || goal.revision !== Number(payload.expectedRevision) + 1 || goal.status !== payload.status || payload.confirmReview !== true || !textMatches('review') || goal.reviewedAt === null) throw new LearningApiError('invalid');
      if (goal.createdAt !== original.createdAt || (original.revision === Number(payload.expectedRevision) ? goal.revisionId === original.revisionId : original.revision !== Number(payload.expectedRevision) + 1 || goal.revisionId !== original.revisionId)) throw new LearningApiError('invalid');
    }
    return goal;
  } catch { throw new LearningApiError('invalid', true); }
}

export type DevelopmentReceipt = { id: string; command: 'policy' | 'period' | 'participation' | 'backfill'; awards: number };
export function confirmDevelopmentReceipt(value: unknown, command: DevelopmentReceipt['command'], targetId?: string): DevelopmentReceipt {
  if (!object(value) || Object.keys(value).some(key => !['id', 'command', 'awards'].includes(key)) || typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) || value.command !== command || !count(value.awards) || !Number.isSafeInteger(value.awards) || command !== 'backfill' && value.awards !== 0 || targetId !== undefined && value.id !== targetId) throw new LearningApiError('invalid', true);
  return value as DevelopmentReceipt;
}
/** Pure validation uses the exact prepared command even after source refresh
 * unmounts its form. It observes no current selection or journal state. */
export function confirmDevelopmentCommandReceipt(value: unknown, originalCommand: Command): DevelopmentReceipt {
  const commands: Record<string, DevelopmentReceipt['command']> = {
    '/v1/development/policies': 'policy', '/v1/development/periods': 'period',
    '/v1/development/leaderboard/participation': 'participation', '/v1/development/periods/backfill': 'backfill',
  };
  const command = commands[originalCommand.path];
  if (!command) throw new LearningApiError('invalid', true);
  const requiresPeriod = command === 'participation' || command === 'backfill';
  if (requiresPeriod && typeof originalCommand.body.periodId !== 'string') throw new LearningApiError('invalid', true);
  return confirmDevelopmentReceipt(value, command, requiresPeriod ? originalCommand.body.periodId as string : undefined);
}
export function parseSummary(value: unknown): Summary {
  if (!object(value) || !exact(value, ['learnerId', 'status', 'totalPoints', 'periodId', 'leaderboardEnabled', 'streak']) || !strings(value, ['learnerId']) || !['DISABLED', 'RECORDED_ONLY'].includes(String(value.status)) || !(value.periodId === null || typeof value.periodId === 'string' && value.periodId !== '') || typeof value.leaderboardEnabled !== 'boolean' || (value.status === 'DISABLED' ? value.totalPoints !== null : !count(value.totalPoints))) throw new LearningApiError('invalid');
  const streak = value.streak;
  if (!object(streak) || !exact(streak, ['status', 'basis', 'timezone', 'days', 'endingOn', 'recordedDays', 'sourceCount']) || !['PERIOD_REQUIRED', 'DISABLED', 'UNOBSERVED', 'RECORDED', 'REQUIRES_REVIEW'].includes(String(streak.status)) || streak.basis !== 'VERIFIED_RECOGNIZED_ACTION_DAYS' || streak.timezone !== 'UTC') throw new LearningApiError('invalid');
  if (value.periodId === null ? streak.status !== 'PERIOD_REQUIRED' : streak.status === 'PERIOD_REQUIRED' || (value.status === 'DISABLED' ? streak.status !== 'DISABLED' : streak.status === 'DISABLED')) throw new LearningApiError('invalid');
  if (streak.status === 'RECORDED') {
    if (!positiveCount(streak.days) || !positiveCount(streak.recordedDays) || !positiveCount(streak.sourceCount) || Number(streak.days) > Number(streak.recordedDays) || Number(streak.recordedDays) > Number(streak.sourceCount) || !utcDay(streak.endingOn)) throw new LearningApiError('invalid');
  } else if (['days', 'endingOn', 'recordedDays', 'sourceCount'].some(key => streak[key] !== null)) throw new LearningApiError('invalid');
  return value as Summary;
}
export function parsePolicy(value: unknown): Policy { if (!object(value) || !exact(value, ['id', 'version', 'points', 'milestones', 'approvedBy', 'approvedAt']) || !strings(value, ['id', 'approvedBy']) || !count(value.version) || Number(value.version) < 1 || !date(value.approvedAt) || !object(value.points) || !exact(value.points, ['practice', 'revision', 'reflection']) || ['practice', 'revision', 'reflection'].some(key => !count((value.points as Record<string, unknown>)[key])) || !Array.isArray(value.milestones) || value.milestones.some(item => !object(item) || !exact(item, ['key', 'title', 'minimumPoints']) || !strings(item, ['key', 'title']) || !count(item.minimumPoints) || Number(item.minimumPoints) < 1)) throw new LearningApiError('invalid'); return value as Policy; }
export function parsePeriod(value: unknown): Period { if (!object(value) || !exact(value, ['id', 'classId', 'policyId', 'title', 'startsAt', 'endsAt']) || !strings(value, ['id', 'classId', 'policyId', 'title']) || !date(value.startsAt) || !date(value.endsAt) || Date.parse(String(value.endsAt)) <= Date.parse(String(value.startsAt))) throw new LearningApiError('invalid'); return value as Period; }
export function parseLedger(value: unknown): Ledger { if (!object(value) || !exact(value, ['id', 'learnerId', 'periodId', 'observationId', 'kind', 'points', 'occurredAt', 'policyId']) || !strings(value, ['id', 'learnerId', 'periodId', 'observationId', 'policyId']) || !['practice', 'revision', 'reflection'].includes(String(value.kind)) || !count(value.points) || !date(value.occurredAt)) throw new LearningApiError('invalid'); return value as Ledger; }
export function parseAchievement(value: unknown): Achievement { if (!object(value) || !exact(value, ['id', 'learnerId', 'periodId', 'policyId', 'key', 'title', 'minimumPoints', 'earnedAt']) || !strings(value, ['id', 'learnerId', 'periodId', 'policyId', 'key', 'title']) || !count(value.minimumPoints) || Number(value.minimumPoints) < 1 || !date(value.earnedAt)) throw new LearningApiError('invalid'); return value as Achievement; }
export function parseLeaderboard(value: unknown): Leaderboard { if (!object(value) || !exact(value, ['periodId', 'status', 'items']) || !strings(value, ['periodId']) || value.status !== 'OPT_IN_RECORDED_ACTIONS' || !Array.isArray(value.items) || value.items.some(item => !object(item) || Object.keys(item).some(key => !['alias', 'points', 'rank'].includes(key)) || !strings(item, ['alias']) || !count(item.points) || !count(item.rank) || Number(item.rank) < 1)) throw new LearningApiError('invalid'); return value as Leaderboard; }
