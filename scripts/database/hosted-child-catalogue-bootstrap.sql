-- Source-only prerequisites for the finite child144 scratch catalogue.
-- Run only inside the new owned pinned disposable engine as supabase_admin.
-- Full service schema-only dumps are restored after this fixed prelude; application SQL follows
-- as postgres with check_function_bodies=on. Exact123 parity must then pass.
drop schema if exists auth, storage, realtime cascade;
create role supabase_realtime_admin noinherit nologin;
alter role supabase_realtime_admin set search_path to public, extensions, realtime;
grant anon, authenticated, service_role to supabase_realtime_admin with inherit false, set true;
create role supabase_functions_admin noinherit createrole login;
alter role supabase_functions_admin set search_path to supabase_functions;
grant supabase_functions_admin to postgres with inherit true, set true;
