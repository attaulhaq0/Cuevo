begin;
-- Legacy direct reservation callers retain their numeric context shape. New source-
-- controlled prompt callers explicitly receive the frozen school action policy.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.begin_teacher_insight_run(text,text,uuid,jsonb,text)'::regprocedure);
 anchor:='if reservation->>''state''=''NEW''then return jsonb_set(reservation,''{context}'',(reservation->''context'')||jsonb_build_object(''allowedActions''';
 if position(anchor in definition)=0 then raise exception 'Frozen reservation response shape changed'using errcode='22023';end if;
 definition:=replace(definition,anchor,'if reservation->>''state''=''NEW''and settings?''promptDigest''then return jsonb_set(reservation,''{context}'',(reservation->''context'')||jsonb_build_object(''allowedActions''');
 execute definition;
end$$;
commit;
