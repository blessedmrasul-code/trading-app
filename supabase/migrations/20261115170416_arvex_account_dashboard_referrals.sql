-- ARVEX account dashboard, payment periods, and referral rewards.
alter table public.telegram_payment_intents
  add column if not exists period_days integer not null default 30 check (period_days in (30,90,180,365));
alter table public.telegram_star_payments
  add column if not exists period_days integer not null default 30 check (period_days in (30,90,180,365));
alter table public.arvex_crypto_payment_intents
  add column if not exists period_days integer not null default 30 check (period_days in (30,90,180,365));

create table if not exists public.arvex_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8,16}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.arvex_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending','rewarded')),
  reward_days integer not null default 7 check (reward_days between 1 and 30),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  constraint arvex_referrals_not_self check (referrer_user_id <> referred_user_id)
);
create index if not exists arvex_referrals_referrer_created_idx on public.arvex_referrals(referrer_user_id, created_at desc);
alter table public.arvex_referral_codes enable row level security;
alter table public.arvex_referrals enable row level security;
revoke all on public.arvex_referral_codes, public.arvex_referrals from public, anon, authenticated;
grant all on public.arvex_referral_codes, public.arvex_referrals to service_role;

create or replace function public.arvex_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_code text; v_referrer uuid; v_attempt integer := 0;
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
  select c.user_id into v_referrer from public.arvex_referral_codes c
    where c.code = upper(trim(coalesce(new.raw_user_meta_data->>'arvex_referral_code',''))) limit 1;
  if v_referrer is not null and v_referrer <> new.id then
    insert into public.arvex_referrals(referrer_user_id, referred_user_id, referral_code)
    values(v_referrer, new.id, upper(trim(new.raw_user_meta_data->>'arvex_referral_code')))
    on conflict(referred_user_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists arvex_auth_user_referral on auth.users;
create trigger arvex_auth_user_referral after insert on auth.users for each row execute function public.arvex_handle_new_auth_user();

insert into public.arvex_referral_codes(user_id, code)
select u.id, upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10))
from auth.users u
where not exists (select 1 from public.arvex_referral_codes c where c.user_id=u.id)
on conflict (user_id) do nothing;

