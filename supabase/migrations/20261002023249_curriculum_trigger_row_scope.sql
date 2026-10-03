begin;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.curriculum_configuration_guard()'::regprocedure);
 anchor:='if tg_table_name=''programme_learners''and new.status=''revoked''then return new;end if;';
 if position(anchor in definition)=0 then raise exception 'Curriculum row guard source changed'using errcode='22023';end if;
 execute replace(definition,anchor,'if tg_table_name=''programme_learners''then if new.status=''revoked''then return new;end if;end if;');
end$$;
commit;
