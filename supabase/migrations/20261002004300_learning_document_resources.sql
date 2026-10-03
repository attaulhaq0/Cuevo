begin;
alter table app.private_assets add column purpose text not null default 'PERSONAL' check(purpose in('PERSONAL','COURSE_RESOURCE'));
alter table app.private_assets add column course_id uuid;
alter table app.private_assets add foreign key(school_id,course_id)references app.courses(school_id,id);
alter table app.private_assets add check((purpose='PERSONAL'and course_id is null)or(purpose='COURSE_RESOURCE'and course_id is not null));
-- Names are display metadata; storage keys continue to use generated IDs only.
do $$declare constraint_name text;begin
 for constraint_name in select conname from pg_constraint where conrelid='app.private_assets'::regclass and contype='c'and pg_get_constraintdef(oid)like'%name ~%'loop execute format('alter table app.private_assets drop constraint %I',constraint_name);end loop;
end$$;
alter table app.private_assets add check(length(btrim(name))between 1 and 120 and name not in('.','..')and name !~'[[:cntrl:]/\\]'and name !~U&'[\202A-\202E\2066-\2069]');
create function internal.asset_purpose_immutable()returns trigger language plpgsql set search_path=''as $$begin if new.purpose is distinct from old.purpose or new.course_id is distinct from old.course_id then raise exception 'Asset purpose immutable'using errcode='55000';end if;return new;end$$;
create trigger asset_purpose_immutable before update on app.private_assets for each row execute function internal.asset_purpose_immutable();
drop policy asset_read on app.private_assets;
create policy asset_read on app.private_assets for select to cuevo_api using(purpose='PERSONAL'and"authorization".can_read_asset(school_id,owner_id));
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.asset_command(text,uuid,jsonb,text,text,text)'::regprocedure);previous:=definition;
 definition:=replace(definition,'owner:=asset.owner_id;','owner:=asset.owner_id;if asset.purpose<>''PERSONAL''then raise exception ''Resource purpose requires its domain''using errcode=''42501'';end if;');
 if definition=previous then raise exception 'Personal asset source guard shape changed'using errcode='22023';end if;execute definition;
end$$;
create table app.learning_resources(
 school_id uuid not null,id uuid not null default gen_random_uuid(),course_id uuid not null,target_kind text not null check(target_kind in('lesson','activity','assessment')),target_id uuid not null,title text not null check(length(btrim(title))between 1 and 200),sequence integer not null check(sequence between 1 and 10000),created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),foreign key(school_id,course_id)references app.courses(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id),unique(school_id,course_id,target_kind,target_id,sequence));
create table app.learning_resource_revisions(
 school_id uuid not null,id uuid not null default gen_random_uuid(),resource_id uuid not null,revision integer not null check(revision>0),asset_id uuid not null,state text not null check(state in('ATTACHED','PUBLISHED','REMOVED')),reason text not null,created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(school_id,id),unique(school_id,id,resource_id),unique(school_id,resource_id,revision),foreign key(school_id,resource_id)references app.learning_resources(school_id,id),foreign key(school_id,asset_id)references app.private_assets(school_id,id),foreign key(school_id,created_by)references app.memberships(school_id,actor_id));
create table app.learning_resource_current(school_id uuid not null,resource_id uuid not null,revision_id uuid not null,primary key(school_id,resource_id),foreign key(school_id,revision_id,resource_id)references app.learning_resource_revisions(school_id,id,resource_id));
create index learning_resources_target on app.learning_resources(school_id,course_id,target_kind,target_id,sequence,id);

create function internal.resource_target_allowed(target_course uuid,target_kind text,target_id uuid,author boolean)returns boolean language plpgsql stable security definer set search_path=''as $$
declare school uuid:="authorization".school_id();course uuid;published boolean:=true;begin
 if not"authorization".has_entitlement(school,'learning')or"authorization".current_role(school)not in('admin','teacher','student')then return false;end if;
 if target_kind='lesson'then select unit.course_id into course from app.lessons lesson join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where lesson.school_id=school and lesson.id=target_id;
 elsif target_kind='activity'then select unit.course_id into course from app.activities activity join app.lessons lesson on lesson.school_id=activity.school_id and lesson.id=activity.lesson_id join app.units unit on unit.school_id=lesson.school_id and unit.id=lesson.unit_id where activity.school_id=school and activity.id=target_id;
 elsif target_kind='assessment'then select assessment.course_id,assessment.status='PUBLISHED'into course,published from app.assessments assessment where assessment.school_id=school and assessment.id=target_id;else return false;end if;
 if course is distinct from target_course or target_kind='assessment'and not"authorization".has_entitlement(school,'assessment')then return false;end if;
 if author then return"authorization".current_role(school)in('admin','teacher')and"authorization".can_manage_course(school,course);end if;
 return("authorization".current_role(school)in('admin','teacher')and"authorization".can_manage_course(school,course))or("authorization".current_role(school)='student'and published and"authorization".can_learn_course(school,course));
