import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const availableName = name.nullable();
export const schoolSelectionStatusSchema = z.enum(['READY', 'REQUIRES_REVIEW']);
export const schoolClassSelectionContextSchema = z.object({ className: name, yearGroupName: name, academicYearName: name }).strict();
export const schoolPersonSelectionContextSchema = z.object({ status: schoolSelectionStatusSchema, enrollmentState: z.enum(['CURRENT', 'NONE', 'UNAVAILABLE']), classes: z.array(schoolClassSelectionContextSchema).max(25) }).strict().refine(value => value.enrollmentState === 'CURRENT' ? value.classes.length > 0 : value.classes.length === 0, 'Enrollment state must reflect current class context.').refine(value => value.status !== 'READY' || value.enrollmentState !== 'UNAVAILABLE', 'Unavailable context requires review.');
export type SchoolPersonSelectionContext = z.infer<typeof schoolPersonSelectionContextSchema>;
const windows = { effectiveFrom: z.iso.datetime({ offset: true }), effectiveTo: z.iso.datetime({ offset: true }).nullable() };
export const schoolPersonSelectionSchema = z.object({ id: z.uuid(), displayName: availableName, role: z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']), status: z.enum(['active', 'suspended', 'revoked']), ...windows, synthetic: z.boolean(), revision: z.number().int().positive(), selectionContext: schoolPersonSelectionContextSchema }).strict().refine(value=>value.selectionContext.status!=='READY'||value.displayName!==null,'Ready person needs a registered name.');
export const schoolAttendanceRosterSelectionSchema = z.object({ id: z.uuid(), displayName: availableName, classId: z.uuid(), className: availableName, yearGroupName: availableName, academicYearName: availableName, selectionContext: schoolPersonSelectionContextSchema }).strict().refine(value=>value.selectionContext.status!=='READY'||[value.displayName,value.className,value.yearGroupName,value.academicYearName].every(name=>name!==null),'Ready roster needs complete names.');
const selectionStatus = { selectionStatus: schoolSelectionStatusSchema };
const shapes = {
  people: schoolPersonSelectionSchema,
  'attendance-roster': schoolAttendanceRosterSelectionSchema,
  classes: z.object({ id: z.uuid(), name:availableName, academicYearId: z.uuid(), yearGroupId: z.uuid(), status: z.enum(['active', 'archived']), academicYearName: availableName, yearGroupName: availableName, ...selectionStatus }).strict().refine(value=>value.selectionStatus!=='READY'||[value.name,value.academicYearName,value.yearGroupName].every(name=>name!==null)),
  years: z.object({ id: z.uuid(), name:availableName, startsOn: z.iso.date(), endsOn: z.iso.date(), ...selectionStatus }).strict().refine(value=>value.selectionStatus!=='READY'||value.name!==null),
  'year-groups': z.object({ id: z.uuid(), name:availableName, ordinal: z.number().int().nonnegative(), ...selectionStatus }).strict().refine(value=>value.selectionStatus!=='READY'||value.name!==null),
  terms: z.object({ id: z.uuid(), academicYearId: z.uuid(), name:availableName, startsOn: z.iso.date(), endsOn: z.iso.date(), academicYearName: availableName, ...selectionStatus }).strict().refine(value=>value.selectionStatus!=='READY'||value.name!==null&&value.academicYearName!==null),
  subjects: z.object({ id: z.uuid(), name:availableName, ...selectionStatus }).strict().refine(value=>value.selectionStatus!=='READY'||value.name!==null),
};
export type SchoolSelectionResource = keyof typeof shapes;
export function schoolSelectionPageSchema(resource: SchoolSelectionResource) {
  return z.object({ items: z.array(shapes[resource]).max(100), nextCursor: z.uuid().nullable() }).strict().refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, 'Selection page identities must be distinct.');
}
