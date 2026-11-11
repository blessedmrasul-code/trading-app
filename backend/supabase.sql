-- ARVEX Supabase schema
-- Run once in Supabase SQL Editor.
-- RLS ensures each signed-in user can access only their own save/entitlement.
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
  with check (auth.uid() = user_id);

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

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'lifetime',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

drop policy if exists "Users read own ARVEX entitlement" on public.entitlements;
create policy "Users read own ARVEX entitlement"
  on public.entitlements for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.entitlements to authenticated;

-- Owner grants lifetime access manually after verifying payment:
-- insert into public.entitlements (user_id, plan, expires_at)
-- values ('AUTH_USER_UUID', 'lifetime', null)
-- on conflict (user_id) do update
-- set plan = excluded.plan, expires_at = null, updated_at = now();

-- Owner revokes access:
-- delete from public.entitlements where user_id = 'AUTH_USER_UUID';
