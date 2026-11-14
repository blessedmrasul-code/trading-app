create table if not exists public.arvex_premium_academy_content (
  id text primary key check (id = 'creator_academy'),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.arvex_premium_academy_content enable row level security;

revoke all on table public.arvex_premium_academy_content
  from public, anon, authenticated;

grant select on table public.arvex_premium_academy_content to service_role;

drop policy if exists "service role reads premium academy content"
  on public.arvex_premium_academy_content;

create policy "service role reads premium academy content"
  on public.arvex_premium_academy_content
  for select
  to service_role
  using (true);
