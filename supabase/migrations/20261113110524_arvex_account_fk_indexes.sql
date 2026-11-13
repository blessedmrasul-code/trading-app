-- Cover foreign keys and common account-scoped lookups used by ARVEX.
create index if not exists arvex_notifications_user_created_idx
  on public.arvex_notifications(user_id, created_at desc);
create index if not exists arvex_promo_redemptions_user_id_idx
  on public.arvex_promo_redemptions(user_id);
create index if not exists arvex_support_tickets_user_created_idx
  on public.arvex_support_tickets(user_id, created_at desc);
create index if not exists arvex_user_ban_events_admin_id_idx
  on public.arvex_user_ban_events(admin_id);
create index if not exists arvex_user_bans_banned_by_idx
  on public.arvex_user_bans(banned_by);
