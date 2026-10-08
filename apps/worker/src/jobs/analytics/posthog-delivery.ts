import type { WorkerQueryPort } from '../../platform/query-port';
import { createPosthogEvent, type WorkerAnalyticsConfig, type LiveAnalyticsConfig, type PosthogEvent } from '../../platform/posthog';
import { capturePosthogEvent, type CaptureOutcome } from '../../platform/posthog-http';
export type AnalyticsSummary = { accepted: number; attempted: number; reviewRequired: boolean; deadlineReached: boolean };
export class PosthogDelivery {
  private running = false;
  constructor(private readonly db: WorkerQueryPort, private readonly config: WorkerAnalyticsConfig, private readonly capture: (config: LiveAnalyticsConfig, event: PosthogEvent) => Promise<CaptureOutcome> = capturePosthogEvent,private readonly generation:string|null=null) {}
  async process({ deadline, maxEvents, now = Date.now }: { deadline: number; maxEvents: number; now?: () => number }): Promise<AnalyticsSummary> {
    const summary: AnalyticsSummary = { accepted: 0, attempted: 0, reviewRequired: false, deadlineReached: false };
    if (this.config.mode === 'DISABLED') return summary;
    if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 10 || !Number.isFinite(deadline)) throw new Error('Bounded analytics limits required.');
    if (this.running) return { ...summary, reviewRequired: true };
    this.running = true;
    try {
      while (summary.attempted < maxEvents) {
        // Claim/revalidate/receipt retain five-second SQL budgets plus three-second POST.
        if (deadline - now() < 23000) { summary.deadlineReached = true; break; }
        const rows = (await this.db.query(this.generation===null?'select *from internal.claim_posthog_delivery($1,$2,$3,$4)':'select *from internal.claim_posthog_delivery($1,$2,$3,$4,$5)', this.generation===null?[1,30,this.config.keyVersion,this.config.environment]:[1,30,this.config.keyVersion,this.config.environment,this.generation])).rows;
        if (!rows.length) break;
        if (rows.length !== 1 || typeof rows[0].id !== 'string' || typeof rows[0].lease_token !== 'string') { summary.reviewRequired = true; break; }
        const row = rows[0]; summary.attempted++;
        const event = await createPosthogEvent(row, this.config);
        if (!event) { await this.retry(row.id, row.lease_token, 'CAPTURE_SCHEMA_REQUIRES_REVIEW'); summary.reviewRequired = true; break; }
        const allowed = (await this.db.query('select internal.posthog_delivery_allowed($1,$2,$3,$4)as allowed', [row.id, row.lease_token, this.config.keyVersion, this.config.environment])).rows[0]?.allowed;
        if (allowed !== true) { await this.retry(row.id, row.lease_token, 'CAPTURE_POLICY_UNAVAILABLE'); break; }
        const outcome = await this.capture(this.config, event);
        if (outcome !== 'ACCEPTED') { await this.retry(row.id, row.lease_token, outcome === 'OUTCOME_UNKNOWN' ? 'CAPTURE_OUTCOME_UNKNOWN' : 'CAPTURE_RETRY_REQUIRED'); summary.reviewRequired = true; break; }
        const receipt = (await this.db.query('select internal.accept_posthog_delivery($1,$2,$3)as acknowledged', [row.id, row.lease_token, event.properties.$insert_id])).rows[0]?.acknowledged;
        if (receipt !== true) { summary.reviewRequired = true; break; }
        summary.accepted++;
      }
    } catch { summary.reviewRequired = true; }
    finally { this.running = false; }
    return summary;
  }
  private async retry(id: unknown, lease: unknown, code: string) {
    const receipt = await this.db.query('select internal.fail_posthog_delivery($1,$2,$3)as acknowledged', [id, lease, code]);
    if (receipt.rows[0]?.acknowledged !== true) throw new Error('Analytics retry receipt unknown.');
  }
}
