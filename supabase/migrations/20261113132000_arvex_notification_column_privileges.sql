-- Users can acknowledge only their own notification; they cannot edit its content or owner.
revoke update on table public.arvex_notifications from authenticated;
grant update (read_at) on table public.arvex_notifications to authenticated;