end$$;

create function internal.read_resource_asset(target_course uuid,target_asset uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare school uuid:="authorization".school_id();asset app.private_assets;begin
 if not"authorization".has_entitlement(school,'learning')or"authorization".current_role(school)not in('admin','teacher')or not"authorization".can_manage_course(school,target_course)then raise exception 'Resource preparation denied'using errcode='42501';end if;
 select*into asset from app.private_assets where school_id=school and id=target_asset and purpose='COURSE_RESOURCE'and course_id=target_course and created_by="authorization".actor_id();
 if not found or asset.state='RETIRED'then raise exception 'Resource asset unavailable'using errcode='42501';end if;
 return jsonb_build_object('id',asset.id,'ownerId',asset.owner_id,'name',asset.name,'contentType',asset.content_type,'byteSize',asset.byte_size,'sha256',asset.sha256,'state',asset.state,'objectPath',asset.object_path);
end$$;

create function internal.resource_projection(target_resource uuid,target_revision uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',resource.id,'revisionId',revision.id,'revision',revision.revision,'courseId',resource.course_id,'targetKind',resource.target_kind,'targetId',resource.target_id,'title',resource.title,'sequence',resource.sequence,'state',revision.state,'assetId',asset.id,'name',asset.name,'contentType',asset.content_type,'byteSize',asset.byte_size,'sha256',asset.sha256,'assetState',asset.state,'createdAt',revision.created_at)
 from app.learning_resources resource join app.learning_resource_revisions revision on revision.school_id=resource.school_id and revision.resource_id=resource.id join app.private_assets asset on asset.school_id=revision.school_id and asset.id=revision.asset_id where resource.school_id="authorization".school_id()and resource.id=target_resource and revision.id=target_revision
$$;

create function internal.learning_resource_command(command_name text,target_course uuid,target_kind text,target_id uuid,target_resource uuid,payload jsonb,command_key text,fingerprint text,request_id text)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();actor uuid:="authorization".actor_id();resource app.learning_resources;current_revision app.learning_resource_revisions;asset app.private_assets;rid uuid;vid uuid;result jsonb;reservation jsonb;
begin
 if not"authorization".has_entitlement(school,'learning')or"authorization".current_role(school)not in('admin','teacher')or not"authorization".can_manage_course(school,target_course)then raise exception 'Managed resource course required'using errcode='42501';end if;
 perform internal.lock_academic_course(school,target_course);
 if command_name in('attach')then if not internal.resource_target_allowed(target_course,target_kind,target_id,true)then raise exception 'Resource target denied'using errcode='42501';end if;
 elsif command_name in('replace','remove','publish')then
  select*into resource from app.learning_resources where school_id=school and id=target_resource and course_id=target_course;
  if not found or not internal.resource_target_allowed(target_course,resource.target_kind,resource.target_id,true)then raise exception 'Resource source denied'using errcode='42501';end if;
  select revision.*into current_revision from app.learning_resource_current pointer join app.learning_resource_revisions revision on revision.school_id=pointer.school_id and revision.id=pointer.revision_id where pointer.school_id=school and pointer.resource_id=resource.id for update of pointer;
  if current_revision.id is null then raise exception 'Resource source unavailable'using errcode='22023';end if;
 end if;
 if command_name='finalize'then select*into asset from app.private_assets where school_id=school and id=target_resource and purpose='COURSE_RESOURCE'and course_id=target_course and created_by=actor;
 elsif command_name in('attach','replace')then select*into asset from app.private_assets where school_id=school and id=(payload->>'assetId')::uuid and purpose='COURSE_RESOURCE'and course_id=target_course and created_by=actor;
 end if;
 if command_name in('finalize','attach','replace')and(asset.id is null or asset.state='RETIRED')then raise exception 'Exact resource asset denied'using errcode='42501';end if;
 if command_name in('attach','replace')and asset.state<>'AVAILABLE'then raise exception 'Verify resource before attaching'using errcode='22023';end if;
 reservation:=internal.begin_command(command_key,'learning.resource.'||command_name,fingerprint);if reservation->>'state'='COMPLETED'then return reservation->'response';elsif reservation->>'state'<>'NEW'then raise exception 'Resource command pending'using errcode='22023';end if;
 if command_name='stage'then
  if(payload->>'byteSize')::integer not between 1 and 524288 or payload->>'contentType'not in('text/plain','image/png','image/jpeg','application/pdf')or payload->>'sha256'!~'^[a-f0-9]{64}$'then raise exception 'Bounded resource metadata required'using errcode='22023';end if;
  rid:=gen_random_uuid();insert into app.private_assets(school_id,id,owner_id,created_by,name,content_type,byte_size,sha256,object_path,purpose,course_id)values(school,rid,actor,actor,payload->>'name',payload->>'contentType',(payload->>'byteSize')::integer,payload->>'sha256',school::text||'/resource/'||rid::text,'COURSE_RESOURCE',target_course);
  result:=jsonb_build_object('id',rid,'state','STAGED');
 elsif command_name='finalize'then
  if(payload->>'sha256')is distinct from asset.sha256 or(payload->>'byteSize')::integer is distinct from asset.byte_size then raise exception 'Resource byte metadata mismatch'using errcode='22023';end if;
  update app.private_assets set state='AVAILABLE',available_at=coalesce(available_at,clock_timestamp())where school_id=school and id=asset.id;rid:=asset.id;result:=jsonb_build_object('id',rid,'state','AVAILABLE');
 elsif command_name='attach'then
  if payload->>'title'is null or length(btrim(payload->>'title'))not between 1 and 200 or payload->>'sequence'is null or(payload->>'sequence')::integer not between 1 and 10000 then raise exception 'Resource context invalid'using errcode='22023';end if;
  rid:=gen_random_uuid();insert into app.learning_resources(school_id,id,course_id,target_kind,target_id,title,sequence,created_by)values(school,rid,target_course,target_kind,target_id,payload->>'title',(payload->>'sequence')::integer,actor);
  insert into app.learning_resource_revisions(school_id,resource_id,revision,asset_id,state,reason,created_by)values(school,rid,1,asset.id,'ATTACHED','Resource attached',actor)returning id into vid;insert into app.learning_resource_current values(school,rid,vid);result:=internal.resource_projection(rid,vid);
 elsif command_name in('replace','remove','publish')then
  if current_revision.id is null or current_revision.state='REMOVED'or(payload->>'expectedRevision')::integer is distinct from current_revision.revision then raise exception 'Resource revision changed'using errcode='22023';end if;
  if command_name='publish'and((payload->>'confirmPublication')::boolean is distinct from true or not exists(select 1 from app.private_assets where school_id=school and id=current_revision.asset_id and state='AVAILABLE'))then raise exception 'Verified resource publication requires approval'using errcode='22023';end if;
  if command_name in('replace','remove')and(payload->>'reason'is null or length(btrim(payload->>'reason'))not between 1 and 1000)then raise exception 'Resource reason required'using errcode='22023';end if;
  if command_name='remove'and(payload->>'confirmRemoval')::boolean is distinct from true then raise exception 'Resource removal requires approval'using errcode='22023';end if;
  rid:=resource.id;insert into app.learning_resource_revisions(school_id,resource_id,revision,asset_id,state,reason,created_by)values(school,rid,current_revision.revision+1,case when command_name='replace'then asset.id else current_revision.asset_id end,case command_name when'remove'then'REMOVED'when'publish'then'PUBLISHED'else'ATTACHED'end,case when command_name='publish'then'Resource publication approved'else payload->>'reason'end,actor)returning id into vid;
  update app.learning_resource_current set revision_id=vid where school_id=school and resource_id=rid;result:=internal.resource_projection(rid,vid);
 else raise exception 'Unknown learning resource command'using errcode='22023';end if;
 perform internal.append_audit('learning.resource.'||command_name,'resource',rid,request_id,'succeeded','{}');perform internal.enqueue_event('learning.resource.changed','resource',rid,1,'{}','learning-resource:'||md5(actor::text||':'||command_name||':'||command_key));perform internal.finish_command(command_key,'learning.resource.'||command_name,fingerprint,result);return result;
end$$;

create function internal.read_learning_resource_page(target_course uuid,target_kind text,target_id uuid,page_limit integer,page_cursor uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();entry record;items jsonb:='[]';count_rows integer:=0;begin
 if page_limit not between 1 and 100 or not internal.resource_target_allowed(target_course,target_kind,target_id,false)then raise exception 'Resource list denied'using errcode='42501';end if;
 for entry in select resource.id,revision.id revision_id from app.learning_resources resource join app.learning_resource_current pointer on pointer.school_id=resource.school_id and pointer.resource_id=resource.id join app.learning_resource_revisions revision on revision.school_id=pointer.school_id and revision.id=pointer.revision_id join app.private_assets asset on asset.school_id=revision.school_id and asset.id=revision.asset_id
 where resource.school_id=school and resource.course_id=target_course and resource.target_kind=target_kind and resource.target_id=target_id and(page_cursor is null or resource.id>page_cursor)and("authorization".current_role(school)in('admin','teacher')or(revision.state='PUBLISHED'and asset.state='AVAILABLE'))order by resource.id limit page_limit+1 loop
  count_rows:=count_rows+1;items:=items||jsonb_build_array(internal.resource_projection(entry.id,entry.revision_id));end loop;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb)from jsonb_array_elements(items)with ordinality entries(value,ordinal)where ordinal<=page_limit),'nextCursor',case when count_rows>page_limit then items->(page_limit-1)->>'id'else null end);
