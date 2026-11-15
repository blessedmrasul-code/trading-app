
-- ARVEX Growth Engine: daily missions, verified referral points, tiers and monthly awards.
create table if not exists public.arvex_growth_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points bigint not null default 0 check (points >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.arvex_daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  checkin_claimed_at timestamptz,
  checkin_points integer not null default 0 check (checkin_points in (0,10)),
  quiz_answer smallint,
  quiz_claimed_at timestamptz,
  quiz_points integer not null default 0 check (quiz_points in (0,20)),
  primary key (user_id, activity_date)
);
create table if not exists public.arvex_monthly_referral_awards (
  month_start date primary key,
  winner_user_id uuid references auth.users(id) on delete set null,
  referral_count integer not null default 0 check (referral_count >= 0),
  reward_days integer not null default 10 check (reward_days = 10),
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (date_trunc('month', month_start)::date = month_start)
);
alter table public.arvex_growth_points enable row level security;
alter table public.arvex_daily_activity enable row level security;
alter table public.arvex_monthly_referral_awards enable row level security;
revoke all on public.arvex_growth_points, public.arvex_daily_activity, public.arvex_monthly_referral_awards from public, anon, authenticated;
grant all on public.arvex_growth_points, public.arvex_daily_activity, public.arvex_monthly_referral_awards to service_role;

create or replace function public.arvex_daily_quiz_payload(p_day date default current_date)
returns jsonb language plpgsql immutable security definer set search_path = pg_catalog, public as $$
declare v_id integer := ((extract(doy from p_day)::integer - 1) % 5) + 1;
begin
  case v_id
    when 1 then return jsonb_build_object('id',v_id,'question','Для чего нужен Stop-Loss?','options',jsonb_build_array('Чтобы ограничить возможный убыток','Чтобы гарантировать прибыль','Чтобы увеличить кредитное плечо'));
    when 2 then return jsonb_build_object('id',v_id,'question','Что означает диверсификация?','options',jsonb_build_array('Покупать только один актив','Распределять риск между разными активами','Всегда торговать с максимальным плечом'));
    when 3 then return jsonb_build_object('id',v_id,'question','Как разумнее подходить к риску в одной сделке?','options',jsonb_build_array('Заранее ограничить риск небольшой долей капитала','Рисковать всем балансом','Увеличивать ставку после каждого убытка'));
    when 4 then return jsonb_build_object('id',v_id,'question','Что показывает RSI?','options',jsonb_build_array('Точную будущую цену','Индикатор импульса и относительной силы движения','Гарантированную точку входа'));
    else return jsonb_build_object('id',v_id,'question','Что обычно называют уровнем поддержки?','options',jsonb_build_array('Уровень, где спрос может сдерживать падение цены','Комиссию за сделку','Гарантию роста цены'));
  end case;
end;
$$;
revoke all on function public.arvex_daily_quiz_payload(date) from public, anon, authenticated;
grant execute on function public.arvex_daily_quiz_payload(date) to service_role;

