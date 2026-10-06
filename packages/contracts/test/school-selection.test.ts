import { describe, expect, it } from 'vitest';
import { schoolPersonSelectionContextSchema, schoolSelectionPageSchema } from '../src/index';

const id = '00000000-0000-4000-8000-000000000001';
describe('School selection context', () => {
  it('keeps confirmed absent enrollment distinct from unavailable and overflow', () => {
    expect(schoolPersonSelectionContextSchema.parse({ status: 'READY', enrollmentState: 'NONE', classes: [] }).enrollmentState).toBe('NONE');
    for (const value of [{ status: 'READY', enrollmentState: 'UNAVAILABLE', classes: [] }, { status: 'READY', enrollmentState: 'NONE', classes: [{ className: 'Cedar', yearGroupName: 'Year 8', academicYearName: '2026–2027' }] }, { status: 'READY', enrollmentState: 'CURRENT', classes: [] }]) expect(schoolPersonSelectionContextSchema.safeParse(value).success).toBe(false);
  });
  it('rejects secret or private fields and duplicated page identities', () => {
    expect(schoolPersonSelectionContextSchema.safeParse({ status: 'READY', enrollmentState: 'NONE', classes: [], email: 'private@example.test' }).success).toBe(false);
    const row = { id, displayName: 'Lina Hassan', role: 'student', status: 'active', effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: null, synthetic: true, revision: 1, selectionContext: { status: 'READY', enrollmentState: 'NONE', classes: [] } };
    expect(schoolSelectionPageSchema('people').safeParse({ items: [row, row], nextCursor: null }).success).toBe(false);
    expect(schoolSelectionPageSchema('people').safeParse({ items: [{ ...row, privateNote: 'hidden' }], nextCursor: null }).success).toBe(false);
  });
  it('keeps unknown roster names review-required instead of rejecting the entire page',()=>{
    const row={id,displayName:'Learner',classId:id,className:null,yearGroupName:null,academicYearName:null,selectionContext:{status:'REQUIRES_REVIEW',enrollmentState:'UNAVAILABLE',classes:[]}};
    expect(schoolSelectionPageSchema('attendance-roster').safeParse({items:[row],nextCursor:null}).success).toBe(true);
    expect(schoolSelectionPageSchema('attendance-roster').safeParse({items:[{...row,selectionContext:{...row.selectionContext,status:'READY'}}],nextCursor:null}).success).toBe(false);
  });
  it('unknown class axes cannot claim READY but remain visible for review',()=>{
    const row={id,name:'Cedar',academicYearId:id,yearGroupId:id,status:'active',academicYearName:null,yearGroupName:'Year 8',selectionStatus:'REQUIRES_REVIEW'};
    expect(schoolSelectionPageSchema('classes').safeParse({items:[row],nextCursor:null}).success).toBe(true);
    expect(schoolSelectionPageSchema('classes').safeParse({items:[{...row,selectionStatus:'READY'}],nextCursor:null}).success).toBe(false);
  });
});
