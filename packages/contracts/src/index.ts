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
