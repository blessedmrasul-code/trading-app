-- Atomic Telegram Stars payment processing for ARVEX.
-- Only service_role can execute this function; payment receipt + entitlement update
-- happen in one transaction and duplicate Telegram charge IDs are ignored safely.
create or replace function public.arvex_process_stars_payment(
  p_invoice_payload text,
  p_charge_id text,
  p_telegram_user_id bigint,
  p_stars_amount integer,
  p_currency text,
  p_is_recurring boolean,
  p_is_first_recurring boolean,
  p_expires_at timestamptz,
  p_paid_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.telegram_payment_intents%rowtype;
  v_payment_id uuid;
begin
  if coalesce(p_invoice_payload, '') = '' or coalesce(p_charge_id, '') = ''
     or p_stars_amount is null or p_stars_amount < 1 or p_currency is distinct from 'XTR' then
    raise exception 'Invalid Stars payment parameters';
  end if;

  select * into v_intent
  from public.telegram_payment_intents
  where invoice_payload = p_invoice_payload
  for update;

  if not found then raise exception 'Payment invoice not found'; end if;
  if v_intent.currency <> p_currency or v_intent.stars_amount <> p_stars_amount then
    raise exception 'Payment amount or currency mismatch';
  end if;
  if v_intent.status <> 'pending' and not (v_intent.status = 'paid' and coalesce(p_is_recurring,false)) then
    raise exception 'Invoice is not payable';
  end if;

  insert into public.telegram_star_payments (
    intent_id,user_id,telegram_user_id,telegram_payment_charge_id,
    stars_amount,currency,is_recurring,is_first_recurring,expires_at
  ) values (
    v_intent.id,v_intent.user_id,p_telegram_user_id,p_charge_id,
    p_stars_amount,p_currency,coalesce(p_is_recurring,false),
    coalesce(p_is_first_recurring,false),p_expires_at
  )
  on conflict (telegram_payment_charge_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  update public.telegram_payment_intents
  set status='paid',telegram_user_id=p_telegram_user_id,updated_at=coalesce(p_paid_at,now())
  where id=v_intent.id;

  insert into public.arvex_subscriptions (
    user_id,starts_at,expires_at,is_forever,auto_renew,updated_at,updated_by
  ) values (
    v_intent.user_id,coalesce(p_paid_at,now()),
    coalesce(p_expires_at,coalesce(p_paid_at,now())+interval '30 days'),
    false,coalesce(p_is_recurring,false),now(),null
  )
  on conflict (user_id) do update
  set starts_at=excluded.starts_at,expires_at=excluded.expires_at,is_forever=false,
      auto_renew=excluded.auto_renew,updated_at=now(),updated_by=null
  where public.arvex_subscriptions.is_forever is not true;

  return jsonb_build_object('ok',true,'duplicate',false,'user_id',v_intent.user_id);
end;
$$;

revoke all on function public.arvex_process_stars_payment(text,text,bigint,integer,text,boolean,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.arvex_process_stars_payment(text,text,bigint,integer,text,boolean,boolean,timestamptz,timestamptz) to service_role;
