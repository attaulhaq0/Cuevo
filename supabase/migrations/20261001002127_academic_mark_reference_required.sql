-- Require approved context before creating an immutable mark so configuration stays recoverable.
begin;
create or replace function internal.mark_submission(target_submission uuid,mark_score numeric,mark_feedback text,expected_policy integer,expected_revision integer,source_evidence boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare s app.submissions;a app.assessments;latest integer;mid uuid;
begin
 perform internal.academic_require();
 if not "authorization".can_mark_submission("authorization".school_id(),target_submission)then raise exception 'Marking denied'using errcode='42501';end if;
 select * into s from app.submissions where school_id="authorization".school_id()and id=target_submission for update;
 select * into a from app.assessments where school_id=s.school_id and id=s.assessment_id for share;
 if a.academic_reference_id is null or not exists(select 1 from app.school_custom_references r where r.school_id=a.school_id and r.id=a.academic_reference_id and r.status='APPROVED')then raise exception 'Link an approved school objective before marking'using errcode='22023';end if;
 select coalesce(max(revision),0)into latest from app.marking_revisions where school_id=s.school_id and submission_id=s.id;
 if mark_score is null or mark_score<0 or mark_score>a.max_score or expected_policy is null or expected_policy<>a.policy_version or expected_revision is null or expected_revision<>latest or source_evidence is distinct from true then raise exception 'Invalid or stale marking context'using errcode='22023';end if;
 insert into app.marking_revisions(school_id,submission_id,learner_id,revision,score,max_score,feedback,policy_version,reference_id,source_object_id,created_by)values(s.school_id,s.id,s.learner_id,latest+1,mark_score,a.max_score,mark_feedback,a.policy_version,a.academic_reference_id,s.id,"authorization".actor_id())returning id into mid;
 return mid;
end$$;
commit;
