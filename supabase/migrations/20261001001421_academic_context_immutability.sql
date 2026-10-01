begin;
create function internal.reference_approved_immutable()returns trigger language plpgsql set search_path='' as $$begin if old.status='APPROVED'then raise exception 'Approved reference is immutable'using errcode='55000';end if;return new;end$$;
create trigger approved_reference_immutable before update or delete on app.school_custom_references for each row execute function internal.reference_approved_immutable();
create trigger reference_no_truncate before truncate on app.school_custom_references for each statement execute function internal.academic_history_immutable();
create function internal.assessment_context_immutable()returns trigger language plpgsql set search_path='' as $$begin if(new.max_score is distinct from old.max_score or new.model is distinct from old.model or new.academic_reference_id is distinct from old.academic_reference_id or new.policy_version is distinct from old.policy_version)and exists(select 1 from app.marking_revisions m join app.submissions s on s.school_id=m.school_id and s.id=m.submission_id where s.school_id=old.school_id and s.assessment_id=old.id)then raise exception 'Used assessment context is immutable'using errcode='55000';end if;return new;end$$;
create trigger assessment_context_immutable before update on app.assessments for each row execute function internal.assessment_context_immutable();
revoke execute on function internal.reference_approved_immutable(),internal.assessment_context_immutable()from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
