-- ARVEX USDT TRC20 payment intents and atomic subscription activation.
create table if not exists public.arvex_crypto_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null default 'TRON' check (network = 'TRON'),
  token_symbol text not null default 'USDT' check (token_symbol = 'USDT'),
  token_contract text not null,
  recipient_address text not null,
  amount_atomic bigint not null check (amount_atomic > 0),
  amount_usdt numeric(12,2) not null check (amount_usdt > 0),
  status text not null default 'pending' check (status in ('pending','paid','expired')),
  txid text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz
);
alter table public.arvex_crypto_payment_intents enable row level security;
revoke all on public.arvex_crypto_payment_intents from anon, authenticated;
grant all on public.arvex_crypto_payment_intents to service_role;
create unique index if not exists arvex_crypto_pending_amount_uidx
  on public.arvex_crypto_payment_intents(amount_atomic) where status = 'pending';
create index if not exists arvex_crypto_intents_user_created_idx
  on public.arvex_crypto_payment_intents(user_id, created_at desc);

create or replace function public.arvex_apply_crypto_payment(
  p_intent_id uuid, p_txid text, p_confirmed_at timestamptz
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_intent public.arvex_crypto_payment_intents%rowtype;
begin
  if p_txid is null or length(p_txid) <> 64 then raise exception 'Invalid transaction id'; end if;
  select * into v_intent from public.arvex_crypto_payment_intents where id = p_intent_id for update;
  if not found then return false; end if;
  if v_intent.status = 'paid' then return v_intent.txid = p_txid; end if;
  if v_intent.status <> 'pending' or v_intent.expires_at < now() then return false; end if;
  update public.arvex_crypto_payment_intents
     set status = 'paid', txid = p_txid, confirmed_at = coalesce(p_confirmed_at, now())
   where id = p_intent_id;
  insert into public.arvex_subscriptions
    (user_id, starts_at, expires_at, is_forever, auto_renew, updated_at, updated_by)
  values (v_intent.user_id, now(), now() + interval '30 days', false, false, now(), null)
  on conflict (user_id) do update set
    expires_at = case when public.arvex_subscriptions.is_forever then null
      else greatest(now(), coalesce(public.arvex_subscriptions.expires_at, now())) + interval '30 days' end,
    is_forever = public.arvex_subscriptions.is_forever,
    auto_renew = false, updated_at = now(), updated_by = null;
  insert into public.arvex_notifications(user_id, title, body, kind)
  values (v_intent.user_id, 'Оплата USDT подтверждена',
    'Платёж в сети TRON подтверждён. ARVEX Premium активирован на 30 дней.', 'payment');
  return true;
exception when unique_violation then return false;
end;
$$;
revoke all on function public.arvex_apply_crypto_payment(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.arvex_apply_crypto_payment(uuid,text,timestamptz) to service_role;
