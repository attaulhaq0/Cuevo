begin;
create table internal.intervention_learner_notes(school_id uuid not null,intervention_id uuid not null,decision_id uuid not null,note text not null check(length(btrim(note))between 1 and 1000),primary key(school_id,intervention_id),foreign key(school_id,intervention_id)references app.interventions(school_id,id),foreign key(school_id,decision_id)references app.human_decisions(school_id,id));
create table internal.intervention_help_requests(school_id uuid not null,id uuid not null default gen_random_uuid(),intervention_id uuid not null,learner_id uuid not null,kind text not null check(kind in('INSTRUCTIONS','WORKED_EXAMPLE','FEEDBACK')),question text not null check(length(btrim(question))between 1 and 1000),requested_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,intervention_id),foreign key(school_id,intervention_id,learner_id)references app.interventions(school_id,id,learner_id));
create table internal.intervention_help_replies(school_id uuid not null,id uuid not null default gen_random_uuid(),request_id uuid not null,response text not null check(length(btrim(response))between 1 and 2000),responded_by uuid not null,responded_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,request_id),foreign key(school_id,request_id)references internal.intervention_help_requests(school_id,id),foreign key(school_id,responded_by)references app.memberships(school_id,actor_id));
do $$declare tab text;begin foreach tab in array array['intervention_learner_notes','intervention_help_requests','intervention_help_replies']loop
 execute format('alter table internal.%I enable row level security',tab);execute format('alter table internal.%I force row level security',tab);
 execute format('create trigger task_help_immutable before update or delete on internal.%I for each row execute function internal.academic_history_immutable()',tab);execute format('create trigger task_help_no_truncate before truncate on internal.%I for each statement execute function internal.academic_history_immutable()',tab);
 execute format('revoke all on internal.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',tab);
end loop;end$$;
create function internal.decide_recommendation(target uuid,choice text,reason_text text,edited_title text,edited_instructions text,learner_note text)returns uuid language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();proposal app.recommendations;decision app.human_decisions;task app.interventions;existing_note text;result uuid;begin
 if learner_note is not null and(choice is distinct from'APPROVE'or length(btrim(learner_note))not between 1 and 1000)then raise exception 'Explicit learner note requires approved task'using errcode='22023';end if;
 select*into proposal from app.recommendations where school_id=school and id=target for update;
 if not found or not"authorization".can_manage_baseline(school,proposal.baseline_result_id)then raise exception 'Approval learner note denied'using errcode='42501';end if;
 select*into decision from app.human_decisions where school_id=school and recommendation_id=target;
 if decision.id is not null then
  select*into task from app.interventions where school_id=school and recommendation_id=target;select note into existing_note from internal.intervention_learner_notes where school_id=school and intervention_id=task.id;
  if existing_note is distinct from learner_note then raise exception 'Learner approval note immutable'using errcode='22023';end if;
 end if;
 result:=internal.decide_recommendation(target,choice,reason_text,edited_title,edited_instructions);
 if decision.id is null and learner_note is not null then
  select*into decision from app.human_decisions where school_id=school and recommendation_id=target;select*into task from app.interventions where school_id=school and recommendation_id=target;
  insert into internal.intervention_learner_notes(school_id,intervention_id,decision_id,note)values(school,task.id,decision.id,learner_note);
 end if;return result;
