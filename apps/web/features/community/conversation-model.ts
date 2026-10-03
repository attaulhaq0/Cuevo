import { LearningApiError } from '../../shared/api/client.ts';
import { conversationPolicySchema, conversationChoiceSchema, conversationResponseSchema, conversationMessageResponseSchema, conversationReportResponseSchema } from '@cuevo/contracts';
export type { ConversationChoice, ParentConversation, ConversationMessage } from '@cuevo/contracts';
export const parseConversationPolicy=(value:unknown)=>{const parsed=conversationPolicySchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseConversationChoice=(value:unknown)=>{const parsed=conversationChoiceSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseParentConversation=(value:unknown)=>{const parsed=conversationResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseConversationMessage=(value:unknown)=>{const parsed=conversationMessageResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export const parseConversationReport=(value:unknown)=>{const parsed=conversationReportResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
