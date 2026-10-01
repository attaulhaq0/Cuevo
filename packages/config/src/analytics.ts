import { createHmac } from 'node:crypto';
import { z } from 'zod';
const eventSchema = z.object({ eventId: z.uuid(), schoolId: z.uuid(), actorId: z.uuid(), type: z.string(), occurredAt: z.iso.datetime(), metadata: z.record(z.string(), z.unknown()) });
const approvedNames: Record<string, string> = {
  'lesson.completed': 'lesson_completed', 'assignment.submitted': 'assessment_submitted',
  'result.released': 'assessment_marked', 'signal.created': 'signal_created',
  'recommendation.approved': 'recommendation_reviewed', 'recommendation.rejected': 'recommendation_reviewed',
  'intervention.created': 'intervention_created', 'intervention.completed': 'intervention_completed',
  'reassessment.completed': 'reassessment_completed', 'outcome.measured': 'outcome_measured',
  'community.post_created': 'community_post_created',
};
export function createAnalyticsEvent(input: unknown, policy: { schoolAllowed: boolean; pseudonymKey: string; syntheticEnvironment?: boolean }) {
  if (!policy.schoolAllowed) return null;
  const event = eventSchema.parse(input);
  const name = approvedNames[event.type]; if (!name) return null;
  if (policy.pseudonymKey.length < 32) throw new Error('Analytics pseudonym configuration is required.');
  const hash = (value: string) => createHmac('sha256', policy.pseudonymKey).update(value).digest('hex');
  // Metadata is intentionally not copied. Only explicit operation counts/timing can be added later.
  return { distinctId: hash(`${event.schoolId}:${event.actorId}`), event: name, timestamp: event.occurredAt,
    properties: { $process_person_profile: false, $ip: null, $insert_id: hash(event.eventId), school: hash(event.schoolId), schema_version: 1, synthetic_environment: policy.syntheticEnvironment === true } };
}
