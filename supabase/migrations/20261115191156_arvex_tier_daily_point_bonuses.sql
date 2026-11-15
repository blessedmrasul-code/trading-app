
alter table public.arvex_daily_activity
  drop constraint if exists arvex_daily_activity_checkin_points_check,
  drop constraint if exists arvex_daily_activity_quiz_points_check;
alter table public.arvex_daily_activity
  add constraint arvex_daily_activity_checkin_points_check check (checkin_points between 0 and 20),
  add constraint arvex_daily_activity_quiz_points_check check (quiz_points between 0 and 30);

create or replace function public.arvex_claim_daily_checkin(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_rows integer := 0; v_points bigint := 0; v_total integer := 0; v_reward integer := 10;
begin
  if p_user_id is null then raise exception 'Invalid user'; end if;
  select count(*)::integer into v_total from public.arvex_telegram_referrals where referrer_user_id=p_user_id;
  v_reward := 10 + case when v_total>=100 then 10 when v_total>=60 then 8 when v_total>=30 then 6 when v_total>=15 then 4 when v_total>=5 then 2 else 0 end;
  insert into public.arvex_daily_activity(user_id,activity_date) values(p_user_id,current_date)
  on conflict(user_id,activity_date) do nothing;
  update public.arvex_daily_activity set checkin_claimed_at=now(),checkin_points=v_reward
    where user_id=p_user_id and activity_date=current_date and checkin_claimed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.arvex_growth_points(user_id,points) values(p_user_id,v_reward)
    on conflict(user_id) do update set points=public.arvex_growth_points.points+v_reward,updated_at=now();
  end if;
  select points into v_points from public.arvex_growth_points where user_id=p_user_id;
  return jsonb_build_object('claimed',v_rows>0,'points',coalesce(v_points,0),'reward_points',case when v_rows>0 then v_reward else 0 end);
end;
$$;
revoke all on function public.arvex_claim_daily_checkin(uuid) from public, anon, authenticated;
grant execute on function public.arvex_claim_daily_checkin(uuid) to service_role;

create or replace function public.arvex_submit_daily_quiz(p_user_id uuid,p_answer integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_id integer := ((extract(doy from current_date)::integer - 1) % 5) + 1;
  v_correct integer; v_rows integer := 0; v_points bigint := 0; v_total integer := 0; v_reward integer := 20;
begin
  if p_user_id is null or p_answer not between 1 and 3 then raise exception 'Invalid answer'; end if;
  v_correct := case v_id when 1 then 1 when 2 then 2 when 3 then 1 when 4 then 2 else 1 end;
  if p_answer <> v_correct then
    select points into v_points from public.arvex_growth_points where user_id=p_user_id;
    return jsonb_build_object('correct',false,'claimed',false,'points',coalesce(v_points,0),'message','Ответ неверный. Попробуй ещё раз.');
  end if;
  select count(*)::integer into v_total from public.arvex_telegram_referrals where referrer_user_id=p_user_id;
  v_reward := 20 + case when v_total>=100 then 10 when v_total>=60 then 8 when v_total>=30 then 6 when v_total>=15 then 4 when v_total>=5 then 2 else 0 end;
  insert into public.arvex_daily_activity(user_id,activity_date) values(p_user_id,current_date)
  on conflict(user_id,activity_date) do nothing;
  update public.arvex_daily_activity set quiz_answer=p_answer,quiz_claimed_at=now(),quiz_points=v_reward
    where user_id=p_user_id and activity_date=current_date and quiz_claimed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.arvex_growth_points(user_id,points) values(p_user_id,v_reward)
    on conflict(user_id) do update set points=public.arvex_growth_points.points+v_reward,updated_at=now();
  end if;
  select points into v_points from public.arvex_growth_points where user_id=p_user_id;
  return jsonb_build_object('correct',true,'claimed',v_rows>0,'points',coalesce(v_points,0),'reward_points',case when v_rows>0 then v_reward else 0 end,'message',case when v_rows>0 then 'Верно! Начислено '||v_reward||' очков.' else 'Задание уже выполнено сегодня.' end);
end;
$$;
revoke all on function public.arvex_submit_daily_quiz(uuid,integer) from public, anon, authenticated;
grant execute on function public.arvex_submit_daily_quiz(uuid,integer) to service_role;
