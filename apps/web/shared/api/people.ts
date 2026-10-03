import { LearningApiError } from './client.ts';
export type PersonChoice = { id: string; userId: string; displayName: string; role: string; classLabels: string[] };
export function currentLearnerChoices(people:PersonChoice[],unknown:string):{value:string;label:string;requiresReview:boolean}[]{const choices=people.filter(person=>person.role==='student').map(person=>({value:person.id,label:[person.displayName,...(person.classLabels.length?person.classLabels:[unknown])].join(' · '),hasContext:person.classLabels.length>0}));return choices.map(choice=>({value:choice.value,label:choice.label,requiresReview:!choice.hasContext||choices.filter(candidate=>candidate.label===choice.label).length>1}));}
export function parsePersonChoice(value: unknown): PersonChoice {
  if (!value || typeof value !== 'object' || !('userId' in value) || typeof value.userId !== 'string' || !('displayName' in value) || typeof value.displayName !== 'string' || !value.displayName.trim() || !('role' in value) || !['student', 'parent', 'teacher', 'coordinator', 'admin'].includes(String(value.role))) throw new LearningApiError('invalid');
  const classLabels = 'classLabels' in value ? value.classLabels : [];
  if (!Array.isArray(classLabels) || classLabels.some(label => typeof label !== 'string' || !label.trim())) throw new LearningApiError('invalid');
  return { id: value.userId, userId: value.userId, displayName: value.displayName, role: String(value.role), classLabels };
}
