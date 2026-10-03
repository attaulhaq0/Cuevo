import { learningResourceSchema, type LearningResource } from '@cuevo/contracts';
import { LearningApiError } from '../../shared/api/client.ts';
export type { LearningResource, ResourceTargetKind } from '@cuevo/contracts';
export function parseLearningResource(value: unknown): LearningResource { const parsed = learningResourceSchema.safeParse(value); if (!parsed.success) throw new LearningApiError('invalid'); return parsed.data; }
