-- ARVEX Supabase schema
-- Run once in Supabase SQL Editor.
-- RLS ensures each signed-in user can read only their own save and subscription; payment tables are server-only.
-- Public order submission is allowed; public reads are intentionally forbidden.

create extension if not exists pgcrypto;

create table if not exists public.arvex_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.arvex_saves enable row level security;

drop policy if exists "Users read own ARVEX save" on public.arvex_saves;
create policy "Users read own ARVEX save"
  on public.arvex_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own ARVEX save" on public.arvex_saves;
create policy "Users insert own ARVEX save"
  on public.arvex_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own ARVEX save" on public.arvex_saves;
create policy "Users update own ARVEX save"
  on public.arvex_saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.arvex_saves to authenticated;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tg text not null check (tg ~ '^[A-Za-z0-9_]{5,32}$'),
  device text not null check (char_length(device) between 2 and 60),
  email text,
  price numeric(10,2) not null check (price >= 0),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

drop policy if exists "Anyone can submit an ARVEX order" on public.orders;
create policy "Anyone can submit an ARVEX order"
  on public.orders for insert
  to anon, authenticated
  with check (
    (user_id is null or user_id = (select auth.uid()))
    and char_length(device) between 2 and 60
    and tg ~ '^[A-Za-z0-9_]{5,32}$'
    and price >= 0
  );

grant insert on public.orders to anon, authenticated;

create table if not exists public.arvex_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.arvex_admins enable row level security;
revoke all on public.arvex_admins from anon, authenticated;
grant all on public.arvex_admins to service_role;

create table if not exists public.arvex_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_forever boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  auto_renew boolean not null default false
);

alter table public.arvex_subscriptions
  add column if not exists auto_renew boolean not null default false;
alter table public.arvex_subscriptions enable row level security;

drop policy if exists "Users read own ARVEX subscription" on public.arvex_subscriptions;
drop policy if exists "users read own subscription" on public.arvex_subscriptions;
create policy "Users read own ARVEX subscription"
  on public.arvex_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.arvex_subscriptions to authenticated;
grant all on public.arvex_subscriptions to service_role;

-- Owner receives lifetime access after ARVEX_OWNER_USER_ID is set as an Edge Function secret.
-- Manual owner grant, if needed:
-- insert into public.arvex_subscriptions (user_id, starts_at, expires_at, is_forever, auto_renew)
-- values ('AUTH_USER_UUID', now(), null, true, false)
-- on conflict (user_id) do update
-- set starts_at = now(), expires_at = null, is_forever = true, auto_renew = false, updated_at = now();

-- Revoke a user's Premium access:
-- update public.arvex_subscriptions
-- set expires_at = now(), is_forever = false, auto_renew = false, updated_at = now()
-- where user_id = 'AUTH_USER_UUID';

