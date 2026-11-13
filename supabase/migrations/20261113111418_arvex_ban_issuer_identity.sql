-- Show the actual administrator who issued an account ban in the user lock screen and creator audit.
create or replace function public.arvex_my_account_status()
returns table(is_banned boolean, reason text, banned_at timestamptz, administrator text, is_admin boolean)
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select (b.user_id is not null), b.reason, b.created_at,
         case when b.user_id is not null then
           coalesce(nullif(u.raw_user_meta_data->>'name',''),
                    nullif(u.raw_user_meta_data->>'full_name',''),
                    u.email::text, 'Mrasulv')
         else null end,
         exists(select 1 from public.arvex_admins a where a.user_id = auth.uid())
  from (select auth.uid() as uid) actor
  left join public.arvex_user_bans b on b.user_id = actor.uid
  left join auth.users u on u.id = b.banned_by
  where actor.uid is not null;
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
    select b.user_id, u.email::text, b.reason,
           coalesce(nullif(admin_user.raw_user_meta_data->>'name',''),
                    nullif(admin_user.raw_user_meta_data->>'full_name',''),
                    admin_user.email::text, 'Mrasulv'),
           b.created_at
    from public.arvex_user_bans b
    join auth.users u on u.id=b.user_id
    left join auth.users admin_user on admin_user.id=b.banned_by
    where coalesce(p_query,'')='' or u.email ilike '%'||left(p_query,120)||'%' or b.user_id::text ilike '%'||left(p_query,120)||'%'
    order by b.created_at desc limit 100;
end;
$$;
revoke all on function public.arvex_admin_list_bans(text) from public, anon;
grant execute on function public.arvex_admin_list_bans(text) to authenticated;

create or replace function public.arvex_admin_ban_history(p_limit integer default 50)
returns table(user_id uuid, email text, action text, reason text, administrator text, created_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.arvex_admins a where a.user_id=auth.uid()) then
    raise exception 'Доступ запрещён';
  end if;
  return query
    select e.user_id, coalesce(u.email::text,'удалённый аккаунт'), e.action, e.reason,
           coalesce(nullif(admin_user.raw_user_meta_data->>'name',''),
                    nullif(admin_user.raw_user_meta_data->>'full_name',''),
                    admin_user.email::text, 'Mrasulv'),
           e.created_at
    from public.arvex_user_ban_events e
    left join auth.users u on u.id=e.user_id
    left join auth.users admin_user on admin_user.id=e.admin_id
    order by e.created_at desc
    limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;
revoke all on function public.arvex_admin_ban_history(integer) from public, anon;
grant execute on function public.arvex_admin_ban_history(integer) to authenticated;