create or replace function public.arvex_claim_daily_checkin(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_rows integer := 0; v_points bigint := 0;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  insert into public.arvex_daily_activity(user_id,activity_date) values(p_user_id,current_date)
  on conflict(user_id,activity_date) do nothing;
  update public.arvex_daily_activity set checkin_claimed_at=now(),checkin_points=10
    where user_id=p_user_id and activity_date=current_date and checkin_claimed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.arvex_growth_points(user_id,points) values(p_user_id,10)
    on conflict(user_id) do update set points=public.arvex_growth_points.points+10,updated_at=now();
  end if;
  select points into v_points from public.arvex_growth_points where user_id=p_user_id;
  return jsonb_build_object('claimed',v_rows>0,'points',coalesce(v_points,0),'reward_points',case when v_rows>0 then 10 else 0 end);
end;
$$;
revoke all on function public.arvex_claim_daily_checkin(uuid) from public, anon, authenticated;
grant execute on function public.arvex_claim_daily_checkin(uuid) to service_role;

create or replace function public.arvex_submit_daily_quiz(p_user_id uuid,p_answer integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_id integer := ((extract(doy from current_date)::integer - 1) % 5) + 1;
  v_correct integer; v_rows integer := 0; v_points bigint := 0;
begin
  if p_user_id is null or p_answer not between 1 and 3 then raise exception 'Invalid answer'; end if;
  v_correct := case v_id when 1 then 1 when 2 then 2 when 3 then 1 when 4 then 2 else 1 end;
  if p_answer <> v_correct then
    select points into v_points from public.arvex_growth_points where user_id=p_user_id;
    return jsonb_build_object('correct',false,'claimed',false,'points',coalesce(v_points,0),'message','Ответ неверный. Попробуй ещё раз.');
  end if;
  insert into public.arvex_daily_activity(user_id,activity_date) values(p_user_id,current_date)
  on conflict(user_id,activity_date) do nothing;
  update public.arvex_daily_activity set quiz_answer=p_answer,quiz_claimed_at=now(),quiz_points=20
    where user_id=p_user_id and activity_date=current_date and quiz_claimed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.arvex_growth_points(user_id,points) values(p_user_id,20)
    on conflict(user_id) do update set points=public.arvex_growth_points.points+20,updated_at=now();
  end if;
  select points into v_points from public.arvex_growth_points where user_id=p_user_id;
  return jsonb_build_object('correct',true,'claimed',v_rows>0,'points',coalesce(v_points,0),'reward_points',case when v_rows>0 then 20 else 0 end,'message',case when v_rows>0 then 'Верно! Начислено 20 очков.' else 'Задание уже выполнено сегодня.' end);
end;
$$;
revoke all on function public.arvex_submit_daily_quiz(uuid,integer) from public, anon, authenticated;
grant execute on function public.arvex_submit_daily_quiz(uuid,integer) to service_role;

create or replace function public.arvex_finalize_referral_month(p_month_start date)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_winner uuid; v_count integer := 0; v_inserted date;
begin
  if p_month_start is null or date_trunc('month',p_month_start)::date <> p_month_start
     or p_month_start >= date_trunc('month',current_date)::date then
    raise exception 'Only a completed calendar month can be finalized';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('arvex-referral-month:'||p_month_start::text,0));
  select referrer_user_id,count(*)::integer into v_winner,v_count
    from public.arvex_telegram_referrals
    where created_at >= p_month_start::timestamptz
      and created_at < (p_month_start + interval '1 month')::timestamptz
    group by referrer_user_id
    order by count(*) desc,min(created_at) asc,referrer_user_id asc
    limit 1;
  insert into public.arvex_monthly_referral_awards(month_start,winner_user_id,referral_count,reward_days,awarded_at)
  values(p_month_start,v_winner,coalesce(v_count,0),10,case when v_winner is null then null else now() end)
  on conflict(month_start) do nothing returning month_start into v_inserted;
  if v_inserted is not null and v_winner is not null then
    insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
    values(v_winner,now(),now()+interval '10 days',false,false,now(),null)
    on conflict(user_id) do update set
      expires_at=case when public.arvex_subscriptions.is_forever then null
        else greatest(now(),coalesce(public.arvex_subscriptions.expires_at,now()))+interval '10 days' end,
      updated_at=now(),updated_by=null;
    insert into public.arvex_notifications(user_id,title,body,kind,dedupe_key)
    values(v_winner,'Победа в рейтинге ARVEX','Ты занял первое место в реферальном рейтинге за '||to_char(p_month_start,'MM.YYYY')||'. Начислено 10 дней Premium.','subscription','monthly_referral_winner:'||to_char(p_month_start,'YYYY-MM'))
    on conflict do nothing;
  end if;
  return jsonb_build_object('month',p_month_start,'winner_user_id',v_winner,'referrals',coalesce(v_count,0),'awarded',v_inserted is not null and v_winner is not null);
end;
$$;
revoke all on function public.arvex_finalize_referral_month(date) from public, anon, authenticated;
grant execute on function public.arvex_finalize_referral_month(date) to service_role;

create or replace function public.arvex_growth_dashboard(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_month date := date_trunc('month',current_date)::date;
  v_prev date := (date_trunc('month',current_date)-interval '1 month')::date;
  v_total integer := 0; v_month_total integer := 0; v_points bigint := 0;
  v_rank bigint; v_tier text; v_next integer; v_checkin boolean := false; v_quiz boolean := false;
  v_board jsonb := '[]'::jsonb; v_quiz_payload jsonb; v_last_award jsonb := null;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  select count(*)::integer into v_total from public.arvex_telegram_referrals where referrer_user_id=p_user_id;
  select count(*)::integer into v_month_total from public.arvex_telegram_referrals where referrer_user_id=p_user_id and created_at>=v_month::timestamptz and created_at<(v_month+interval '1 month')::timestamptz;
  select points into v_points from public.arvex_growth_points where user_id=p_user_id;
  select (checkin_claimed_at is not null),(quiz_claimed_at is not null)
    into v_checkin,v_quiz from public.arvex_daily_activity where user_id=p_user_id and activity_date=current_date;
  v_checkin := coalesce(v_checkin,false); v_quiz := coalesce(v_quiz,false);
  v_tier := case when v_total>=100 then 'Elite' when v_total>=60 then 'VIP' when v_total>=30 then 'Gold' when v_total>=15 then 'Silver' when v_total>=5 then 'Bronze' else 'Rookie' end;
  v_next := case when v_total<5 then 5 when v_total<15 then 15 when v_total<30 then 30 when v_total<60 then 60 when v_total<100 then 100 else 100 end;
  with totals as (
    select r.referrer_user_id,count(*)::integer invited,min(r.created_at) first_invite,
      max(b.telegram_username) telegram_username
    from public.arvex_telegram_referrals r
    left join public.arvex_telegram_bot_users b on b.telegram_user_id=r.referrer_telegram_user_id
    where r.created_at>=v_month::timestamptz and r.created_at<(v_month+interval '1 month')::timestamptz
    group by r.referrer_user_id
  ), ranked as (
    select row_number() over(order by invited desc,first_invite asc,referrer_user_id asc) rank,
      referrer_user_id,invited,first_invite,
      coalesce(nullif('@'||telegram_username,'@'),'Участник •'||right(referrer_user_id::text,4)) display_name
    from totals
  )
  select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'name',display_name,'invited',invited) order by rank),'[]'::jsonb)
    into v_board from (select * from ranked order by rank limit 10) top_rows;
  with totals as (
    select r.referrer_user_id,count(*)::integer invited,min(r.created_at) first_invite
    from public.arvex_telegram_referrals r
    where r.created_at>=v_month::timestamptz and r.created_at<(v_month+interval '1 month')::timestamptz
    group by r.referrer_user_id
  ), ranked as (
    select row_number() over(order by invited desc,first_invite asc,referrer_user_id asc) rank,referrer_user_id
    from totals
  )
  select rank into v_rank from ranked where referrer_user_id=p_user_id;
  v_quiz_payload := public.arvex_daily_quiz_payload(current_date);
  select jsonb_build_object('month',month_start,'referrals',referral_count,'reward_days',reward_days)
    into v_last_award from public.arvex_monthly_referral_awards where month_start=v_prev and winner_user_id=p_user_id;
  return jsonb_build_object(
    'total_referrals',v_total,'month_referrals',v_month_total,'rank',v_rank,
    'points',coalesce(v_points,0),'tier',v_tier,'next_tier_at',v_next,
    'checkin_done',v_checkin,'quiz_done',v_quiz,
    'quiz',v_quiz_payload,'leaderboard',v_board,'monthly_award',v_last_award,
    'referral_reward_claimed',exists(select 1 from public.arvex_telegram_referral_rewards where referrer_user_id=p_user_id),
    'referral_reward_progress',case when exists(select 1 from public.arvex_telegram_referral_rewards where referrer_user_id=p_user_id) then 15 else least(v_total,15) end,
    'referral_bonus_days',(select coalesce(sum(reward_days),0) from public.arvex_telegram_referral_rewards where referrer_user_id=p_user_id)
  );
