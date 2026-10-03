begin;
-- Choice keys are stable lookup identifiers, never primary customer labels or authority.
create function internal.parent_conversation_choice_id(learner uuid,parent uuid,teacher uuid,class uuid,subject uuid)returns uuid language sql immutable set search_path=''as $$
 select (substr(hash,1,8)||'-'||substr(hash,9,4)||'-5'||substr(hash,14,3)||'-8'||substr(hash,18,3)||'-'||substr(hash,21,12))::uuid from(select md5('cuevo-parent-conversation-choice-v1:'||learner::text||':'||parent::text||':'||teacher::text||':'||class::text||':'||subject::text)hash)digest
$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.parent_conversation_list(text,uuid,jsonb)'::regprocedure);anchor:='md5(e.student_actor_id::text||r.parent_actor_id::text||t.teacher_actor_id::text||e.class_id::text||t.subject_id::text)::uuid';
 if position(anchor in definition)=0 then raise exception 'Conversation choice identity shape changed'using errcode='22023';end if;
 execute replace(definition,anchor,'internal.parent_conversation_choice_id(e.student_actor_id,r.parent_actor_id,t.teacher_actor_id,e.class_id,t.subject_id)');
end$$;
revoke execute on function internal.parent_conversation_choice_id(uuid,uuid,uuid,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
