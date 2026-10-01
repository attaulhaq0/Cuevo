begin;
-- Keep only selected stable keys in submission text; the immutable quiz version retains prompts/options.
do $$declare definition text;begin
 definition:=pg_get_functiondef('internal.submit_quiz_attempt(uuid,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,
  'jsonb_build_object(''questionKey'',question->>''key'',''prompt'',question->>''prompt'',''selectedOptionKey'',chosen->>''key'',''selectedOptionLabel'',chosen->>''label'')',
  'jsonb_build_object(''questionKey'',question->>''key'',''selectedOptionKey'',chosen->>''key'')');
 execute definition;
end$$;
commit;
