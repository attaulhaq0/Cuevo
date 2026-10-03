import{gradebookPageSchema,gradebookPreviewResponseSchema,type GradebookPage,type GradebookSelection,type GradebookPreview}from'@cuevo/contracts';
import{LearningApiError}from'../../shared/api/client';
export type{GradebookPage,GradebookSelection,GradebookPreview};
export function parseGradebook(value:unknown){const parsed=gradebookPageSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;}
export function parseGradebookPreview(value:unknown){const parsed=gradebookPreviewResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;}
export function gradebookAmbiguousNames(items:GradebookPage['items']){const counts=new Map<string,number>();for(const item of items)counts.set(item.learnerName,(counts.get(item.learnerName)??0)+1);return new Set(items.filter(item=>item.identityRequiresReview||(counts.get(item.learnerName)??0)>1).map(item=>item.id));}