end;
$$;
revoke all on function public.arvex_growth_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.arvex_growth_dashboard(uuid) to service_role;

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
  v_rows integer := 0;
  v_rewarded boolean := false;
begin
  if p_telegram_user_id is null or p_telegram_user_id <= 0 then raise exception 'Invalid Telegram user ID'; end if;
  insert into public.arvex_telegram_bot_users(telegram_user_id,telegram_username)
  values(p_telegram_user_id,nullif(left(coalesce(p_telegram_username,''),64),''))
  on conflict(telegram_user_id) do nothing returning true into v_new_user;
  if not coalesce(v_new_user,false) then
    update public.arvex_telegram_bot_users set telegram_username=coalesce(nullif(left(coalesce(p_telegram_username,''),64),''),telegram_username)
      where telegram_user_id=p_telegram_user_id;
    return jsonb_build_object('new_user',false,'referred',false,'total',0,'rewarded',false);
  end if;
  if coalesce(trim(p_referral_code),'')='' then
    return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded',false);
  end if;
  select c.user_id into v_referrer from public.arvex_referral_codes c where c.code=upper(trim(p_referral_code)) limit 1;
  if v_referrer is null then return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded',false); end if;
  select a.telegram_user_id into v_referrer_telegram from public.arvex_telegram_accounts a where a.user_id=v_referrer limit 1;
  if v_referrer_telegram is null or v_referrer_telegram=p_telegram_user_id then
    return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded',false);
  end if;
  insert into public.arvex_telegram_referrals(referrer_user_id,referrer_telegram_user_id,referred_telegram_user_id,referral_code)
  values(v_referrer,v_referrer_telegram,p_telegram_user_id,upper(trim(p_referral_code)))
  on conflict(referred_telegram_user_id) do nothing returning id into v_referral_id;
  if v_referral_id is null then return jsonb_build_object('new_user',true,'referred',false,'total',0,'rewarded',false); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_referrer::text,0));
  select count(*)::integer into v_total from public.arvex_telegram_referrals where referrer_user_id=v_referrer;
  insert into public.arvex_growth_points(user_id,points) values(v_referrer,25)
    on conflict(user_id) do update set points=public.arvex_growth_points.points+25,updated_at=now();
  if v_total>=15 and not exists(select 1 from public.arvex_telegram_referral_rewards where referrer_user_id=v_referrer) then
    insert into public.arvex_telegram_referral_rewards(referrer_user_id,milestone,reward_days) values(v_referrer,1,3)
      on conflict(referrer_user_id,milestone) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows>0 then
      insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
      values(v_referrer,now(),now()+interval '3 days',false,false,now(),null)
      on conflict(user_id) do update set
        expires_at=case when public.arvex_subscriptions.is_forever then null
          else greatest(now(),coalesce(public.arvex_subscriptions.expires_at,now()))+interval '3 days' end,
        updated_at=now(),updated_by=null;
      insert into public.arvex_notifications(user_id,title,body,kind,dedupe_key)
      values(v_referrer,'Реферальный бонус ARVEX','Ты впервые пригласил 15 новых пользователей в Telegram-бота. Начислено 3 дня Premium.','subscription','telegram_referral_reward:'||v_referrer::text||':1')
      on conflict do nothing;
      v_rewarded:=true;
    end if;
  end if;
  return jsonb_build_object('new_user',true,'referred',true,'total',v_total,'rewarded',v_rewarded);
end;
$$;
revoke all on function public.arvex_register_telegram_start(bigint,text,text) from public, anon, authenticated;
grant execute on function public.arvex_register_telegram_start(bigint,text,text) to service_role;

do $$
begin
  if not exists(select 1 from cron.job where jobname='arvex-monthly-referral-award') then
    perform cron.schedule('arvex-monthly-referral-award','5 0 1 * *',
      $job$select public.arvex_finalize_referral_month((date_trunc('month',current_date)-interval '1 month')::date);$job$);
  end if;
end $$;
