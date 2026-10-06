begin;
create table app.intelligence_policy_approvals(school_id uuid not null,id uuid not null default gen_random_uuid(),version integer not null,policy jsonb not null,reason text not null,approved_by uuid not null,approved_at timestamptz not null default clock_timestamp(),primary key(school_id,id),unique(school_id,version),foreign key(school_id,approved_by)references app.memberships(school_id,actor_id));
alter table app.intelligence_policy_approvals enable row level security;alter table app.intelligence_policy_approvals force row level security;
create trigger policy_approval_immutable before update or delete on app.intelligence_policy_approvals for each row execute function internal.academic_history_immutable();
create trigger policy_approval_no_truncate before truncate on app.intelligence_policy_approvals for each statement execute function internal.academic_history_immutable();
revoke all on app.intelligence_policy_approvals from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create function internal.read_school_intelligence_policy()returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();policy app.intelligence_policies;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)<>'admin'then raise exception 'School intelligence policy denied'using errcode='42501';end if;
 select*into policy from app.intelligence_policies where school_id=school;
 return jsonb_build_object('id',school,'policy',case when policy.school_id is null then null else jsonb_build_object('version',policy.version,'purpose',policy.purpose,'dataClassification',policy.data_classification,'fixtureEnabled',policy.fixture_enabled,'liveEnabled',policy.live_enabled,'allowedActions',policy.allowed_actions,'approvedAt',policy.approved_at)end);
end$$;
create function internal.approve_school_intelligence_policy(input jsonb,command_key text,fingerprint text,request_id text)returns void language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();version_value integer;actions text[];reservation jsonb;begin
 if not"authorization".improvement_access(school)or"authorization".current_role(school)<>'admin'then raise exception 'School intelligence approval denied'using errcode='42501';end if;
 if input is null or jsonb_typeof(input)<>'object'or not(input?&array['purpose','dataClassification','fixtureEnabled','liveEnabled','allowedActions','expectedVersion','confirmApproval','reason'])or input-'purpose'-'dataClassification'-'fixtureEnabled'-'liveEnabled'-'allowedActions'-'expectedVersion'-'confirmApproval'-'reason'<>'{}'::jsonb or input->>'purpose'is distinct from'NEXT_LEARNING_ACTION'or input->>'dataClassification'is distinct from'SCHOOL_CUSTOM_NUMERIC'or input->'confirmApproval'is distinct from'true'::jsonb or jsonb_typeof(input->'fixtureEnabled')is distinct from'boolean'or jsonb_typeof(input->'liveEnabled')is distinct from'boolean'or jsonb_typeof(input->'allowedActions')is distinct from'array'or jsonb_typeof(input->'expectedVersion')is distinct from'number'or(input->>'expectedVersion')!~'^[0-9]+$'or jsonb_typeof(input->'reason')is distinct from'string'or length(btrim(input->>'reason'))not between 1 and 1000 then raise exception 'Explicit purpose/action approval required'using errcode='22023';end if;
 select array_agg(action)into actions from jsonb_array_elements_text(input->'allowedActions')action;
 if cardinality(actions)is null or cardinality(actions)not between 1 and 2 or not(actions<@array['GUIDED_PRACTICE','REVIEW_FEEDBACK']::text[])or cardinality(actions)<>(select count(distinct action)from unnest(actions)action)then raise exception 'Bounded actions required'using errcode='22023';end if;
 if(input->>'liveEnabled')::boolean and not exists(select 1 from app.intelligence_budget_policies where school_id=school)then raise exception 'Approved school live budget required'using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('school-intelligence-policy:'||school::text,0));
 reservation:=internal.begin_command(command_key,'intelligence.policy.approve',fingerprint);if reservation->>'state'='COMPLETED'then return;end if;
 select coalesce(max(version),0)into version_value from app.intelligence_policies where school_id=school;
 if(input->>'expectedVersion')::integer is distinct from version_value then raise exception 'School intelligence version changed'using errcode='22023';end if;
 insert into app.intelligence_policy_approvals(school_id,version,policy,reason,approved_by)values(school,version_value+1,input-'expectedVersion'-'confirmApproval'-'reason',input->>'reason',actor);
 insert into app.intelligence_policies(school_id,version,fixture_enabled,live_enabled,purpose,data_classification,allowed_actions,approved_by,approved_at)values(school,version_value+1,(input->>'fixtureEnabled')::boolean,(input->>'liveEnabled')::boolean,'NEXT_LEARNING_ACTION','SCHOOL_CUSTOM_NUMERIC',actions,actor,clock_timestamp())on conflict(school_id)do update set version=excluded.version,fixture_enabled=excluded.fixture_enabled,live_enabled=excluded.live_enabled,allowed_actions=excluded.allowed_actions,approved_by=excluded.approved_by,approved_at=excluded.approved_at;
 perform internal.append_audit('intelligence.policy.approved','school',school,request_id,'succeeded',jsonb_build_object('version',version_value+1,'purpose','NEXT_LEARNING_ACTION'));
 perform internal.finish_command(command_key,'intelligence.policy.approve',fingerprint,jsonb_build_object('id',school,'version',version_value+1));
end$$;
revoke execute on function internal.read_school_intelligence_policy(),internal.approve_school_intelligence_policy(jsonb,text,text,text)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_school_intelligence_policy(),internal.approve_school_intelligence_policy(jsonb,text,text,text)to cuevo_api;
commit;
