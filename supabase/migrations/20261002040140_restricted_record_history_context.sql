begin;
-- Historical follow-up and approval context stays behind the same exact restricted source policy.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('internal.read_restricted_history(uuid,integer,uuid)'::regprocedure);anchor:='''state'',r.state,''reason'',r.reason,''createdAt'',r.created_at)order by r.id)';if position(anchor in definition)=0 then raise exception 'Restricted history projection changed'using errcode='22023';end if;
 execute replace(definition,anchor,'''state'',r.state,''reason'',r.reason,''createdAt'',r.created_at,''actorName'',(select p.display_name from app.people p where p.school_id=r.school_id and p.actor_id=r.actor_id),''policyId'',r.policy_id,''policyVersion'',(select p.version from app.restricted_record_policies p where p.school_id=r.school_id and p.id=r.policy_id),''followUpOwnerName'',(select p.display_name from app.people p where p.school_id=r.school_id and p.actor_id=r.follow_up_owner_id),''followUpInstructions'',r.follow_up_instructions,''followUpNote'',r.follow_up_note)order by r.id)');
end$$;
commit;