-- Telegram Stars subscription intents and verified payment receipts.
-- These tables are server-only: no anon/authenticated policies or grants.
create table if not exists public.telegram_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_payload text not null unique,
  stars_amount integer not null check (stars_amount between 1 and 10000),
  currency text not null default 'XTR' check (currency = 'XTR'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  telegram_user_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_payment_intents enable row level security;
revoke all on public.telegram_payment_intents from anon, authenticated;
grant all on public.telegram_payment_intents to service_role;

create table if not exists public.telegram_star_payments (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.telegram_payment_intents(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_user_id bigint,
  telegram_payment_charge_id text not null unique,
  stars_amount integer not null check (stars_amount between 1 and 10000),
  currency text not null default 'XTR' check (currency = 'XTR'),
  is_recurring boolean not null default false,
  is_first_recurring boolean not null default false,
  expires_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_star_payments add column if not exists refunded_at timestamptz;
alter table public.telegram_star_payments enable row level security;
revoke all on public.telegram_star_payments from anon, authenticated;
grant all on public.telegram_star_payments to service_role;

create index if not exists telegram_payment_intents_user_created_idx
  on public.telegram_payment_intents (user_id, created_at desc);
create index if not exists telegram_star_payments_user_created_idx
  on public.telegram_star_payments (user_id, created_at desc);
create index if not exists telegram_star_payments_intent_id_idx
  on public.telegram_star_payments (intent_id);

-- Edge Functions use the server-only service role key to write these records.


-- ARVEX user features v1: private payment history, support, notifications and promo redemption.
drop policy if exists "Users read own Telegram Star payments" on public.telegram_star_payments;
create policy "Users read own Telegram Star payments"
  on public.telegram_star_payments for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.telegram_star_payments to authenticated;

create table if not exists public.arvex_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 120),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.arvex_support_tickets enable row level security;
drop policy if exists "Users create own support tickets" on public.arvex_support_tickets;
create policy "Users create own support tickets" on public.arvex_support_tickets
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users read own support tickets" on public.arvex_support_tickets;
create policy "Users read own support tickets" on public.arvex_support_tickets
  for select to authenticated using ((select auth.uid()) = user_id);
grant select, insert on public.arvex_support_tickets to authenticated;

create table if not exists public.arvex_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1000),
  kind text not null default 'info' check (kind in ('info','subscription','payment','support')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.arvex_notifications enable row level security;
drop policy if exists "Users read own notifications" on public.arvex_notifications;
create policy "Users read own notifications" on public.arvex_notifications
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users mark own notifications read" on public.arvex_notifications;
create policy "Users mark own notifications read" on public.arvex_notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select on public.arvex_notifications to authenticated;
revoke update on public.arvex_notifications from authenticated;
grant update (read_at) on public.arvex_notifications to authenticated;

create table if not exists public.arvex_promo_codes (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9_-]{4,32}$'),
  days integer not null check (days in (7,30,90,365)),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.arvex_promo_codes enable row level security;
revoke all on public.arvex_promo_codes from anon, authenticated;
grant all on public.arvex_promo_codes to service_role;

create table if not exists public.arvex_promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.arvex_promo_codes(code),
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(code,user_id)
);
alter table public.arvex_promo_redemptions enable row level security;
revoke all on public.arvex_promo_redemptions from anon, authenticated;
grant all on public.arvex_promo_redemptions to service_role;

create or replace function public.arvex_redeem_promo(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code text := upper(trim(coalesce(p_code,'')));
  v_days integer;
  v_exp timestamptz;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Войди в аккаунт ARVEX'; end if;
  if char_length(v_code) < 4 or char_length(v_code) > 32 then raise exception 'Промокод не найден'; end if;
  select days into v_days from public.arvex_promo_codes
   where code = v_code and active = true
     and (expires_at is null or expires_at > now())
     and redeemed_count < max_redemptions
   for update;
  if not found then raise exception 'Промокод недействителен или лимит исчерпан'; end if;
  insert into public.arvex_promo_redemptions(code,user_id) values(v_code,v_uid);
  update public.arvex_promo_codes set redeemed_count = redeemed_count + 1 where code = v_code;
  insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
  values(v_uid,now(),now() + make_interval(days => v_days),false,false,now(),null)
  on conflict(user_id) do update set
    expires_at = greatest(now(), coalesce(public.arvex_subscriptions.expires_at,now())) + make_interval(days => v_days),
    is_forever = false, auto_renew = false, updated_at = now(), updated_by = null
  returning expires_at into v_exp;
  insert into public.arvex_notifications(user_id,title,body,kind)
  values(v_uid,'Промокод активирован','Доступ продлён на ' || v_days || ' дней.','subscription');
  return v_exp;
exception when unique_violation then
  raise exception 'Этот промокод уже использован в аккаунте';
end;
$$;
revoke all on function public.arvex_redeem_promo(text) from public, anon;
grant execute on function public.arvex_redeem_promo(text) to authenticated;


-- ARVEX subscription expiry reminders: deduplicated in-app notifications.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

alter table public.arvex_notifications
  add column if not exists dedupe_key text;

create unique index if not exists arvex_notifications_dedupe_key_uidx
  on public.arvex_notifications(dedupe_key)
  where dedupe_key is not null;

create or replace function public.arvex_create_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_count integer := 0;
begin
  with due as (
    select s.user_id, s.expires_at,
      case
        when s.expires_at::date = (now() at time zone 'UTC')::date + 3 then 3
        when s.expires_at::date = (now() at time zone 'UTC')::date + 1 then 1
      end as days_left
    from public.arvex_subscriptions s
    where coalesce(s.is_forever, false) = false
      and s.expires_at is not null
      and s.expires_at > now()
      and s.expires_at::date in (
        (now() at time zone 'UTC')::date + 3,
        (now() at time zone 'UTC')::date + 1
      )
  ),
  added as (
    insert into public.arvex_notifications
      (user_id, title, body, kind, dedupe_key)
    select
      d.user_id,
      'Подписка скоро закончится',
      case when d.days_left = 3
        then 'До окончания подписки осталось 3 дня. Продли её заранее, чтобы не потерять доступ.'
        else 'До окончания подписки остался 1 день. Продли её, чтобы сохранить доступ.'
      end,
      'subscription_expiry',
      'subscription-expiry:' || d.user_id::text || ':' || d.days_left::text || ':' || d.expires_at::date::text
    from due d
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into inserted_count from added;

  return inserted_count;
end;
$$;

revoke all on function public.arvex_create_expiry_notifications() from public, anon, authenticated;
grant execute on function public.arvex_create_expiry_notifications() to postgres;

select cron.schedule(
  'arvex-subscription-expiry-notifications',
  '0 9 * * *',
  'select public.arvex_create_expiry_notifications();'
);


-- ARVEX support inbox: admin-only listing and status updates.
create or replace function public.arvex_admin_list_support_tickets(p_limit integer default 50)
returns table(ticket_id uuid,user_email text,subject text,message text,status text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.arvex_admins a where a.user_id = auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  return query
    select t.id,u.email::text,t.subject,t.message,t.status,t.created_at
    from public.arvex_support_tickets t
    join auth.users u on u.id=t.user_id
    order by t.created_at desc
    limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

create or replace function public.arvex_admin_set_support_status(p_ticket_id uuid,p_status text)
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
  if auth.uid() is null or not exists(select 1 from public.arvex_admins a where a.user_id=auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  if p_status is null or p_status not in ('open','in_progress','closed') then
    raise exception 'Недопустимый статус обращения';
  end if;
  update public.arvex_support_tickets
     set status=p_status,updated_at=now()
   where id=p_ticket_id
   returning user_id,subject into v_user_id,v_subject;
  if not found then raise exception 'Обращение не найдено'; end if;
  v_label:=case p_status when 'open' then 'открыто' when 'in_progress' then 'в работе' else 'закрыто' end;
  insert into public.arvex_notifications(user_id,title,body,kind)
  values(v_user_id,'Обновлён статус обращения','Обращение «'||left(v_subject,100)||'» теперь '||v_label||'.','support');
  return true;
end;
$$;

revoke all on function public.arvex_admin_list_support_tickets(integer) from public,anon;
grant execute on function public.arvex_admin_list_support_tickets(integer) to authenticated;
revoke all on function public.arvex_admin_set_support_status(uuid,text) from public,anon;
grant execute on function public.arvex_admin_set_support_status(uuid,text) to authenticated;

-- Existing admin management RPCs and their permissions are maintained by the migration history.


-- Support tickets contain private user messages. Do not expose the table to anon.
revoke all on table public.arvex_support_tickets from anon;
grant select, insert on table public.arvex_support_tickets to authenticated;
