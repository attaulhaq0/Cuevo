-- Pure current identity projection follows the page's exact source authority loop.
-- Source, native evidence, parent revision pointers and review metadata stay per row.
begin;
create function internal.portfolio_page_identities(authorized_rows jsonb)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();answer jsonb;input_count integer;context_count integer;
begin
 if authorized_rows is null or jsonb_typeof(authorized_rows)<>'array'or jsonb_array_length(authorized_rows)>101 then raise exception 'Bounded authorized portfolio sources required'using errcode='22023';end if;
 with inputs as materialized(
  select item,ordinal from jsonb_array_elements(authorized_rows)with ordinality value(item,ordinal)
 ),contexts as materialized(
  select input.item,input.ordinal,submission.learner_id,course.class_id,
   jsonb_build_object('status','REQUIRES_REVIEW','learnerName',nullif(btrim(person.display_name),''),'className',nullif(btrim(class.name),''),'yearGroupName',nullif(btrim(year_group.name),''),'academicYearName',nullif(btrim(academic_year.name),''),'courseTitle',nullif(btrim(coalesce(course_revision.title,course.title)),''),'assessmentTitle',nullif(btrim(coalesce(snapshot.assessment_title,assessment.title)),''),'submittedAt',submission.submitted_at,'submissionRevision',submission.revision)as identity
  from inputs input join app.submissions submission on submission.school_id=school and submission.id=(input.item->>'submissionId')::uuid and submission.learner_id=(input.item->>'learnerId')::uuid
  join app.assessments assessment on assessment.school_id=submission.school_id and assessment.id=submission.assessment_id
  join app.courses course on course.school_id=assessment.school_id and course.id=assessment.course_id
  join app.classes class on class.school_id=course.school_id and class.id=course.class_id
  left join app.year_groups year_group on year_group.school_id=class.school_id and year_group.id=class.year_group_id
  left join app.academic_years academic_year on academic_year.school_id=class.school_id and academic_year.id=class.academic_year_id
  left join app.people person on person.school_id=submission.school_id and person.actor_id=submission.learner_id
  left join app.learning_submission_context snapshot on snapshot.school_id=submission.school_id and snapshot.submission_id=submission.id
  left join app.learning_content_revisions course_revision on course_revision.school_id=snapshot.school_id and course_revision.id=snapshot.course_revision_id
 ),groups as materialized(
  select distinct learner_id,class_id,identity->>'learnerName'as learner_name from contexts
 ),exact_peers as materialized(
  -- Reject unrelated classes, different names and inactive peers before person authority.
  select distinct source.learner_id,source.class_id,source.learner_name,member.actor_id as peer_actor
  from groups source join app.enrollments enrollment on enrollment.school_id=school and enrollment.class_id=source.class_id
  join app.memberships member on member.school_id=enrollment.school_id and member.actor_id=enrollment.student_actor_id
  join app.people person on person.school_id=member.school_id and person.actor_id=member.actor_id
  where member.actor_id<>source.learner_id and member.role='student'and member.status='active'and member.effective_from<=now()and(member.effective_to is null or member.effective_to>now())
   and enrollment.status='active'and enrollment.effective_from<=now()and(enrollment.effective_to is null or enrollment.effective_to>now())and btrim(person.display_name)=source.learner_name
 ),duplicates as materialized(
  select distinct learner_id,class_id,learner_name from exact_peers where"authorization".can_view_person(school,peer_actor)
 ),projected as materialized(
  select context.ordinal,context.item||jsonb_build_object('identity',case when not exists(select 1 from duplicates duplicate where duplicate.learner_id=context.learner_id and duplicate.class_id=context.class_id and duplicate.learner_name=context.identity->>'learnerName')and not exists(select 1 from jsonb_each(context.identity)field where field.key<>'status'and field.value='null'::jsonb)then context.identity||jsonb_build_object('status','READY')else context.identity end)as item
  from contexts context
 )
 select(select count(*)from inputs),(select count(*)from contexts),coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb)into input_count,context_count,answer from projected;
 if input_count<>context_count then raise exception 'Exact portfolio identity source unavailable'using errcode='42501';end if;
 return answer;
end$$;
revoke execute on function internal.portfolio_page_identities(jsonb)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_portfolio_page(integer,uuid,uuid,uuid)'::regprocedure);
 anchor:='''identity'',internal.identity_from_validated_source(source),';
 if position(anchor in definition)=0 or position('begin source:=internal.portfolio_source(row_item.source_model,row_item.evidence_id,role_name=''parent'');exception when insufficient_privilege then continue;end;'in definition)=0 then raise exception 'Portfolio page exact source/identity boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'');
 anchor:=' if octet_length(result::text)>500000';
 if position(anchor in definition)=0 then raise exception 'Portfolio page envelope boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,' result:=internal.portfolio_page_identities(result);'||chr(10)||anchor);execute definition;
end$$;
commit;
