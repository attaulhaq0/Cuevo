import type { CuevoIconName } from '@cuevo/ui';

export type AdminTrailAction = { label: string; onClick: () => void; disabled?: boolean; pending?: boolean };
export type AdminTrailState = 'reviewed' | 'disabled' | 'requires-review' | 'unknown';
/** Current institution read context. Existing owner callbacks lead to guarded
 * forms/reviews; this view grants nothing and creates no runtime commands. */
export type AdminTrailContext = {
  availability: 'ready' | 'loading' | 'partial' | 'error' | 'denied' | 'offline';
  schoolName: string | null;
  environmentLabel: string | null;
  dateLabel: string | null;
  notice?: string;
  recovery?: AdminTrailAction;
  primaryAction?: AdminTrailAction;
  facts: { key: string; label: string; value: string | null; icon: CuevoIconName }[];
  areas: { key: string; title: string; description: string; icon: CuevoIconName; action: AdminTrailAction; selected?: boolean }[];
  people: { status: 'ready' | 'partial' | 'unavailable'; records: { key: string; name: string | null; context: string | null; action?: AdminTrailAction }[]; action?: AdminTrailAction };
  policies: { key: string; title: string; description: string; state: AdminTrailState; action?: AdminTrailAction }[];
  policyAction?: AdminTrailAction;
  governance: { mode: 'fixture-only' | 'live-review-required' | 'reviewed-current-context' | 'unavailable'; title: string; description: string; action?: AdminTrailAction } | null;
  execution: { state: 'processing' | 'reviewed' | 'requires-review' | 'unavailable'; title: string; description: string; receiptLabel: string | null; action?: AdminTrailAction } | null;
  audit: { status: 'ready' | 'partial' | 'unavailable'; records: { key: string; actorName: string | null; targetName: string | null; description: string; dateLabel: string | null; outcome: 'succeeded' | 'denied' | 'failed' }[]; action?: AdminTrailAction };
};
