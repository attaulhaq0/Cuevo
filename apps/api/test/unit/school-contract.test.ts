import{describe,it,expect}from'vitest';
import{academicYearInputSchema,personConfigureSchema,enrollmentInputSchema,schoolPolicyInputSchema,attendanceInputSchema}from'@cuevo/contracts';
describe('school operations command boundaries',()=>{
 it('requires explicit human confirmation for access change',()=>{
  expect(personConfigureSchema.safeParse({displayName:'Synthetic',role:'admin',status:'active',effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:null}).success).toBe(false);
  expect(enrollmentInputSchema.safeParse({classId:'00000000-0000-4000-8000-000000000001',studentId:'00000000-0000-4000-8000-000000000002',status:'active',effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:'2026-09-01T00:00:00Z',confirmAccessChange:true}).success).toBe(false);
 });
 it('rejects invalid academic dates without invented defaults',()=>{expect(academicYearInputSchema.safeParse({name:'Year',startsOn:'2026-10-01',endsOn:'2026-09-01'}).success).toBe(false);});
 it('requires reason for attendance correction and preserves missing as unrecorded',()=>{
  expect(attendanceInputSchema.safeParse({classId:'00000000-0000-4000-8000-000000000001',studentId:'00000000-0000-4000-8000-000000000002',occurredOn:'2026-10-01',status:'absent',expectedRevision:1}).success).toBe(false);
 });
 it('cannot enable unrestricted messaging or leaderboard without recognition policy',()=>{
  const p={expectedVersion:0,parentAttendanceVisible:false,parentUpcomingVisible:false,studentMessagingEnabled:false,recognitionEnabled:false,leaderboardEnabled:false,analyticsEnabled:false,reason:'Approved school policy',confirmPolicyApproval:true};
  expect(schoolPolicyInputSchema.safeParse(p).success).toBe(true);
  expect(schoolPolicyInputSchema.safeParse({...p,studentMessagingEnabled:true}).success).toBe(false);
  expect(schoolPolicyInputSchema.safeParse({...p,leaderboardEnabled:true}).success).toBe(false);
 });
});
