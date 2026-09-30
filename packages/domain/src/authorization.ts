import { z } from 'zod';
import { DomainError } from './errors';

export const roleSchema = z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']);
export type Role = z.infer<typeof roleSchema>;

const identifierSchema = z.string().min(1).refine((value) => value.trim() === value);
const actorSchema = z.object({
  userId: identifierSchema,
  schoolId: identifierSchema,
  role: roleSchema,
  membershipId: identifierSchema,
  entitlements: z.array(identifierSchema),
});

export type ActorContext = z.infer<typeof actorSchema>;

const learnerScopeSchema = z.object({
  schoolId: identifierSchema,
  learnerId: identifierSchema,
  teacherAssigned: z.boolean(),
  parentApproved: z.boolean(),
  relationshipActive: z.boolean(),
});
export type LearnerScope = z.infer<typeof learnerScopeSchema>;

/**
 * Validate a context already resolved from verified identity and current server-side membership.
 * Shape validation does not establish identity or make a client-provided role trustworthy.
 * Zod detaches the returned object and entitlement array from mutable query results.
 */
export function validateActorContext(trustedInput: unknown): ActorContext {
  const result = actorSchema.safeParse(trustedInput);
  if (!result.success) {
    throw new DomainError('INVALID_ACTOR_CONTEXT', 401, 'A current authenticated school membership is required.');
  }
  return result.data;
}

function deny(): never {
  throw new DomainError('FORBIDDEN', 403, 'Access to this operation is denied.');
}

export function requireCapability(
  actor: ActorContext,
  schoolId: string,
  capability: string,
  allowedRoles: readonly Role[],
): void {
  const current = validateActorContext(actor);
  const policy = z.object({
    schoolId: identifierSchema,
    capability: identifierSchema,
    allowedRoles: z.array(roleSchema).min(1),
  }).safeParse({ schoolId, capability, allowedRoles });
  if (!policy.success) {
    throw new DomainError('INVALID_AUTHORIZATION_POLICY', 500, 'The operation authorization policy is unavailable.');
  }
  if (current.schoolId !== schoolId
    || !current.entitlements.includes(capability)
    || !allowedRoles.includes(current.role)) {
    deny();
  }
}

/**
 * The scope must come from current, tenant-scoped server queries. learnerId is the learner's
 * authentication subject ID at this boundary. This object authorization is additional to
 * requireCapability, not a replacement for operation-specific entitlement/role policy.
 */
export function requireLearnerScope(actor: ActorContext, learnerId: string, scope: LearnerScope): void {
  const current = validateActorContext(actor);
  const result = learnerScopeSchema.safeParse(scope);
  if (!identifierSchema.safeParse(learnerId).success || !result.success) deny();
  const resolved = result.data;
  if (current.schoolId !== resolved.schoolId || learnerId !== resolved.learnerId) deny();

  switch (current.role) {
    case 'admin':
    case 'coordinator':
      return;
    case 'teacher':
      if (resolved.teacherAssigned && resolved.relationshipActive) return;
      break;
    case 'parent':
      if (resolved.parentApproved && resolved.relationshipActive) return;
      break;
    case 'student':
      if (current.userId === learnerId && resolved.relationshipActive) return;
      break;
  }
  deny();
}

const activeWindowSchema = z.object({
  status: z.literal('active'),
  validFrom: z.iso.datetime({ offset: true }).nullable(),
  validUntil: z.iso.datetime({ offset: true }).nullable(),
});
export type ActiveWindow = z.infer<typeof activeWindowSchema>;

/** Explicit null is unbounded; missing/invalid fields are unknown and denied. End is exclusive. */
function isActiveWindow(window: unknown, now: Date): boolean {
  const parsed = activeWindowSchema.safeParse(window);
  if (!parsed.success || !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const start = parsed.data.validFrom === null ? null : Date.parse(parsed.data.validFrom);
  const end = parsed.data.validUntil === null ? null : Date.parse(parsed.data.validUntil);
  if (start !== null && end !== null && start >= end) return false;
  return (start === null || start <= now.getTime()) && (end === null || now.getTime() < end);
}

export function isActiveMembership(window: unknown, now: Date): boolean {
  return isActiveWindow(window, now);
}

export function isActiveRelationship(window: unknown, now: Date): boolean {
  return isActiveWindow(window, now);
}
