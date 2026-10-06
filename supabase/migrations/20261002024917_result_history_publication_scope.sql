begin;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_academic_revision_page(uuid,integer,uuid)'::regprocedure);
 anchor:='"authorization".can_read_academic_source(school,anchor.learner_id,internal.result_parent_published(school,source_result),anchor.assessment_id)';
 if position(anchor in definition)=0 then raise exception 'History publication anchor changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,' internal.result_source_read_allowed(school,source_result) ');
 anchor:='"authorization".can_read_academic_source(school,source.learner_id,internal.result_parent_published(school,source.id),source.assessment_id)';
 if position(anchor in definition)=0 then raise exception 'History publication row scope changed'using errcode='22023';end if;
 execute replace(definition,anchor,' internal.result_source_read_allowed(school,source.id) ');
end$$;
commit;
