import { z } from 'zod';

const accountRole = z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']);
const reason = z.string().trim().min(1).max(1000);
export const schoolAccountInviteSchema = z.object({ displayName: z.string().trim().min(1).max(200), email: z.email().max(254), role: accountRole, reason, confirmInvitation: z.literal(true) }).strict();
export const schoolAccountInvitationRevokeSchema = z.object({ expectedRevision: z.number().int().positive(), reason, confirmRevocation: z.literal(true) }).strict();
export const schoolAccountClaimSchema = z.object({ id: z.uuid(), admissionSecret: z.string().regex(/^[a-f0-9]{64}$/), confirmAdmission: z.literal(true) }).strict();
export const schoolAccountInvitationQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(25).default(25), cursor: z.uuid().optional() }).strict();
export const schoolAccountInvitationStatusSchema = z.enum(['REQUESTED', 'SOURCE_ACKNOWLEDGED', 'IDENTITY_CONFIRMED', 'LINK_PENDING', 'DELIVERY_ACCEPTED', 'CLAIMED', 'REVOKED', 'REQUIRES_REVIEW', 'OUTCOME_UNKNOWN']);
const invitationFields = { id: z.uuid(), schoolId: z.uuid(), revision: z.number().int().positive(), status: schoolAccountInvitationStatusSchema, createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }) };
export const schoolAccountInvitationReceiptSchema = z.object(invitationFields).strict().refine(value => Date.parse(value.expiresAt) > Date.parse(value.createdAt), 'Invitation expiry must follow creation.');
export const schoolAccountInvitationSchema = z.object({ ...invitationFields, displayName: z.string().trim().min(1).max(200), email: z.email().max(254), role: accountRole, userId: z.uuid().nullable() }).strict().refine(value => Date.parse(value.expiresAt) > Date.parse(value.createdAt), 'Invitation expiry must follow creation.');
export const schoolAccountInvitationPageSchema = z.object({ items: z.array(schoolAccountInvitationSchema).max(25), nextCursor: z.uuid().nullable() }).strict().refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, 'Invitation identities must be unique.');
export const schoolAccountClaimReceiptSchema = z.object({ id: z.uuid(), schoolId: z.uuid(), userId: z.uuid(), role: accountRole, status: z.literal('CLAIMED'), revision: z.number().int().positive() }).strict();
export type SchoolAccountInvite = z.infer<typeof schoolAccountInviteSchema>;
export type SchoolAccountInvitation = z.infer<typeof schoolAccountInvitationSchema>;
export type SchoolAccountInvitationPage = z.infer<typeof schoolAccountInvitationPageSchema>;
export type SchoolAccountInvitationReceipt = z.infer<typeof schoolAccountInvitationReceiptSchema>;
export type SchoolAccountClaimReceipt = z.infer<typeof schoolAccountClaimReceiptSchema>;
