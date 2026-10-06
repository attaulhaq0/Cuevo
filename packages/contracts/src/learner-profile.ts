import { z } from 'zod';
const label=z.string().trim().min(1).max(200);
export const learnerProfileSchema=z.object({
  id:z.uuid(),displayName:label,schoolName:label,
  enrollments:z.array(z.object({classId:z.uuid(),className:label,yearGroupName:label,academicYearName:label,effectiveFrom:z.iso.datetime({offset:true}),effectiveTo:z.iso.datetime({offset:true}).nullable()}).strict()).max(25),
  courses:z.array(z.object({id:z.uuid(),title:label,classId:z.uuid(),className:label,subjectName:label}).strict()).max(50),
}).strict();
