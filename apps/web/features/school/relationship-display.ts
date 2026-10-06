import type { SchoolPerson, SchoolRow } from './model.ts';
import { schoolPersonChoices, schoolRecordChoices } from './selection.ts';

export type SchoolRelationshipKind = 'enrollment' | 'assignment' | 'guardian';
export type SchoolRelationshipDisplay = { title: string; className: string | null; yearGroupName: string | null; academicYearName: string | null; subjectName: string | null; relationshipType: string | null; status: string; effectiveFrom: string | null; effectiveTo: string | null; revision: number | null; requiresReview: boolean };
function savedWindow(value: unknown, locale: 'en' | 'ar'): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : null;
}

/** A relationship identifies its own target; a person's other enrollments are separate context. */
export function schoolRelationshipDisplay(kind: SchoolRelationshipKind, row: SchoolRow, people: SchoolPerson[], classes: SchoolRow[], subjects: SchoolRow[], locale: 'en' | 'ar'): SchoolRelationshipDisplay {
  const personChoices = schoolPersonChoices(people, locale);
  const classChoices = schoolRecordChoices(classes, 'classes', locale);
  const subjectChoices = schoolRecordChoices(subjects, 'subjects', locale);
  const roles = locale === 'ar' ? { student: 'طالب', teacher: 'معلم', parent: 'ولي أمر', admin: 'مسؤول المدرسة', coordinator: 'منسق' } : { student: 'Student', teacher: 'Teacher', parent: 'Parent or guardian', admin: 'Administrator', coordinator: 'Coordinator' };
  const status = typeof row.status === 'string' ? row.status : '';
  const validStates=kind==='enrollment'?['active','revoked','completed']:kind==='guardian'?['active','revoked','pending']:['active','revoked'];
  const effectiveFrom=savedWindow(row.effectiveFrom,locale);
  const effectiveTo=row.effectiveTo===null?null:savedWindow(row.effectiveTo,locale);
  const revision=Number.isInteger(row.revision)&&Number(row.revision)>0?Number(row.revision):null;
  let requiresReview = !validStates.includes(status)||!effectiveFrom||row.effectiveTo!==null&&(!effectiveTo||Date.parse(String(row.effectiveTo))<=Date.parse(String(row.effectiveFrom)))||revision===null;
  const personLabel = (id: unknown, role: SchoolPerson['role']) => {
    const person = people.find(value => value.id === id && value.role === role);
    if (!person || !person.displayName.trim() || personChoices.find(choice => choice.value === person.id)?.requiresReview !== false) requiresReview = true;
    return `${person?.displayName.trim() || (locale === 'ar' ? 'اسم العضو غير متاح' : 'Member name unavailable')} · ${roles[role]}`;
  };
  const title = kind === 'guardian' ? `${personLabel(row.parentId, 'parent')} · ${personLabel(row.studentId, 'student')}` : personLabel(kind === 'assignment' ? row.teacherId : row.studentId, kind === 'assignment' ? 'teacher' : 'student');
  const classroom = kind === 'guardian' ? undefined : classes.find(value => value.id === row.classId);
  const name = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
  const className = classroom ? name(classroom.name) : null;
  const yearGroupName = classroom ? name(classroom.yearGroupName) : null;
  const academicYearName = classroom ? name(classroom.academicYearName) : null;
  if (kind !== 'guardian' && (!classroom || !className || !yearGroupName || !academicYearName || classChoices.find(choice => choice.value === classroom.id)?.requiresReview !== false)) requiresReview = true;
  const subject = kind === 'assignment' ? subjects.find(value => value.id === row.subjectId) : undefined;
  const subjectName = subject ? name(subject.name) : null;
  if (kind === 'assignment' && (!subject || !subjectName || subjectChoices.find(choice => choice.value === subject.id)?.requiresReview !== false)) requiresReview = true;
  const relationshipType = kind === 'guardian' ? row.relationshipType === 'parent' ? (locale === 'ar' ? 'والد أو والدة' : 'Parent') : row.relationshipType === 'guardian' ? (locale === 'ar' ? 'وصي' : 'Guardian') : null : null;
  if (kind === 'guardian' && !relationshipType) requiresReview = true;
  return { title, className, yearGroupName, academicYearName, subjectName, relationshipType, status, effectiveFrom, effectiveTo, revision, requiresReview };
}

/** Caller supplies the complete authorized relationship set before enabling a change. */
export function schoolRelationshipDisplays(kind: SchoolRelationshipKind, rows: SchoolRow[], people: SchoolPerson[], classes: SchoolRow[], subjects: SchoolRow[], locale: 'en' | 'ar'): SchoolRelationshipDisplay[] {
  const displays=rows.map(row=>schoolRelationshipDisplay(kind,row,people,classes,subjects,locale));
  const identity=(display:SchoolRelationshipDisplay)=>JSON.stringify([display.title,display.className,display.yearGroupName,display.academicYearName,display.subjectName,display.relationshipType,display.status,display.effectiveFrom,display.effectiveTo].map(value=>typeof value==='string'?value.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase():value));
  const counts=new Map<string,number>();for(const display of displays){const key=identity(display);counts.set(key,(counts.get(key)??0)+1);}
  return displays.map(display=>({...display,requiresReview:display.requiresReview||(counts.get(identity(display))??0)>1}));
}

/** Recheck the selected existing source against current complete rows, not its captured card. */
export function schoolRelationshipSelectionSafe(kind:SchoolRelationshipKind,selectedId:string|undefined,rows:SchoolRow[],people:SchoolPerson[],classes:SchoolRow[],subjects:SchoolRow[],locale:'en'|'ar',complete:boolean):boolean{
  if(!complete||!selectedId)return false;
  const index=rows.findIndex(row=>row.id===selectedId);
  return index>=0&&schoolRelationshipDisplays(kind,rows,people,classes,subjects,locale)[index]?.requiresReview===false;
}
