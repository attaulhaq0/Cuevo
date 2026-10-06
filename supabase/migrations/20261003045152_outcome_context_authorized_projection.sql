begin;
-- Project one exact context only after the wrapper's canonical source check.
-- Keep the original authorizing helper for learner-state and every other caller.
alter function internal.outcome_display_context(uuid,uuid)rename to projected_outcome_context;
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.projected_outcome_context(uuid,uuid)'::regprocedure);
 anchor:=' perform internal.intervention_outcome_projection(target_outcome);';
 if position(anchor in definition)=0 then raise exception 'Outcome authorization projection changed'using errcode='22023';end if;
 execute replace(definition,anchor,'');
end$$;
create function internal.outcome_display_context(target_school uuid,target_outcome uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$begin
 if target_school is distinct from"authorization".school_id()then raise exception 'Outcome context denied'using errcode='42501';end if;
 perform internal.intervention_outcome_projection(target_outcome);
 return internal.projected_outcome_context(target_school,target_outcome);
end$$;
create or replace function internal.read_outcome_display(target_outcome uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$declare source jsonb;begin
 source:=internal.intervention_outcome_projection(target_outcome);
 return source||jsonb_build_object('context',internal.projected_outcome_context("authorization".school_id(),target_outcome));
end$$;
revoke execute on function internal.projected_outcome_context(uuid,uuid),internal.outcome_display_context(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
-- Revalidate the unchanged text-call owner after rename so cached plans cannot
-- retain the renamed projection as their former authorizing helper.
do $$begin execute pg_get_functiondef('internal.read_current_learner_projection(uuid)'::regprocedure);end$$;
commit;
