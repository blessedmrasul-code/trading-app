-- ARVEX PREMIUM: ручная выдача доступа владельцем.
-- Выполнить целиком в Supabase SQL Editor после включения Supabase Auth.

create table if not exists public.arvex_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.arvex_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_forever boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.arvex_subscription_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('grant','revoke')),
  plan text not null,
  expires_at timestamptz,
  admin_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.arvex_admins enable row level security;
alter table public.arvex_subscriptions enable row level security;
alter table public.arvex_subscription_events enable row level security;

revoke all on public.arvex_admins, public.arvex_subscriptions, public.arvex_subscription_events from anon, authenticated;
grant select on public.arvex_subscriptions to authenticated;

drop policy if exists "users read own subscription" on public.arvex_subscriptions;
create policy "users read own subscription" on public.arvex_subscriptions
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.arvex_my_premium()
returns table(is_active boolean, is_forever boolean, expires_at timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select
    (s.user_id is not null and (s.is_forever or s.expires_at > now())) as is_active,
    coalesce(s.is_forever,false),
    s.expires_at
  from (select auth.uid() as uid) u
  left join public.arvex_subscriptions s on s.user_id = u.uid
  where u.uid is not null;
$$;

create or replace function public.arvex_admin_is_admin()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists(select 1 from public.arvex_admins a where a.user_id = auth.uid());
$$;

create or replace function public.arvex_admin_search_users(p_query text default '')
returns table(user_id uuid, email text, is_active boolean, is_forever boolean, expires_at timestamptz)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not exists(select 1 from public.arvex_admins where user_id = auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  return query
    select u.id, u.email::text,
      (s.user_id is not null and (s.is_forever or s.expires_at > now())),
      coalesce(s.is_forever,false), s.expires_at
    from auth.users u
    left join public.arvex_subscriptions s on s.user_id = u.id
    where coalesce(p_query,'') = ''
       or u.email ilike '%' || left(p_query,120) || '%'
       or u.id::text ilike '%' || left(p_query,120) || '%'
    order by u.created_at desc
    limit 50;
end;
$$;

create or replace function public.arvex_admin_set_subscription(
  p_user_id uuid, p_days integer default 30, p_forever boolean default false
)
returns timestamptz
language plpgsql security definer set search_path = public, auth
as $$
declare v_exp timestamptz;
begin
  if not exists(select 1 from public.arvex_admins where user_id = auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception 'Пользователь не найден';
  end if;
  if not coalesce(p_forever,false) and p_days not in (30,90,365) then
    raise exception 'Допустимые сроки: 30, 90 или 365 дней';
  end if;
  if p_forever then
    v_exp := null;
  else
    select greatest(now(), coalesce(expires_at, now())) + make_interval(days => p_days)
      into v_exp from public.arvex_subscriptions where user_id = p_user_id;
    if v_exp is null then v_exp := now() + make_interval(days => p_days); end if;
  end if;
  insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,updated_at,updated_by)
  values(p_user_id,now(),v_exp,coalesce(p_forever,false),now(),auth.uid())
  on conflict(user_id) do update set starts_at=now(), expires_at=excluded.expires_at,
    is_forever=excluded.is_forever, updated_at=now(), updated_by=auth.uid();
  insert into public.arvex_subscription_events(user_id,action,plan,expires_at,admin_id)
  values(p_user_id,'grant',case when p_forever then 'forever' else p_days::text || ' days' end,v_exp,auth.uid());
  return v_exp;
end;
$$;

create or replace function public.arvex_admin_revoke_subscription(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not exists(select 1 from public.arvex_admins where user_id = auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  update public.arvex_subscriptions set expires_at=now(), is_forever=false,
    updated_at=now(), updated_by=auth.uid() where user_id=p_user_id;
  insert into public.arvex_subscription_events(user_id,action,plan,expires_at,admin_id)
  values(p_user_id,'revoke','revoked',now(),auth.uid());
  return true;
end;
$$;

revoke all on function public.arvex_my_premium() from public, anon;
revoke all on function public.arvex_admin_is_admin() from public, anon;
revoke all on function public.arvex_admin_search_users(text) from public, anon;
revoke all on function public.arvex_admin_set_subscription(uuid,integer,boolean) from public, anon;
revoke all on function public.arvex_admin_revoke_subscription(uuid) from public, anon;
grant execute on function public.arvex_my_premium() to authenticated;
grant execute on function public.arvex_admin_is_admin() to authenticated;
grant execute on function public.arvex_admin_search_users(text) to authenticated;
grant execute on function public.arvex_admin_set_subscription(uuid,integer,boolean) to authenticated;
grant execute on function public.arvex_admin_revoke_subscription(uuid) to authenticated;

-- После создания аккаунта владельца выполни запрос:
-- select id, email from auth.users order by created_at;
-- Затем подставь UUID своего аккаунта:
-- insert into public.arvex_admins(user_id) values ('ВАШ-UUID') on conflict do nothing;
