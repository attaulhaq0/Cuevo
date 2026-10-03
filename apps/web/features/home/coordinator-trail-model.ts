import type { ReactNode } from 'react';

export type CoordinatorTrailAction = { label: string; onClick: () => void; pending?: boolean; disabled?: boolean };
/** Current staff review facts only; no grading/measurement mutation, derived
 * coverage, official-pack claims or full quality/CQI capability. */
export type CoordinatorTrailContext = {
  availability: 'ready' | 'loading' | 'partial' | 'error' | 'denied' | 'offline';
  classLabel: string | null;
  periodLabel: string | null;
  dateLabel: string | null;
  selector?: ReactNode;
  notice?: string;
  recovery?: CoordinatorTrailAction;
  primaryAction?: CoordinatorTrailAction;
  programmes: { key: string; name: string; contextLabel: string | null; status: 'reviewed-school-context' | 'requires-review' | 'unavailable'; statusLabel: string; action?: CoordinatorTrailAction }[];
  evidence: {
    status: 'ready' | 'loading' | 'partial' | 'unavailable';
    coverage: 'not-established' | 'requires-review';
    gap: { status: 'known'; count: number; basis: string } | { status: 'unknown'; count: null; basis: null };
    records: { key: string; title: string; learnerName: string | null; contextLabel: string | null; teacherName: string | null; feedback: string | null; action?: CoordinatorTrailAction }[];
    action?: CoordinatorTrailAction;
  };
  outcome: {
    title: string;
    nativeKind: 'numeric' | 'rubric' | 'unknown';
    /** Owner composes existing Academic NativeResultView/OutcomeList. */
    baselineView?: ReactNode;
    followUpView?: ReactNode;
    comparisonView?: ReactNode;
    baselineDate: string | null;
    followUpDate: string | null;
    observationLabel: string | null;
    action?: CoordinatorTrailAction;
  } | null;
  review: { title: string; description: string; ownerName: string | null; dueLabel: string | null; action?: CoordinatorTrailAction } | null;
};
