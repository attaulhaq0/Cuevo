/** Already authorized, human-readable home context. This view owns no queries,
 * learning commands, recognition policy or progress calculations. */
export type StudentTrailAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
};

export type StudentTrailStageKey = 'lesson' | 'feedback' | 'practice' | 'reflect' | 'grow';
export type StudentTrailStage = {
  key: StudentTrailStageKey;
  title: string;
  description: string;
  state: 'complete' | 'available' | 'unknown';
  action?: StudentTrailAction;
};

export type StudentTrailAssets = {
  background: string;
  path?: string;
  foxi: string;
  lesson: string;
  work: string;
  workSubject?: string;
  pedestal?: string;
  feedback: string;
  practice: string;
  reflect: string;
  grow: string;
  milestone: string;
  owl?: string;
  goal?: string;
  community?: string;
  help?: string;
};

export type StudentTrailContext = {
  displayName: string | null;
  schoolName: string | null;
  availability: 'ready' | 'loading' | 'partial' | 'error' | 'denied' | 'offline';
  notice?: string;
  recovery?: StudentTrailAction;
  goal: { text: string; action?: StudentTrailAction } | null;
  task: {
    title: string;
    description: string;
    course: string | null;
    unit: string | null;
    stepNumber?: number;
    state: 'available' | 'revision' | 'submitted' | 'processing' | 'unknown' | 'empty';
    primaryAction: StudentTrailAction | null;
  } | null;
  stages: StudentTrailStage[];
  feedback: {
    teacherName: string | null;
    teacherContext: string | null;
    teacherImage?: string;
    dateLabel: string | null;
    text: string;
    action?: StudentTrailAction;
  } | null;
  upcoming: {
    title: string;
    description: string;
    availabilityLabel: string | null;
    action: StudentTrailAction | null;
    viewAll?: StudentTrailAction;
  } | null;
  recognition: {
    status: 'recorded' | 'processing' | 'disabled' | 'unavailable' | 'requires-review';
    totalPoints: number | null;
    periodLabel: string | null;
    entries: { label: string; points: number; kind: 'practice' | 'revision' | 'reflection' }[];
    currentMilestone: string | null;
    action?: StudentTrailAction;
  };
  classChallenge: {
    title: string;
    description: string;
    periodLabel: string | null;
    alias: string | null;
    participating: boolean | null;
    participationLabel: string;
    pending?: boolean;
    onParticipationChange?: (participating: boolean) => void;
    action?: StudentTrailAction;
  } | null;
  help: {
    title: string;
    description: string;
    mode: 'human' | 'approved-materials' | 'future';
    note: string;
    action?: StudentTrailAction;
  } | null;
  companion: {
    visible: boolean;
    name: string;
    alternative?: { name: string; description: string; action: StudentTrailAction };
    hideAction?: StudentTrailAction;
  };
};
