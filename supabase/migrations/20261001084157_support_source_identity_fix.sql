begin;
-- The source identifier variable originally shadowed processed_events.source_id in SQL predicates.
-- Replace only the local identifier while preserving applied history and the worker trust boundary.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('internal.process_support_learning_event(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'source_kind text;source_id uuid;','source_kind text;v_support_source_id uuid;');
 definition:=replace(definition,'source_id:=','v_support_source_id:=');
 definition:=replace(definition,'pe.source_id=source_id','pe.source_id=v_support_source_id');
 definition:=replace(definition,'values(e.id,e.school_id,source_kind,source_id)','values(e.id,e.school_id,source_kind,v_support_source_id)');
 execute definition;
end $$;
commit;
