const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function keyFromEnv(jsonName: string, legacyName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get(jsonName) || "{}").default || ""; } catch { return ""; }
}
async function adminRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = keyFromEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service key is not configured");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return body;
}
async function ensureReferralCode(userId: string) {
  const existing = await adminRequest("arvex_referral_codes?user_id=eq." + encodeURIComponent(userId) + "&select=code&limit=1");
  if (existing?.[0]?.code) return String(existing[0].code);
  for (let i = 0; i < 5; i++) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
    try {
      const rows = await adminRequest("arvex_referral_codes", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: userId, code })
      });
      if (rows?.[0]?.code) return String(rows[0].code);
    } catch (_) {
      const again = await adminRequest("arvex_referral_codes?user_id=eq." + encodeURIComponent(userId) + "&select=code&limit=1");
      if (again?.[0]?.code) return String(again[0].code);
    }
  }
  throw new Error("Could not create referral code");
}
async function growthFor(userId: string) {
  const now = new Date();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  // Idempotent fallback: if the scheduled monthly job was delayed, the first dashboard request finalizes the previous month.
  try {
    await adminRequest("rpc/arvex_finalize_referral_month", {
      method: "POST", body: JSON.stringify({ p_month_start: previousMonth })
    });
  } catch (error) {
    console.error("Monthly referral finalization fallback:", error);
  }
  return await adminRequest("rpc/arvex_growth_dashboard", {
    method: "POST", body: JSON.stringify({ p_user_id: userId })
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt || jwt === authHeader) return json({ error: "Войди в аккаунт ARVEX." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishable = keyFromEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!supabaseUrl || !publishable) return json({ error: "Supabase не настроен." }, 503);
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishable, Authorization: `Bearer ${jwt}` } });
    if (!auth.ok) return json({ error: "Сессия истекла. Войди снова." }, 401);
    const user = await auth.json();
    if (!user?.id) return json({ error: "Не удалось подтвердить аккаунт." }, 401);
    const userId = String(user.id);
    const bans = await adminRequest("arvex_user_bans?user_id=eq." + encodeURIComponent(userId) + "&select=user_id&limit=1");
    if (Array.isArray(bans) && bans.length) return json({ error: "Аккаунт заблокирован администратором." }, 403);

    const body = await req.json().catch(() => ({}));
    if (body?.action === "claim_checkin") {
      const result = await adminRequest("rpc/arvex_claim_daily_checkin", { method: "POST", body: JSON.stringify({ p_user_id: userId }) });
      const growth = await growthFor(userId);
      return json({ ok: true, action_result: result, growth });
    }
    if (body?.action === "submit_quiz") {
      const answer = Number(body.answer);
      if (!Number.isInteger(answer) || answer < 1 || answer > 3) return json({ error: "Выбери один из трёх вариантов." }, 400);
      const result = await adminRequest("rpc/arvex_submit_daily_quiz", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_answer: answer }) });
      const growth = await growthFor(userId);
      return json({ ok: true, action_result: result, growth });
    }

    const [subs, stars, cryptoRows, referralRewards, growth] = await Promise.all([
      adminRequest("arvex_subscriptions?user_id=eq." + encodeURIComponent(userId) + "&select=is_forever,expires_at,auto_renew,starts_at&limit=1"),
      adminRequest("telegram_star_payments?user_id=eq." + encodeURIComponent(userId) + "&select=stars_amount,created_at,expires_at,refunded_at,period_days&order=created_at.desc&limit=1000"),
      adminRequest("arvex_crypto_payment_intents?user_id=eq." + encodeURIComponent(userId) + "&status=eq.paid&select=amount_usdt,created_at,confirmed_at,period_days,txid&order=created_at.desc&limit=1000"),
      adminRequest("arvex_telegram_referral_rewards?referrer_user_id=eq." + encodeURIComponent(userId) + "&select=milestone,reward_days&order=milestone.asc&limit=1000"),
      growthFor(userId)
    ]);
    const referralCode = await ensureReferralCode(userId);
    const sub = subs?.[0] || null;
    const now = Date.now();
    const premiumActive = !!sub && (sub.is_forever === true || (!!sub.expires_at && Date.parse(sub.expires_at) > now));
    const paidStars = (stars || []).filter((x: any) => !x.refunded_at);
    const paidCrypto = cryptoRows || [];
    const payments = [
      ...paidStars.map((x: any) => ({ method: "Telegram Stars", amount: Number(x.stars_amount || 0), currency: "XTR", created_at: x.created_at, period_days: Number(x.period_days || 30), status: "paid" })),
      ...paidCrypto.map((x: any) => ({ method: "USDT TRC20", amount: Number(x.amount_usdt || 0), currency: "USDT", created_at: x.confirmed_at || x.created_at, period_days: Number(x.period_days || 30), status: "paid" }))
    ].sort((a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 20);
    const referralTotal = Number(growth?.total_referrals || 0);
    const referralRewardClaimed = !!growth?.referral_reward_claimed;
    return json({
      account: { email: String(user.email || "") },
      premium: { active: premiumActive, lifetime: sub?.is_forever === true, starts_at: sub?.starts_at || null, expires_at: sub?.expires_at || null, auto_renew: sub?.auto_renew === true },
      payments: {
        count: paidStars.length + paidCrypto.length,
        stars_total: paidStars.reduce((n: number, x: any) => n + Number(x.stars_amount || 0), 0),
        usdt_total: paidCrypto.reduce((n: number, x: any) => n + Number(x.amount_usdt || 0), 0),
        history: payments
      },
      referrals: {
        code: referralCode, total: referralTotal,
        rewarded: (referralRewards || []).length,
        pending: referralRewardClaimed ? 0 : Math.max(0, 15 - referralTotal),
        progress: referralRewardClaimed ? 15 : Math.min(referralTotal, 15),
        bonus_days: Number(growth?.referral_bonus_days || 0),
        reward_claimed: referralRewardClaimed,
        link: "https://t.me/ArvexPremiumBot?start=ref_" + encodeURIComponent(referralCode)
      },
      growth
    });
  } catch (error) {
    console.error("account-dashboard:", error);
    return json({ error: "Не удалось загрузить кабинет. Попробуй обновить страницу." }, 500);
  }
});
