begin;
do $$declare definition text;previous text;begin
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);previous:=definition;
 definition:=replace(definition,'select*into run from app.intelligence_runs where school_id="authorization".school_id()and actor_id="authorization".actor_id()and command_key=begin_teacher_insight_run.command_key;',
 'select ir.*into run from app.intelligence_runs ir where ir.school_id="authorization".school_id()and ir.actor_id="authorization".actor_id()and ir.command_key=begin_teacher_insight_run.command_key;');
 if definition=previous then raise exception 'Insight replay source shape changed'using errcode='22023';end if;execute definition;
end$$;
commit;
