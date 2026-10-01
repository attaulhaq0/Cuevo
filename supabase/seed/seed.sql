-- Synthetic fixtures only. Auth subjects are provisioned by the local Admin API after reset.
begin;
insert into app.schools(id,name,country_code,languages) values
 ('10000000-0000-4000-8000-000000000001','Cuevo Reference Academy – Doha','QA',array['en','ar']),
 ('10000000-0000-4000-8000-000000000002','Synthetic Isolation School','QA',array['en','ar']);
insert into app.memberships(id,school_id,actor_id,role,effective_from)
select ('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 case when i<=131 then '10000000-0000-4000-8000-000000000001'::uuid else '10000000-0000-4000-8000-000000000002'::uuid end,
 ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 case when i in (1,132) then 'admin' when i<=3 then 'coordinator' when i<=11 then 'teacher' when i<=71 or i=133 then 'student' else 'parent' end,
 '2026-09-01T00:00:00Z' from generate_series(1,133) i;
insert into app.people(school_id,actor_id,display_name,synthetic)
select school_id,actor_id,'Synthetic '||role||' '||lpad((right(actor_id::text,12)::integer)::text,3,'0'),true from app.memberships;
insert into app.entitlements(school_id,code,enabled,effective_from)
select id,'school.context',true,'2026-09-01T00:00:00Z' from app.schools;
insert into app.entitlements(school_id,code,enabled,effective_from)
select s.id,c.code,true,'2026-09-01T00:00:00Z' from app.schools s cross join (values('learning'),('assessment'),('curriculum')) c(code);
insert into app.academic_years(school_id,id,name,starts_on,ends_on) values
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Synthetic 2026–2027','2026-09-01','2027-07-01'),
 ('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','Synthetic 2026–2027','2026-09-01','2027-07-01');
insert into app.terms(school_id,id,academic_year_id,name,starts_on,ends_on)
select school_id,('41000000-0000-4000-8000-'||right(id::text,12))::uuid,id,'Synthetic Term 1','2026-09-01','2026-12-20' from app.academic_years;
insert into app.year_groups(school_id,id,name,ordinal)
select '10000000-0000-4000-8000-000000000001',('42000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic Year Group '||i,i from generate_series(1,4) i;
insert into app.year_groups(school_id,id,name,ordinal) values('10000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000005','Isolation Year Group',1);
insert into app.classes(school_id,id,academic_year_id,year_group_id,name)
select '10000000-0000-4000-8000-000000000001',('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '40000000-0000-4000-8000-000000000001',('42000000-0000-4000-8000-'||lpad(((i-1)%4+1)::text,12,'0'))::uuid,'Synthetic Class '||i from generate_series(1,6) i;
insert into app.classes(school_id,id,academic_year_id,year_group_id,name) values
 ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000005','Isolation Class');
insert into app.subjects(school_id,id,name)
select '10000000-0000-4000-8000-000000000001',('43000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 (array['Mathematics','English','Arabic','Science','Computing','Art','Physical Education','School Custom Project'])[i] from generate_series(1,8) i;
insert into app.subjects(school_id,id,name) values('10000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000009','Isolation Subject');
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from)
select '10000000-0000-4000-8000-000000000001',('30000000-0000-4000-8000-'||lpad(((i-12)%6+1)::text,12,'0'))::uuid,
 ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'2026-09-01T00:00:00Z' from generate_series(12,71) i;
insert into app.enrollments(school_id,class_id,student_actor_id,effective_from) values
 ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000133','2026-09-01T00:00:00Z');
insert into app.teacher_assignments(school_id,class_id,subject_id,teacher_actor_id,effective_from)
select '10000000-0000-4000-8000-000000000001',('30000000-0000-4000-8000-'||lpad(((i-4)%6+1)::text,12,'0'))::uuid,
 ('43000000-0000-4000-8000-'||lpad((i-3)::text,12,'0'))::uuid,('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '2026-09-01T00:00:00Z' from generate_series(4,11) i;
insert into app.parent_relationships(school_id,parent_actor_id,student_actor_id,relationship_type,effective_from)
select '10000000-0000-4000-8000-000000000001',('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('20000000-0000-4000-8000-'||lpad((i-60)::text,12,'0'))::uuid,'guardian','2026-09-01T00:00:00Z' from generate_series(72,131) i;
insert into app.school_custom_versions(school_id,id,version,created_by)values('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','synthetic-school-1','20000000-0000-4000-8000-000000000002');
insert into app.school_custom_references(school_id,id,version_id,title,description,status,created_by,approved_by,approved_at)values('10000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Synthetic school-authored explanation objective','Demonstration objective created by the synthetic school; not an official curriculum standard.','APPROVED','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','2026-10-01T00:00:00Z');
commit;
