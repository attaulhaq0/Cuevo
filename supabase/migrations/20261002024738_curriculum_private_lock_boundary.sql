begin;
-- This private structural lock is used by migrations/fixtures as well as already
-- authorized domain commands. Actor authorization belongs to the granted purpose
-- wrapper and each domain command, not to raw bootstrap row locking.
create or replace function internal.lock_academic_course(target_school uuid,target_course uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform 1 from app.courses where school_id=target_school and id=target_course for update;
 if exists(select 1 from app.courses where school_id=target_school and id=target_course)and not internal.programme_academic_write_allowed(target_school,target_course)then raise exception 'Retired curriculum source is read only'using errcode='22023';end if;
end$$;
revoke execute on function internal.lock_academic_course(uuid,uuid)from public,anon,authenticated,service_role,cuevo_api,cuevo_worker;
commit;