create or replace function public.arvex_qualify_referral(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_referral public.arvex_referrals%rowtype; v_now timestamptz := now();
begin
  select * into v_referral from public.arvex_referrals
  where referred_user_id = p_user_id and status = 'pending' for update;
  if not found then return false; end if;
  update public.arvex_referrals set status='rewarded', qualified_at=v_now, rewarded_at=v_now where id=v_referral.id;
  insert into public.arvex_subscriptions(user_id, starts_at, expires_at, is_forever, auto_renew, updated_at, updated_by)
  values(v_referral.referrer_user_id, v_now, v_now + make_interval(days => v_referral.reward_days), false, false, v_now, null)
  on conflict(user_id) do update set
    expires_at = case when public.arvex_subscriptions.is_forever then null
      else greatest(v_now, coalesce(public.arvex_subscriptions.expires_at, v_now)) + make_interval(days => v_referral.reward_days) end,
    updated_at = v_now, updated_by = null;
  insert into public.arvex_notifications(user_id,title,body,kind,dedupe_key)
  values(v_referral.referrer_user_id,'Реферальный бонус начислен',
    'Приглашённый пользователь впервые оплатил ARVEX Premium. Начислено '||v_referral.reward_days||' бонусных дней.',
    'subscription','referral_reward:'||v_referral.id::text) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.arvex_qualify_referral(uuid) from public, anon, authenticated;
grant execute on function public.arvex_qualify_referral(uuid) to service_role;

-- Payment RPCs apply the plan duration stored on the verified invoice, never a client-supplied duration.
create or replace function public.arvex_process_stars_payment(
  p_invoice_payload text, p_charge_id text, p_telegram_user_id bigint, p_stars_amount integer,
  p_currency text, p_is_recurring boolean, p_is_first_recurring boolean,
  p_expires_at timestamptz, p_paid_at timestamptz
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_intent public.telegram_payment_intents%rowtype;
  v_payment_id uuid;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_days integer;
  v_expiry timestamptz;
begin
  if coalesce(p_invoice_payload, '') = '' or coalesce(p_charge_id, '') = '' or p_stars_amount is null
     or p_stars_amount < 1 or p_currency is distinct from 'XTR' then raise exception 'Invalid Stars payment parameters'; end if;
  select * into v_intent from public.telegram_payment_intents where invoice_payload = p_invoice_payload for update;
  if not found then raise exception 'Payment invoice not found'; end if;
  if exists(select 1 from public.arvex_user_bans b where b.user_id=v_intent.user_id) then raise exception 'Account is banned'; end if;
  if v_intent.currency <> p_currency or v_intent.stars_amount <> p_stars_amount then raise exception 'Payment amount or currency mismatch'; end if;
  if v_intent.status <> 'pending' and not (v_intent.status = 'paid' and coalesce(p_is_recurring,false)) then raise exception 'Invoice is not payable'; end if;
  insert into public.telegram_star_payments(intent_id,user_id,telegram_user_id,telegram_payment_charge_id,stars_amount,currency,is_recurring,is_first_recurring,expires_at,period_days)
  values(v_intent.id,v_intent.user_id,p_telegram_user_id,p_charge_id,p_stars_amount,p_currency,coalesce(p_is_recurring,false),coalesce(p_is_first_recurring,false),p_expires_at,coalesce(v_intent.period_days,30))
  on conflict (telegram_payment_charge_id) do nothing returning id into v_payment_id;
  if v_payment_id is null then return jsonb_build_object('ok',true,'duplicate',true); end if;
  update public.telegram_payment_intents set status='paid',telegram_user_id=p_telegram_user_id,updated_at=v_paid_at where id=v_intent.id;
  v_days := coalesce(v_intent.period_days,30);
  if coalesce(p_is_recurring,false) and v_days=30 and p_expires_at is not null then v_expiry := p_expires_at;
  else
    select greatest(v_paid_at, coalesce(s.expires_at, v_paid_at)) + make_interval(days => v_days)
    into v_expiry from (select 1) seed left join public.arvex_subscriptions s on s.user_id=v_intent.user_id;
  end if;
  insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
  values(v_intent.user_id,v_paid_at,v_expiry,false,coalesce(p_is_recurring,false),now(),null)
  on conflict(user_id) do update set
    starts_at=case when public.arvex_subscriptions.expires_at is null or public.arvex_subscriptions.expires_at <= v_paid_at then v_paid_at else public.arvex_subscriptions.starts_at end,
    expires_at=case when public.arvex_subscriptions.is_forever then null else greatest(coalesce(public.arvex_subscriptions.expires_at,v_paid_at),v_expiry) end,
    is_forever=public.arvex_subscriptions.is_forever,auto_renew=excluded.auto_renew,updated_at=now(),updated_by=null;
  perform public.arvex_qualify_referral(v_intent.user_id);
  return jsonb_build_object('ok',true,'duplicate',false,'user_id',v_intent.user_id,'period_days',v_days);
end;
$$;
revoke all on function public.arvex_process_stars_payment(text,text,bigint,integer,text,boolean,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.arvex_process_stars_payment(text,text,bigint,integer,text,boolean,boolean,timestamptz,timestamptz) to service_role;

create or replace function public.arvex_apply_crypto_payment(p_intent_id uuid, p_txid text, p_confirmed_at timestamptz)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_intent public.arvex_crypto_payment_intents%rowtype; v_payment_time timestamptz := coalesce(p_confirmed_at, now()); v_days integer;
begin
  if p_txid is null or length(p_txid) <> 64 then raise exception 'Invalid transaction id'; end if;
  select * into v_intent from public.arvex_crypto_payment_intents where id = p_intent_id for update;
  if not found then return false; end if;
  if v_intent.status = 'paid' then return v_intent.txid = p_txid; end if;
  if v_intent.status not in ('pending','expired') or v_payment_time < v_intent.created_at - interval '2 minutes'
     or v_payment_time > v_intent.expires_at + interval '10 minutes' then return false; end if;
  if exists(select 1 from public.arvex_user_bans b where b.user_id=v_intent.user_id) then return false; end if;
  v_days := coalesce(v_intent.period_days,30);
  update public.arvex_crypto_payment_intents set status='paid',txid=p_txid,confirmed_at=v_payment_time where id=p_intent_id;
  insert into public.arvex_subscriptions(user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by)
  values(v_intent.user_id,v_payment_time,v_payment_time+make_interval(days=>v_days),false,false,now(),null)
  on conflict(user_id) do update set
    starts_at=case when public.arvex_subscriptions.expires_at is null or public.arvex_subscriptions.expires_at <= v_payment_time then v_payment_time else public.arvex_subscriptions.starts_at end,
    expires_at=case when public.arvex_subscriptions.is_forever then null else greatest(v_payment_time,coalesce(public.arvex_subscriptions.expires_at,v_payment_time))+make_interval(days=>v_days) end,
    is_forever=public.arvex_subscriptions.is_forever,auto_renew=false,updated_at=now(),updated_by=null;
  perform public.arvex_qualify_referral(v_intent.user_id);
  insert into public.arvex_notifications(user_id,title,body,kind)
  values(v_intent.user_id,'Оплата USDT подтверждена','Платёж в сети TRON подтверждён. ARVEX Premium активирован на '||v_days||' дней.','payment');
  return true;
exception when unique_violation then return false;
end;
$$;
revoke all on function public.arvex_apply_crypto_payment(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.arvex_apply_crypto_payment(uuid,text,timestamptz) to service_role;
