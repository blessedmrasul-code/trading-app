-- Switch ARVEX referrals to unique Telegram bot starts: 15 new users = 3 Premium days.
create table if not exists public.arvex_telegram_bot_users (
  telegram_user_id bigint primary key,
  telegram_username text,
  first_seen_at timestamptz not null default now()
);
create table if not exists public.arvex_telegram_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_telegram_user_id bigint not null,
  referred_telegram_user_id bigint not null unique references public.arvex_telegram_bot_users(telegram_user_id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  constraint arvex_telegram_referrals_not_self check (referrer_telegram_user_id <> referred_telegram_user_id)
);
create index if not exists arvex_telegram_referrals_referrer_created_idx on public.arvex_telegram_referrals(referrer_user_id, created_at desc);
create table if not exists public.arvex_telegram_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  milestone integer not null check (milestone > 0),
  reward_days integer not null default 3 check (reward_days = 3),
  created_at timestamptz not null default now(),
  unique(referrer_user_id, milestone)
);
alter table public.arvex_telegram_bot_users enable row level security;
alter table public.arvex_telegram_referrals enable row level security;
alter table public.arvex_telegram_referral_rewards enable row level security;
revoke all on public.arvex_telegram_bot_users, public.arvex_telegram_referrals, public.arvex_telegram_referral_rewards from public, anon, authenticated;
grant all on public.arvex_telegram_bot_users, public.arvex_telegram_referrals, public.arvex_telegram_referral_rewards to service_role;

create or replace function public.arvex_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_code text; v_attempt integer := 0;
begin
  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
    begin
      insert into public.arvex_referral_codes(user_id, code) values(new.id, v_code);
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;
  return new;
end;
$$;

create or replace function public.arvex_qualify_referral(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  return false;
end;
$$;
revoke all on function public.arvex_qualify_referral(uuid) from public, anon, authenticated;
grant execute on function public.arvex_qualify_referral(uuid) to service_role;

insert into public.arvex_telegram_bot_users(telegram_user_id, telegram_username, first_seen_at)
select telegram_user_id, telegram_username, coalesce(linked_at, now())
from public.arvex_telegram_accounts
where telegram_user_id is not null
on conflict (telegram_user_id) do nothing;

create or replace function public.arvex_register_telegram_start(
  p_telegram_user_id bigint,
  p_telegram_username text default null,
  p_referral_code text default null
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  v_new_user boolean := false;
  v_referrer uuid;
  v_referrer_telegram bigint;
  v_referral_id uuid;
  v_total integer := 0;
  v_target_milestone integer := 0;
  v_last_milestone integer := 0;
  v_rows integer := 0;
  v_rewarded integer := 0;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then raise exception 'Invalid Telegram user ID'; end if;
  insert into public.arvex_telegram_bot_users(telegram_user_id, telegram_username)
  values(p_telegram_user_id, nullif(left(coalesce(p_telegram_username,''),64),''))
  on conflict (telegram_user_id) do nothing returning true into v_new_user;

  if not coalesce(v_new_user,false) then
    update public.arvex_telegram_bot_users
      set telegram_username = coalesce(nullif(left(coalesce(p_telegram_username,''),64),''), telegram_username)
      where telegram_user_id = p_telegram_user_id;
    return jsonb_build_object('new_user',false,'referred',false,'total',0,'rewarded_milestones',0);
  end if;
  if coalesce(trim(p_referral_code),'') = '' then
    return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded_milestones',0);
  end if;

  select c.user_id into v_referrer from public.arvex_referral_codes c
    where c.code = upper(trim(p_referral_code)) limit 1;
  if v_referrer is null then return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded_milestones',0); end if;
  select a.telegram_user_id into v_referrer_telegram from public.arvex_telegram_accounts a
    where a.user_id = v_referrer limit 1;
  if v_referrer_telegram is null or v_referrer_telegram = p_telegram_user_id then
    return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded_milestones',0);
  end if;

  insert into public.arvex_telegram_referrals(referrer_user_id,referrer_telegram_user_id,referred_telegram_user_id,referral_code)
  values(v_referrer,v_referrer_telegram,p_telegram_user_id,upper(trim(p_referral_code)))
  on conflict (referred_telegram_user_id) do nothing returning id into v_referral_id;
  if v_referral_id is null then return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded_milestones',0); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_referrer::text, 0));
  select count(*)::integer into v_total from public.arvex_telegram_referrals where referrer_user_id = v_referrer;
  v_target_milestone := floor(v_total / 15.0)::integer;
  select coalesce(max(milestone),0) into v_last_milestone from public.arvex_telegram_referral_rewards where referrer_user_id = v_referrer;

  while v_last_milestone < v_target_milestone loop
    insert into public.arvex_telegram_referral_rewards(referrer_user_id,milestone,reward_days)
    values(v_referrer,v_last_milestone+1,3) on conflict(referrer_user_id,milestone) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
      values(v_referrer,now(),now()+interval '3 days',false,false,now(),null)
      on conflict(user_id) do update set
        expires_at = case when public.arvex_subscriptions.is_forever then null
          else greatest(now(),coalesce(public.arvex_subscriptions.expires_at,now())) + interval '3 days' end,
        updated_at=now(),updated_by=null;
      insert into public.arvex_notifications(user_id,title,body,kind,dedupe_key)
      values(v_referrer,'Реферальный бонус ARVEX','Ты пригласил 15 новых пользователей в Telegram-бота. Начислено 3 дня Premium.','subscription','telegram_referral_reward:'||v_referrer::text||':'||(v_last_milestone+1)::text)
      on conflict do nothing;
      v_rewarded := v_rewarded + 1;
    end if;
    v_last_milestone := v_last_milestone + 1;
  end loop;
  return jsonb_build_object('new_user',true,'referred',true,'total',v_total,'rewarded_milestones',v_rewarded);
end;
$$;
revoke all on function public.arvex_register_telegram_start(bigint,text,text) from public, anon, authenticated;
grant execute on function public.arvex_register_telegram_start(bigint,text,text) to service_role;