end$$;

create function internal.read_learning_resource_delivery(target_resource uuid,target_revision uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare school uuid:="authorization".school_id();resource app.learning_resources;revision app.learning_resource_revisions;asset app.private_assets;begin
 select*into resource from app.learning_resources where school_id=school and id=target_resource;
 select*into revision from app.learning_resource_revisions where school_id=school and id=target_revision and resource_id=target_resource;
 if resource.id is null or revision.id is null or not internal.resource_target_allowed(resource.course_id,resource.target_kind,resource.target_id,false)then raise exception 'Resource delivery denied'using errcode='42501';end if;
 if not exists(select 1 from app.learning_resource_current where school_id=school and resource_id=resource.id and revision_id=revision.id)or revision.state='REMOVED'or("authorization".current_role(school)='student'and revision.state<>'PUBLISHED')then raise exception 'Current published resource required'using errcode='42501';end if;
 select*into asset from app.private_assets where school_id=school and id=revision.asset_id and purpose='COURSE_RESOURCE'and course_id=resource.course_id and state='AVAILABLE';if not found then raise exception 'Available resource bytes required'using errcode='42501';end if;
 return jsonb_build_object('resource',internal.resource_projection(resource.id,revision.id),'asset',jsonb_build_object('id',asset.id,'ownerId',asset.owner_id,'name',asset.name,'contentType',asset.content_type,'byteSize',asset.byte_size,'sha256',asset.sha256,'state',asset.state,'objectPath',asset.object_path));
end$$;
do $$declare tab text;begin foreach tab in array array['learning_resources','learning_resource_revisions','learning_resource_current']loop execute format('alter table app.%I enable row level security',tab);execute format('alter table app.%I force row level security',tab);execute format('revoke all on app.%I from public,anon,authenticated,service_role,cuevo_api,cuevo_worker',tab);end loop;foreach tab in array array['learning_resources','learning_resource_revisions']loop execute format('create trigger immutable_history before update or delete on app.%I for each row execute function internal.academic_history_immutable()',tab);execute format('create trigger immutable_truncate before truncate on app.%I for each statement execute function internal.academic_history_immutable()',tab);end loop;end$$;
revoke execute on function internal.asset_purpose_immutable(),internal.resource_target_allowed(uuid,text,uuid,boolean),internal.read_resource_asset(uuid,uuid),internal.resource_projection(uuid,uuid),internal.learning_resource_command(text,uuid,text,uuid,uuid,jsonb,text,text,text),internal.read_learning_resource_page(uuid,text,uuid,integer,uuid),internal.read_learning_resource_delivery(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_resource_asset(uuid,uuid),internal.learning_resource_command(text,uuid,text,uuid,uuid,jsonb,text,text,text),internal.read_learning_resource_page(uuid,text,uuid,integer,uuid),internal.read_learning_resource_delivery(uuid,uuid)to cuevo_api;
-- Resource links are reliable audited asynchronous events, with no academic/habit inference.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.process_learner_event(uuid,uuid)'::regprocedure);anchor:='begin'||chr(10);
 if position(anchor in definition)=0 then raise exception 'Resource event dispatcher shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'begin'||chr(10)||' if exists(select 1 from internal.outbox_events event where event.id=target_event and event.type=''learning.resource.changed'')then select*into e from internal.outbox_events where id=target_event for update;if e.state<>''PROCESSING''or e.lease_token is distinct from current_lease or e.lease_until<=clock_timestamp()or e.entity_type<>''resource''or not(exists(select 1 from app.learning_resources where school_id=e.school_id and id=e.entity_id)or exists(select 1 from app.private_assets where school_id=e.school_id and id=e.entity_id and purpose=''COURSE_RESOURCE''))then raise exception ''Resource event source invalid''using errcode=''22023'';end if;insert into internal.processed_events(event_id,school_id)values(e.id,e.school_id)on conflict(event_id)do nothing;if internal.complete_outbox(e.id,current_lease)is distinct from true then raise exception ''Resource acknowledgement lease changed''using errcode=''22023'';end if;return jsonb_build_object(''status'',''ACKNOWLEDGED'');end if;'||chr(10));execute definition;
end$$;
commit;
