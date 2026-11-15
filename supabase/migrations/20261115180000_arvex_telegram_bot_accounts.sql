create table if not exists public.arvex_telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_username text,
  linked_at timestamptz not null default now()
);
create table if not exists public.arvex_telegram_link_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.arvex_telegram_accounts enable row level security;
alter table public.arvex_telegram_link_tokens enable row level security;
revoke all on public.arvex_telegram_accounts, public.arvex_telegram_link_tokens from public, anon, authenticated;
grant all on public.arvex_telegram_accounts, public.arvex_telegram_link_tokens to service_role;