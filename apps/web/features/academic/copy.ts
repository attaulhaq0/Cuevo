export { academicAr, academicEn } from './messages';
import { academicAr, academicEn } from './messages';
export function academicWorkspaceBody(role:string,locale:'en'|'ar'){
 const t=locale==='ar'?academicAr:academicEn;
 return role==='student'?t.studentBody:role==='parent'?t.parentBody:role==='coordinator'?t.coordinatorBody:t.body;
}
