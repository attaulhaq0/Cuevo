import type { ReactNode } from 'react';

export type ParentTrailAction = { label: string; onClick: () => void; pending?: boolean; disabled?: boolean };
export type ParentTrailChild = { status: 'ready'; key: string; name: string | null; classLabel: string | null; schoolName: string | null } | { status: 'resolving' | 'selection-required' | 'requires-review' | 'unavailable' };
/** Exact approved current-child projection only. Private learner development,
 * AI proposals, grading commands and broad relationship records have no field. */
export type ParentTrailSnapshot = {
  childKey: string;
  status: 'ready' | 'loading' | 'partial' | 'unavailable';
  feedback: { publication: 'approved' | 'withdrawn' | 'requires-review'; title: string; text: string; teacherName: string | null; dateLabel: string | null; description: string; nativeResultView?: ReactNode; action?: ParentTrailAction } | null;
  portfolio: { publication: 'approved' | 'withdrawn' | 'requires-review'; title: string; description: string; action?: ParentTrailAction } | null;
  upcoming: { key: string; title: string; description: string; dateLabel: string | null; action?: ParentTrailAction }[];
  upcomingAction?: ParentTrailAction;
  communication: { status: 'available' | 'unavailable'; title: string; teacherName: string | null; description: string; action?: ParentTrailAction } | null;
  support: { title: string; description: string; action?: ParentTrailAction } | null;
};
export type ParentTrailContext = {
  availability: 'ready' | 'loading' | 'partial' | 'error' | 'denied' | 'offline';
  child: ParentTrailChild;
  snapshot: ParentTrailSnapshot | null;
  /** Existing authorized ChildSelector supplied by the current owner. */
  selector?: ReactNode;
  notice?: string;
  recovery?: ParentTrailAction;
};
