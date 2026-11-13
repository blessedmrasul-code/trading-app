-- Keep notification records private and allow signed-in users to read/mark only their own rows.
-- Row-level security policies remain the per-user boundary; table grants are narrowed here.
revoke all on table public.arvex_notifications from public, anon, authenticated;
grant select, update on table public.arvex_notifications to authenticated;
grant all on table public.arvex_notifications to service_role;
