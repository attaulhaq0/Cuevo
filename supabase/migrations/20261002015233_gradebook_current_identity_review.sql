begin;
create function internal.gradebook_identity_requires_review(target_school uuid,target_course uuid,target_learner uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from app.courses course join app.people selected on selected.school_id=course.school_id and selected.actor_id=target_learner
 join app.enrollments peer on peer.school_id=course.school_id and peer.class_id=course.class_id join app.people person on person.school_id=peer.school_id and person.actor_id=peer.student_actor_id
 where course.school_id=target_school and course.id=target_course and peer.student_actor_id<>target_learner and lower(btrim(person.display_name))=lower(btrim(selected.display_name))and"authorization".current_learner_course(target_school,target_course,peer.student_actor_id))
$$;
-- Bound current peer identity is checked before pagination, with no extra pupil data.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_course_gradebook(uuid,integer,integer,uuid,uuid)'::regprocedure);
 anchor:='''learnerName'',display_name,''cells''';if position(anchor in definition)=0 then raise exception 'Gradebook row identity source changed'using errcode='22023';end if;
 execute replace(definition,anchor,'''learnerName'',display_name,''identityRequiresReview'',internal.gradebook_identity_requires_review(school,target_course,id),''cells''');
 definition:=pg_get_functiondef('internal.preview_gradebook_release(uuid,jsonb)'::regprocedure);
 anchor:='cell:=internal.gradebook_native_cell(school,assessment.id,source.learner_id);';if position(anchor in definition)=0 then raise exception 'Gradebook reviewed identity source changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if internal.gradebook_identity_requires_review(school,target_course,source.learner_id)then raise exception ''Current learner identity context requires review before selected release''using errcode=''22023'';end if;'||chr(10)||anchor);
end$$;
revoke execute on function internal.gradebook_identity_requires_review(uuid,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
