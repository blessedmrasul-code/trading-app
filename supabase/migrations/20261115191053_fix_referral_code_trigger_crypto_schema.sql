
create or replace function public.arvex_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10));
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
