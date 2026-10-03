import{z}from'zod';
export const communityMentionIdsSchema=z.array(z.uuid()).max(5).refine(ids=>new Set(ids).size===ids.length,'Choose each current member once.');
export const communityMentionReadSchema=z.object({}).strict();
