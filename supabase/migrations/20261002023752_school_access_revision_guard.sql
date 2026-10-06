begin;
alter table app.memberships add column revision integer not null default 1 check(revision>0);
alter table app.enrollments add column revision integer not null default 1 check(revision>0);
alter table app.teacher_assignments add column revision integer not null default 1 check(revision>0);
alter table app.parent_relationships add column revision integer not null default 1 check(revision>0);
create table internal.school_access_revisions(school_id uuid not null,resource text not null,source_key text not null,revision integer not null,record jsonb not null,actor_id uuid,recorded_at timestamptz not null default clock_timestamp(),primary key(school_id,resource,source_key,revision),check(resource in('memberships','enrollments','teacher_assignments','parent_relationships')),check(revision>0),check(jsonb_typeof(record)='object'));
alter table internal.school_access_revisions enable row level security;alter table internal.school_access_revisions force row level security;
revoke all on internal.school_access_revisions from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
create trigger school_access_history_immutable before update or delete on internal.school_access_revisions for each row execute function internal.academic_history_immutable();
create trigger school_access_history_no_truncate before truncate on internal.school_access_revisions for each statement execute function internal.academic_history_immutable();
create function internal.advance_school_access_revision()returns trigger language plpgsql set search_path=''as $$begin
 if tg_op='INSERT'then new.revision:=1;else new.revision:=old.revision+1;end if;return new;
end$$;
create function internal.record_school_access_revision()returns trigger language plpgsql security definer set search_path=''as $$declare row_data jsonb:=to_jsonb(new);source text;begin
 source:=case tg_table_name when'memberships'then row_data->>'actor_id'when'enrollments'then(row_data->>'class_id')||':'||(row_data->>'student_actor_id')when'teacher_assignments'then(row_data->>'class_id')||':'||(row_data->>'subject_id')||':'||(row_data->>'teacher_actor_id')else(row_data->>'parent_actor_id')||':'||(row_data->>'student_actor_id')end;
 insert into internal.school_access_revisions(school_id,resource,source_key,revision,record,actor_id)values(new.school_id,tg_table_name,source,new.revision,row_data,"authorization".actor_id());return new;
end$$;
do $$declare tab text;source_expr text;begin
 foreach tab in array array['memberships','enrollments','teacher_assignments','parent_relationships']loop
  source_expr:=case tab when'memberships'then'actor_id::text'when'enrollments'then'class_id::text||'':''||student_actor_id::text'when'teacher_assignments'then'class_id::text||'':''||subject_id::text||'':''||teacher_actor_id::text'else'parent_actor_id::text||'':''||student_actor_id::text'end;
  execute format('insert into internal.school_access_revisions(school_id,resource,source_key,revision,record)select school_id,%L,%s,revision,to_jsonb(source)from app.%I source',tab,source_expr,tab);
  execute format('create trigger school_access_revision before insert or update on app.%I for each row execute function internal.advance_school_access_revision()',tab);
  execute format('create trigger school_access_revision_history after insert or update on app.%I for each row execute function internal.record_school_access_revision()',tab);
 end loop;
end$$;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.validate_school_payload(text,jsonb)'::regprocedure);
 anchor:='if fields is null';if position(anchor in definition)=0 then raise exception 'School payload source changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if command_name in(''person.configure'',''enrollment.configure'',''assignment.configure'',''guardian.configure'')then fields:=fields||array[''expectedRevision''];if payload?''expectedRevision''and(jsonb_typeof(payload->''expectedRevision'')is distinct from''number''or payload->>''expectedRevision''!~''^[0-9]+$'')then raise exception ''Access revision invalid''using errcode=''22023'';end if;end if;'||anchor);
 definition:=replace(definition,'if command_name=''person.configure''and not(payload?&fields)','if command_name=''person.configure''and not(payload?&(fields-array[''expectedRevision'']))');execute definition;
 definition:=pg_get_functiondef('internal.school_command(text,uuid,jsonb,text,text,text)'::regprocedure);
 anchor:='source uuid;';if position(anchor in definition)=0 then raise exception 'School access declaration changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||'v_access_revision integer;');
 anchor:='-- Resolve target objects';if position(anchor in definition)=0 then raise exception 'School source boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if command_name in(''person.configure'',''enrollment.configure'',''assignment.configure'',''guardian.configure'')then perform pg_advisory_xact_lock(hashtextextended(school::text||'':school-access-mutations'',0));perform internal.require_school_admin();end if;'||chr(10)||anchor);
 anchor:='if command_name=''details.update''then update';if position(anchor in definition)=0 then raise exception 'School mutation boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if command_name=''person.configure''then select revision into v_access_revision from app.memberships where school_id=school and actor_id=target_id for update;elsif command_name=''enrollment.configure''then select revision into v_access_revision from app.enrollments where school_id=school and class_id=(payload->>''classId'')::uuid and student_actor_id=(payload->>''studentId'')::uuid for update;elsif command_name=''assignment.configure''then select revision into v_access_revision from app.teacher_assignments where school_id=school and class_id=(payload->>''classId'')::uuid and subject_id=(payload->>''subjectId'')::uuid and teacher_actor_id=(payload->>''teacherId'')::uuid for update;elsif command_name=''guardian.configure''then select revision into v_access_revision from app.parent_relationships where school_id=school and parent_actor_id=(payload->>''parentId'')::uuid and student_actor_id=(payload->>''studentId'')::uuid for update;end if;if command_name in(''person.configure'',''enrollment.configure'',''assignment.configure'',''guardian.configure'')and(coalesce(v_access_revision,0)>0 and not(payload?''expectedRevision'')or coalesce(v_access_revision,0)is distinct from coalesce((payload->>''expectedRevision'')::integer,0))then raise exception ''Current access revision changed''using errcode=''22023'';end if;'||chr(10)||anchor);
 anchor:='perform internal.finish_command';if position(anchor in definition)=0 then raise exception 'School receipt boundary changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if command_name in(''person.configure'',''enrollment.configure'',''assignment.configure'',''guardian.configure'')then response:=response||jsonb_build_object(''revision'',coalesce(v_access_revision,0)+1);end if;'||anchor);execute definition;
 definition:=pg_get_functiondef('internal.school_list(text,jsonb)'::regprocedure);
 anchor:='''''effectiveTo'''',m.effective_to';if position(anchor in definition)=0 then raise exception 'Person revision projection changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||',''''revision'''',m.revision');
 anchor:='''''effectiveTo'''',effective_to';if position(anchor in definition)=0 then raise exception 'Relationship revision projection changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,anchor||',''''revision'''',revision');execute definition;
end$$;
revoke execute on function internal.advance_school_access_revision(),internal.record_school_access_revision()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