end$$;
create function internal.read_intervention_help(target uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();task app.interventions;decision app.human_decisions;request internal.intervention_help_requests;reply internal.intervention_help_replies;begin
 select*into task from app.interventions where school_id=school and id=target;
 if not found or not internal.intervention_history_allowed(school,target)or"authorization".current_role(school)not in('teacher','admin','student')or("authorization".current_role(school)='student'and task.learner_id<>"authorization".actor_id())then raise exception 'Task help read denied'using errcode='42501';end if;
 select d.*into decision from app.human_decisions d where d.school_id=school and d.recommendation_id=task.recommendation_id and d.decision='APPROVE';
 if decision.id is null then raise exception 'Approved task provenance missing'using errcode='22023';end if;
 select*into request from internal.intervention_help_requests where school_id=school and intervention_id=task.id;
 select*into reply from internal.intervention_help_replies where school_id=school and request_id=request.id;
 return jsonb_build_object('id',task.id,'interventionId',task.id,'approval',jsonb_build_object('approvedAt',decision.created_at,'teacherName',(select display_name from app.people where school_id=school and actor_id=decision.actor_id),'learnerNote',(select note from internal.intervention_learner_notes where school_id=school and intervention_id=task.id)),
  'help',case when request.id is null then null else jsonb_build_object('id',request.id,'kind',request.kind,'question',request.question,'requestedAt',request.requested_at,'response',case when reply.id is null then null else jsonb_build_object('text',reply.response,'teacherName',(select display_name from app.people where school_id=school and actor_id=reply.responded_by),'respondedAt',reply.responded_at)end)end);
end$$;
create function internal.request_intervention_help(target uuid,input jsonb,command_key text,fingerprint text,request_id text)returns void language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();task app.interventions;reservation jsonb;help_id uuid;begin
 if input is null or jsonb_typeof(input)<>'object'or not(input?&array['kind','question','confirmSend'])or input-'kind'-'question'-'confirmSend'<>'{}'::jsonb or input->'confirmSend'is distinct from'true'::jsonb or input->>'kind'is null or input->>'kind'not in('INSTRUCTIONS','WORKED_EXAMPLE','FEEDBACK')or jsonb_typeof(input->'question')is distinct from'string'or length(btrim(input->>'question'))not between 1 and 1000 then raise exception 'Explicit bounded help request required'using errcode='22023';end if;
 select*into task from app.interventions where school_id=school and id=target for update;
 if not found or"authorization".current_role(school)<>'student'or task.learner_id<>"authorization".actor_id()or not"authorization".can_access_intervention(school,target,false)then raise exception 'Task help request denied'using errcode='42501';end if;
 if internal.intervention_requires_review(school,target)then raise exception 'Current task source review required'using errcode='42501';end if;
 reservation:=internal.begin_command(command_key,'intervention.help.request',fingerprint);if reservation->>'state'='COMPLETED'then return;end if;
 if reservation->>'state'<>'NEW'then raise exception 'Help request command in progress'using errcode='22023';end if;
 if task.status<>'ASSIGNED'or exists(select 1 from internal.intervention_help_requests where school_id=school and intervention_id=target)then raise exception 'Task help request is already recorded or task is closed'using errcode='22023';end if;
 insert into internal.intervention_help_requests(school_id,intervention_id,learner_id,kind,question)values(school,target,task.learner_id,input->>'kind',input->>'question')returning id into help_id;
 perform internal.append_audit('intervention.help.requested','intervention',target,request_id,'succeeded',jsonb_build_object('helpId',help_id,'kind',input->>'kind'));
 perform internal.enqueue_event('intervention.help.requested','intervention_help_request',help_id,1,'{}','intervention-help-request:'||help_id::text);
 perform internal.finish_command(command_key,'intervention.help.request',fingerprint,jsonb_build_object('id',help_id,'interventionId',target));
end$$;
create function internal.reply_intervention_help(target uuid,input jsonb,command_key text,fingerprint text,request_id text)returns void language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();task app.interventions;help internal.intervention_help_requests;reservation jsonb;reply_id uuid;begin
 if input is null or jsonb_typeof(input)<>'object'or not(input?&array['response','confirmSend'])or input-'response'-'confirmSend'<>'{}'::jsonb or input->'confirmSend'is distinct from'true'::jsonb or jsonb_typeof(input->'response')is distinct from'string'or length(btrim(input->>'response'))not between 1 and 2000 then raise exception 'Explicit bounded help reply required'using errcode='22023';end if;
 select*into task from app.interventions where school_id=school and id=target for update;
 if not found or"authorization".current_role(school)not in('teacher','admin')or not"authorization".can_access_intervention(school,target,true)then raise exception 'Task help response denied'using errcode='42501';end if;
 if internal.intervention_requires_review(school,target)then raise exception 'Current task source review required'using errcode='42501';end if;
 reservation:=internal.begin_command(command_key,'intervention.help.reply',fingerprint);if reservation->>'state'='COMPLETED'then return;end if;
 if reservation->>'state'<>'NEW'then raise exception 'Help reply command in progress'using errcode='22023';end if;
  select*into help from internal.intervention_help_requests where school_id=school and intervention_id=target;
 if help.id is null or exists(select 1 from internal.intervention_help_replies response where response.school_id=school and response.request_id=help.id)then raise exception 'Open help request required'using errcode='22023';end if;
 insert into internal.intervention_help_replies(school_id,request_id,response,responded_by)values(school,help.id,input->>'response',"authorization".actor_id())returning id into reply_id;
 perform internal.append_audit('intervention.help.replied','intervention',target,request_id,'succeeded',jsonb_build_object('replyId',reply_id));
 perform internal.enqueue_event('intervention.help.replied','intervention_help_reply',reply_id,1,'{}','intervention-help-reply:'||reply_id::text);
 perform internal.finish_command(command_key,'intervention.help.reply',fingerprint,jsonb_build_object('id',reply_id,'interventionId',target));
end$$;
-- Help delivery is deliberately not inferred. The worker acknowledges exact
-- immutable source events without creating learner-state signals or AI actions.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.process_learner_event(uuid,uuid)'::regprocedure);anchor:='begin'||chr(10);
 if position(anchor in definition)=0 then raise exception 'Help event dispatcher source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'begin'||chr(10)||' if exists(select 1 from internal.outbox_events event where event.id=target_event and event.type in(''intervention.help.requested'',''intervention.help.replied''))then select*into e from internal.outbox_events where id=target_event for update;if e.state<>''PROCESSING''or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()or e.version<>1 or not((e.type=''intervention.help.requested''and e.entity_type=''intervention_help_request''and exists(select 1 from internal.intervention_help_requests source where source.school_id=e.school_id and source.id=e.entity_id and source.learner_id=e.actor_id))or(e.type=''intervention.help.replied''and e.entity_type=''intervention_help_reply''and exists(select 1 from internal.intervention_help_replies source where source.school_id=e.school_id and source.id=e.entity_id and source.responded_by=e.actor_id)))then raise exception ''Help event source invalid''using errcode=''22023'';end if;insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception ''Help event lease changed''using errcode=''22023'';end if;return jsonb_build_object(''status'',''ACKNOWLEDGED'');end if;'||chr(10));execute definition;
end$$;
revoke execute on function internal.decide_recommendation(uuid,text,text,text,text,text),internal.read_intervention_help(uuid),internal.request_intervention_help(uuid,jsonb,text,text,text),internal.reply_intervention_help(uuid,jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.decide_recommendation(uuid,text,text,text,text,text),internal.read_intervention_help(uuid),internal.request_intervention_help(uuid,jsonb,text,text,text),internal.reply_intervention_help(uuid,jsonb,text,text,text)to cuevo_api;
commit;
