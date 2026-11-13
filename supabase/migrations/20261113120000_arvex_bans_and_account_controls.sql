-- ARVEX account bans, audit history, and server-enforced access restrictions.
create table if not exists public.arvex_user_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 1000),
  banned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.arvex_user_bans enable row level security;
revoke all on public.arvex_user_bans from public, anon, authenticated;
grant all on public.arvex_user_bans to service_role;

create table if not exists public.arvex_user_ban_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null check (action in ('ban','unban')),
  reason text,
  admin_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.arvex_user_ban_events enable row level security;
revoke all on public.arvex_user_ban_events from public, anon, authenticated;
grant all on public.arvex_user_ban_events to service_role;
create index if not exists arvex_user_ban_events_user_created_idx
  on public.arvex_user_ban_events(user_id, created_at desc);

create or replace function public.arvex_is_banned()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null
     and exists(select 1 from public.arvex_user_bans b where b.user_id = auth.uid());
$$;
revoke all on function public.arvex_is_banned() from public, anon;
grant execute on function public.arvex_is_banned() to authenticated;

create or replace function public.arvex_my_account_status()
returns table(is_banned boolean, reason text, banned_at timestamptz, administrator text, is_admin boolean)
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select (b.user_id is not null), b.reason, b.created_at,
         case when b.user_id is not null then 'Mrasulv' else null end,
         exists(select 1 from public.arvex_admins a where a.user_id = auth.uid())
  from (select auth.uid() as uid) u
  left join public.arvex_user_bans b on b.user_id = u.uid
  where u.uid is not null;
$$;
revoke all on function public.arvex_my_account_status() from public, anon;
grant execute on function public.arvex_my_account_status() to authenticated;

create or replace function public.arvex_admin_list_bans(p_query text default '')
returns table(user_id uuid, email text, reason text, banned_by text, created_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.arvex_admins a where a.user_id=auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  return query
    select b.user_id, u.email::text, b.reason, 'Mrasulv'::text, b.created_at
    from public.arvex_user_bans b
    join auth.users u on u.id=b.user_id
    where coalesce(p_query,'')='' or u.email ilike '%'||left(p_query,120)||'%' or b.user_id::text ilike '%'||left(p_query,120)||'%'
    order by b.created_at desc limit 100;
end;
$$;
revoke all on function public.arvex_admin_list_bans(text) from public, anon;
grant execute on function public.arvex_admin_list_bans(text) to authenticated;

create or replace function public.arvex_admin_record_ban(p_user_id uuid, p_reason text, p_action text)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare v_reason text := left(trim(coalesce(p_reason,'')),1000);
begin
  if auth.uid() is null or not exists(select 1 from public.arvex_admins a where a.user_id=auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id) then
    raise exception 'Пользователь не найден';
  end if;
  if exists(select 1 from public.arvex_admins a where a.user_id=p_user_id) then
    raise exception 'Нельзя блокировать администратора';
  end if;
  if p_action='ban' then
    if char_length(v_reason)<5 then raise exception 'Укажи причину блокировки (минимум 5 символов)'; end if;
    insert into public.arvex_user_bans(user_id,reason,banned_by,created_at)
    values(p_user_id,v_reason,auth.uid(),now())
    on conflict(user_id) do update set reason=excluded.reason,banned_by=excluded.banned_by,created_at=now();
    insert into public.arvex_user_ban_events(user_id,action,reason,admin_id)
    values(p_user_id,'ban',v_reason,auth.uid());
  elsif p_action='unban' then
    delete from public.arvex_user_bans where user_id=p_user_id;
    insert into public.arvex_user_ban_events(user_id,action,reason,admin_id)
    values(p_user_id,'unban',null,auth.uid());
  else
    raise exception 'Недопустимое действие';
  end if;
  return true;
end;
$$;
revoke all on function public.arvex_admin_record_ban(uuid,text,text) from public, anon;
grant execute on function public.arvex_admin_record_ban(uuid,text,text) to authenticated;

-- A banned user must not be able to read or mutate private app data via direct REST calls.
drop policy if exists "users read own save" on public.arvex_saves;
drop policy if exists "users insert own save" on public.arvex_saves;
drop policy if exists "users update own save" on public.arvex_saves;
create policy "users read own save" on public.arvex_saves for select to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()));
create policy "users insert own save" on public.arvex_saves for insert to authenticated
  with check ((select auth.uid())=user_id and not (select public.arvex_is_banned()));
create policy "users update own save" on public.arvex_saves for update to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()))
  with check ((select auth.uid())=user_id and not (select public.arvex_is_banned()));

drop policy if exists "users read own subscription" on public.arvex_subscriptions;
drop policy if exists "Users read own ARVEX subscription" on public.arvex_subscriptions;
create policy "users read own subscription" on public.arvex_subscriptions for select to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()));

drop policy if exists "Users read own notifications" on public.arvex_notifications;
drop policy if exists "Users mark own notifications read" on public.arvex_notifications;
create policy "Users read own notifications" on public.arvex_notifications for select to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()));
create policy "Users mark own notifications read" on public.arvex_notifications for update to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()))
  with check ((select auth.uid())=user_id and not (select public.arvex_is_banned()));

drop policy if exists "Users create own support tickets" on public.arvex_support_tickets;
drop policy if exists "Users read own support tickets" on public.arvex_support_tickets;
create policy "Users create own support tickets" on public.arvex_support_tickets for insert to authenticated
  with check ((select auth.uid())=user_id and not (select public.arvex_is_banned()));
create policy "Users read own support tickets" on public.arvex_support_tickets for select to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()));

drop policy if exists "Users read own Telegram Star payments" on public.telegram_star_payments;
create policy "Users read own Telegram Star payments" on public.telegram_star_payments for select to authenticated
  using ((select auth.uid())=user_id and not (select public.arvex_is_banned()));

-- Promo redemption is an entitlement mutation, so it must also reject banned accounts.
create or replace function public.arvex_redeem_promo(p_code text)
returns timestamptz
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_days integer;
  v_exp timestamptz;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Войди в аккаунт ARVEX'; end if;
  if public.arvex_is_banned() then raise exception 'Аккаунт заблокирован администратором'; end if;
  if char_length(v_code)<4 or char_length(v_code)>32 then raise exception 'Промокод не найден'; end if;
  select days into v_days from public.arvex_promo_codes
   where code=v_code and active=true and (expires_at is null or expires_at>now())
     and redeemed_count<max_redemptions for update;
  if not found then raise exception 'Промокод недействителен или лимит исчерпан'; end if;
  insert into public.arvex_promo_redemptions(code,user_id) values(v_code,v_uid);
  update public.arvex_promo_codes set redeemed_count=redeemed_count+1 where code=v_code;
  insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
  values(v_uid,now(),now()+make_interval(days=>v_days),false,false,now(),null)
  on conflict(user_id) do update set
    expires_at=greatest(now(),coalesce(public.arvex_subscriptions.expires_at,now()))+make_interval(days=>v_days),
    is_forever=false,auto_renew=false,updated_at=now(),updated_by=null
  returning expires_at into v_exp;
  insert into public.arvex_notifications(user_id,title,body,kind)
  values(v_uid,'Промокод активирован','Доступ продлён на '||v_days||' дней.','subscription');
  return v_exp;
exception when unique_violation then
  raise exception 'Этот промокод уже использован в аккаунте';
end;
$$;
revoke all on function public.arvex_redeem_promo(text) from public, anon;
grant execute on function public.arvex_redeem_promo(text) to authenticated;
