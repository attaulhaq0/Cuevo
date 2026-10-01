import { describe, expect, it } from 'vitest';
import { createAnalyticsEvent } from '../src/analytics';
describe('purpose limited product analytics', () => {
  const base = { eventId: '00000000-0000-4000-8000-000000000001', schoolId: '00000000-0000-4000-8000-000000000002', actorId: '00000000-0000-4000-8000-000000000003', type: 'lesson.completed', occurredAt: '2026-10-01T00:00:00Z', metadata: { durationMs: 20, email: 'child@example.test', answers: 'private', message: 'private', score: 10 } };
  it('is off unless school analytics policy explicitly permits the purpose', () => { expect(createAnalyticsEvent(base, { schoolAllowed: false, pseudonymKey: 'a'.repeat(64) })).toBeNull(); });
  it('excludes raw identity, grades, messages and content from the outgoing event', () => {
    const result = createAnalyticsEvent(base, { schoolAllowed: true, pseudonymKey: 'a'.repeat(64) });
    expect(result?.event).toBe('lesson_completed');
    expect(JSON.stringify(result)).not.toContain(base.actorId); expect(JSON.stringify(result)).not.toContain(base.schoolId);
    expect(JSON.stringify(result)).not.toMatch(/child@example|private|score|answers/);
    expect(result?.properties.$process_person_profile).toBe(false);
  });
  it('is tenant bound and rejects absent pseudonym configuration', () => {
    expect(() => createAnalyticsEvent(base, { schoolAllowed: true, pseudonymKey: '' })).toThrow();
    const other = createAnalyticsEvent({ ...base, schoolId: '00000000-0000-4000-8000-000000000099' }, { schoolAllowed: true, pseudonymKey: 'a'.repeat(64) });
    expect(other?.distinctId).not.toBe(createAnalyticsEvent(base, { schoolAllowed: true, pseudonymKey: 'a'.repeat(64) })?.distinctId);
  });
  it('does not send unapproved events or pastoral/AI prompt payloads', () => { expect(createAnalyticsEvent({ ...base, type: 'pastoral.recorded' }, { schoolAllowed: true, pseudonymKey: 'a'.repeat(64) })).toBeNull(); });
  it('does not label an arbitrary event synthetic without a verified environment flag', () => {
    const result = createAnalyticsEvent(base, { schoolAllowed: true, pseudonymKey: 'a'.repeat(64), syntheticEnvironment: false });
    expect(result?.properties.synthetic_environment).toBe(false);
  });
});
