-- Support tickets contain private user messages. Do not expose the table to anon.
revoke all on table public.arvex_support_tickets from anon;
grant select, insert on table public.arvex_support_tickets to authenticated;
