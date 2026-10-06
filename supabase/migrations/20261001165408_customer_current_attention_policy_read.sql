begin;
create function internal.read_current_attention_policy()returns jsonb language plpgsql security definer set search_path=''as $$declare policy app.attention_policies;school uuid:="authorization".school_id();begin
 if not"authorization".has_entitlement(school,'learner.state')or"authorization".current_role(school)not in('admin','coordinator','teacher')then raise exception 'Attention configuration read denied'using errcode='42501';end if;
 select*into policy from app.attention_policies where school_id=school order by version desc limit 1;
 return jsonb_build_object('policy',case when policy.id is null then null else jsonb_build_object('id',policy.id,'version',policy.version,'minimumDecline',policy.minimum_decline,'maxScore',policy.max_score,'missingDueCount',policy.missing_due_count,'windowDays',policy.window_days,'approvedAt',policy.approved_at)end);
end$$;
revoke execute on function internal.read_current_attention_policy()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
grant execute on function internal.read_current_attention_policy()to cuevo_api;
commit;
