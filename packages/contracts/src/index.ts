import { z } from 'zod';
export const roleSchema = z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']);
export const membershipSchema = z.object({
  userId: z.uuid(), schoolId: z.uuid(), membershipId: z.uuid(), role: roleSchema,
  entitlements: z.array(z.string()), displayName: z.string(), school: z.object({ id: z.uuid(), name: z.string() }),
});
export type MembershipResponse = z.infer<typeof membershipSchema>;
export const apiErrorSchema = z.object({ code: z.string(), message: z.string(), requestId: z.string() });
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
export * from './school-learning';
export * from './academic';
export * from './learner-state';
export * from './improvement';
export * from './outcome-display';
export * from './school';
export * from './school-accounts';
export * from './school-support';
export * from './school-maintenance';
export * from './curriculum';
export * from './community';
export * from './assets';
export * from './resource';
export * from './submission-artifact';
export * from './portfolio';
export * from './development';
export * from './attention';
export * from './insight';
export * from './conversation';
export * from './learning-content';
export * from './community-maintenance';
export * from './community-mentions';
export * from './learner-goals';
export * from './learner-profile';
export * from './restricted-records';
export * from './automation-review';
export * from './diagnostics-contract';
