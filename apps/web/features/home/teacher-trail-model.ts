import type { ReactNode } from 'react';
import type { CuevoIconName } from '@cuevo/ui';

/** Already authorized current source context. All callbacks retain exact source
 * and receipt identity in the owner; this view owns no queries or commands. */
export type TeacherTrailAction = { label: string; accessibleLabel?: string; onClick: () => void; disabled?: boolean; pending?: boolean };
export type TeacherTrailQueueState = 'needs-review' | 'in-progress' | 'waiting' | 'completed';
export type TeacherTrailItem = {
  key: string;
  kind: 'marking' | 'support' | 'portfolio' | 'reassessment';
  title: string;
  learnerName: string | null;
  classLabel: string | null;
  state: TeacherTrailQueueState;
  statusLabel: string;
  dateLabel?: string | null;
  nativeKind?: 'numeric' | 'rubric' | 'unknown';
  action: TeacherTrailAction;
  currentSubmission?: { text: string; dateLabel: string | null; action?: TeacherTrailAction };
  earlierFeedback?: { text: string; authorName: string | null; dateLabel: string | null; action?: TeacherTrailAction };
};
export type TeacherTrailContext = {
  availability: 'ready' | 'loading' | 'partial' | 'error' | 'denied' | 'offline';
  dateLabel: string | null;
  notice?: string;
  recovery?: TeacherTrailAction;
  attention: { status: 'ready' | 'loading' | 'partial' | 'unavailable'; items: TeacherTrailItem[]; viewAll?: TeacherTrailAction };
  workspaces: { key: string; title: string; description: string; icon: CuevoIconName; action: TeacherTrailAction; selected?: boolean }[];
  allWorkspaces?: TeacherTrailAction;
  insight: {
    mode: 'fixture' | 'live' | 'human';
    approval: 'awaiting-review' | 'approved' | 'rejected' | 'requires-review';
    sourceTitle: string | null;
    sourceContext: string | null;
    /** Owner renders the canonical academic NativeResultView if applicable. */
    nativeResultView?: ReactNode;
    sourceAction?: TeacherTrailAction;
    interpretation: string | null;
    limitation: string | null;
    reviewAction?: TeacherTrailAction;
  } | null;
  nextActions: { key: string; title: string; icon: CuevoIconName; action: TeacherTrailAction }[];
  calendar?: { status: 'ready' | 'loading' | 'partial' | 'unavailable'; items: { key: string; title: string; dateLabel: string | null; contextLabel: string | null; action?: TeacherTrailAction }[]; action?: TeacherTrailAction };
};
