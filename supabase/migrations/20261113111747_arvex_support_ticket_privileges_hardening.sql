-- Support requests are created/read by their owner; all moderation is through admin-only RPCs.
-- Do not grant end users UPDATE/DELETE/TRUNCATE or schema-changing table privileges.
revoke all on table public.arvex_support_tickets from public, anon, authenticated;
grant select, insert on table public.arvex_support_tickets to authenticated;
grant all on table public.arvex_support_tickets to service_role;
