import type { MarkingItem } from '../academic/model.ts';
import type { Intervention } from '../improvement/model.ts';
import type { PortfolioItem } from '../portfolio/model.ts';
import type { NavigationIntent } from '../../shared/session/navigation-intent.ts';
import type { TeacherTrailQueueState } from './teacher-trail-model.ts';

export type TeacherHomeWork = {
  key: string; kind: 'marking' | 'reassessment' | 'portfolio'; title: string;
  learnerName: string | null; classLabel: string | null; state: TeacherTrailQueueState;
  nativeKind?: 'numeric' | 'rubric'; destination: NavigationIntent | 'portfolio';
  currentText?: string; date?: string | null;
};
export type TeacherHomeRead<T> = T & { sourceScope: string };
export function currentTeacherHomeRows<T>(rows: TeacherHomeRead<T>[], scope: string): T[] {
  return rows.filter(row => row.sourceScope === scope);
}

/** Current authorized pages only. No visible subset implies a complete queue,
 * and earlier academic result state never completes a new submitted attempt. */
export function teacherHomeWork(marking: MarkingItem[], tasks: Intervention[], portfolio: PortfolioItem[]): TeacherHomeWork[] {
  return [
    ...marking.filter(row => ['SUBMITTED', 'RESUBMITTED'].includes(row.submissionStatus) && row.currentResult?.status !== 'RELEASED').map((row): TeacherHomeWork => ({
      key: `marking:${row.id}:${row.submissionRevision}`, kind: 'marking', title: row.assessmentTitle,
      learnerName: row.learnerName, classLabel: null,
      state: row.currentResult?.status === 'REVIEW' ? 'in-progress' : 'needs-review',
      nativeKind: row.model, destination: { view: 'academic', source: 'marking', id: row.id },
      ...(row.responseKind !== 'FILE' ? { currentText: row.content } : {}),
    })),
    ...tasks.filter(row => row.status === 'COMPLETED' && !row.requiresReview).map((row): TeacherHomeWork => ({
      key: `practice:${row.id}`, kind: 'reassessment', title: row.title,
      learnerName: null, classLabel: null, state: 'needs-review', date: row.completedAt,
      destination: { view: 'improvement', source: 'intervention', id: row.id },
    })),
    ...portfolio.filter(row => row.approvalState === 'AWAITING_REVIEW').map((row): TeacherHomeWork => ({
      key: `portfolio:${row.id}:${row.revisionId}`, kind: 'portfolio', title: row.title,
      learnerName: row.identity.learnerName,
      classLabel: [row.identity.className, row.identity.yearGroupName, row.identity.academicYearName].filter(Boolean).join(' · ') || null,
      state: 'needs-review', date: row.createdAt, destination: 'portfolio',
    })),
  ];
}
