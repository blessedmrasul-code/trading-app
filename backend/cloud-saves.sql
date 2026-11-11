-- ARVEX Cloud save storage: each signed-in user can access only their own row.
create table if not exists public.arvex_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.arvex_saves enable row level security;
revoke all on public.arvex_saves from anon, authenticated;
grant select, insert, update on public.arvex_saves to authenticated;
drop policy if exists "users read own save" on public.arvex_saves;
drop policy if exists "users insert own save" on public.arvex_saves;
drop policy if exists "users update own save" on public.arvex_saves;
create policy "users read own save" on public.arvex_saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own save" on public.arvex_saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own save" on public.arvex_saves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
