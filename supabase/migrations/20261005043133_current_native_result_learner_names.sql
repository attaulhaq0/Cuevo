begin;
-- Enrich only the already-admitted bounded native rows. Names are current
-- permitted person context; retained result values and history are unchanged.
do $$
declare signature text;definition text;original text;name_anchor text;join_anchor text;
begin
 foreach signature in array array[
  'internal.list_current_native_results_scoped(integer,uuid,uuid)',
  'internal.list_parent_current_results_scoped(integer,uuid,uuid)',
  'internal.list_current_native_results_period(integer,uuid,uuid,uuid)',
  'internal.list_parent_current_results_period(integer,uuid,uuid,uuid)'
 ]loop
  definition:=pg_get_functiondef(signature::regprocedure);original:=definition;
  name_anchor:='''learnerId'',b.learner_id,''revision''';
  join_anchor:='join app.school_custom_references ref on ref.school_id=b.school_id and ref.id=b.reference_id;';
  if (length(definition)-length(replace(definition,name_anchor,'')))/length(name_anchor)<>1
   or(length(definition)-length(replace(definition,join_anchor,'')))/length(join_anchor)<>1
   or position('''learnerName'''in definition)>0 then
   raise exception 'Current native result name projection source changed'using errcode='22023';
  end if;
  definition:=replace(definition,name_anchor,'''learnerId'',b.learner_id,''learnerName'',case when nullif(btrim(learner.display_name),'''')is not null then learner.display_name else null end,''revision''');
  definition:=replace(definition,join_anchor,'join app.school_custom_references ref on ref.school_id=b.school_id and ref.id=b.reference_id left join app.people learner on learner.school_id=b.school_id and learner.actor_id=b.learner_id and "authorization".can_view_person(b.school_id,b.learner_id);');
  if definition=original then raise exception 'Native result name projection unchanged'using errcode='22023';end if;
  execute definition;
 end loop;
end$$;
-- CREATE OR REPLACE retains the existing ownership/security/configuration/ACL.
-- Reassert current least-privilege surfaces without granting the Parent helpers.
revoke execute on function internal.list_current_native_results_scoped(integer,uuid,uuid),internal.list_parent_current_results_scoped(integer,uuid,uuid),internal.list_current_native_results_period(integer,uuid,uuid,uuid),internal.list_parent_current_results_period(integer,uuid,uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.list_current_native_results_scoped(integer,uuid,uuid),internal.list_current_native_results_period(integer,uuid,uuid,uuid)to cuevo_api;
commit;
