-- ARVEX support inbox and least-privilege admin RPC access.
-- Applied to Supabase project bpjtntrjoxmuzgotorpi as migration
-- 20261112135134_arvex_support_admin_inbox_and_rpc_access.

create or replace function public.arvex_admin_list_support_tickets(p_limit integer default 50)
returns table(
  ticket_id uuid,
  user_email text,
  subject text,
  message text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.arvex_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'Доступ запрещён';
  end if;

  return query
    select t.id, u.email::text, t.subject, t.message, t.status, t.created_at
    from public.arvex_support_tickets t
    join auth.users u on u.id = t.user_id
    order by t.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.arvex_admin_set_support_status(p_ticket_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_subject text;
  v_label text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.arvex_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'Доступ запрещён';
  end if;

  if p_status not in ('open', 'in_progress', 'closed') then
    raise exception 'Недопустимый статус обращения';
  end if;

  update public.arvex_support_tickets
     set status = p_status, updated_at = now()
   where id = p_ticket_id
   returning user_id, subject into v_user_id, v_subject;

  if not found then
    raise exception 'Обращение не найдено';
  end if;

  v_label := case p_status
    when 'open' then 'открыто'
    when 'in_progress' then 'в работе'
    else 'закрыто'
  end;

  insert into public.arvex_notifications(user_id, title, body, kind)
  values(
    v_user_id,
    'Обновлён статус обращения',
    'Обращение «' || left(v_subject, 100) || '» теперь ' || v_label || '.',
    'support'
  );

  return true;
end;
$$;

revoke all on function public.arvex_admin_list_support_tickets(integer) from public, anon;
grant execute on function public.arvex_admin_list_support_tickets(integer) to authenticated;
revoke all on function public.arvex_admin_set_support_status(uuid, text) from public, anon;
grant execute on function public.arvex_admin_set_support_status(uuid, text) to authenticated;

revoke all on function public.arvex_admin_is_admin() from public, anon;
grant execute on function public.arvex_admin_is_admin() to authenticated;
revoke all on function public.arvex_admin_create_promo(text, integer, integer, timestamptz) from public, anon;
grant execute on function public.arvex_admin_create_promo(text, integer, integer, timestamptz) to authenticated;
revoke all on function public.arvex_admin_list_promos() from public, anon;
grant execute on function public.arvex_admin_list_promos() to authenticated;
revoke all on function public.arvex_admin_stats() from public, anon;
grant execute on function public.arvex_admin_stats() to authenticated;
revoke all on function public.arvex_admin_history(integer) from public, anon;
grant execute on function public.arvex_admin_history(integer) to authenticated;
revoke all on function public.arvex_admin_search_users(text) from public, anon;
grant execute on function public.arvex_admin_search_users(text) to authenticated;
revoke all on function public.arvex_admin_set_subscription(uuid, integer, boolean) from public, anon;
grant execute on function public.arvex_admin_set_subscription(uuid, integer, boolean) to authenticated;
revoke all on function public.arvex_admin_revoke_subscription(uuid) from public, anon;
grant execute on function public.arvex_admin_revoke_subscription(uuid) to authenticated;

create or replace function public.arvex_admin_create_promo(
  p_code text,
  p_days integer,
  p_max_redemptions integer default 1,
  p_expires_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null or not exists (
    select 1 from public.arvex_admins where user_id = auth.uid()
  ) then
    raise exception 'Доступ запрещён';
  end if;

  if v_code !~ '^[A-Z0-9_-]{4,32}$' then
    raise exception 'Код: 4–32 символа A-Z, 0-9, _ или -';
  end if;
  if p_days not in (7, 30, 90, 365) then
    raise exception 'Недопустимый срок';
  end if;
  if p_max_redemptions is null or p_max_redemptions < 1 or p_max_redemptions > 10000 then
    raise exception 'Недопустимый лимит';
  end if;

  insert into public.arvex_promo_codes(code, days, max_redemptions, redeemed_count, active, expires_at)
  values(v_code, p_days, p_max_redemptions, 0, true, p_expires_at);

  return true;
end;
$$;
revoke all on function public.arvex_admin_create_promo(text, integer, integer, timestamptz) from public, anon;
grant execute on function public.arvex_admin_create_promo(text, integer, integer, timestamptz) to authenticated;
