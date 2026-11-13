// Cancel future renewal of the signed-in user's Telegram Stars subscription.
// The current paid period remains active until expires_at.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function key(jsonName: string, legacyName: string) {
  if (Deno.env.get(legacyName)) return Deno.env.get(legacyName)!;
  try { return JSON.parse(Deno.env.get(jsonName) || "{}").default || ""; }
  catch { return ""; }
}
async function db(path: string, init: RequestInit = {}) {
  const base = Deno.env.get("SUPABASE_URL") || "";
  const secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !secret) throw new Error("Supabase server credentials are missing");
  const r = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: secret, Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json", ...(init.headers || {}),
    },
  });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Database request failed (${r.status})`);
  return body;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));
    const enabled = body?.enabled !== false;
    const base = Deno.env.get("SUPABASE_URL") || "";
    const publishable = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!jwt || !base || !publishable) return json({ error: "Sign in to ARVEX first" }, 401);
    const auth = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: publishable, Authorization: `Bearer ${jwt}` },
    });
    if (!auth.ok) return json({ error: "Session expired. Sign in again." }, 401);
    const user = await auth.json();
    if (!user?.id) return json({ error: "Could not verify account" }, 401);
    const banKey = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const banCheck = await fetch(`${base}/rest/v1/arvex_user_bans?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, {
      headers: { apikey: banKey, Authorization: `Bearer ${banKey}` },
    });
    if (!banCheck.ok) return json({ error: "Could not verify account restrictions" }, 503);
    if ((await banCheck.json()).length) return json({ error: "Аккаунт заблокирован администратором Mrasulv." }, 403);
    if (user.id === (Deno.env.get("ARVEX_OWNER_USER_ID") || "")) {
      return json({ error: "Owner lifetime access does not need renewal." }, 400);
    }

    const first = await db(
      `telegram_star_payments?user_id=eq.${encodeURIComponent(user.id)}&is_first_recurring=eq.true&select=telegram_user_id,telegram_payment_charge_id&order=created_at.asc&limit=1`,
    );
    let payment = Array.isArray(first) ? first[0] : null;
    if (!payment) {
      const latest = await db(
        `telegram_star_payments?user_id=eq.${encodeURIComponent(user.id)}&select=telegram_user_id,telegram_payment_charge_id&order=created_at.desc&limit=1`,
      );
      payment = Array.isArray(latest) ? latest[0] : null;
    }
    if (!payment?.telegram_user_id || !payment?.telegram_payment_charge_id) {
      return json({ error: "Не найдена активная подписка Telegram Stars." }, 404);
    }
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    if (!botToken) return json({ error: "Telegram bot is not configured." }, 503);
    const telegram = await fetch(`https://api.telegram.org/bot${botToken}/editUserStarSubscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: payment.telegram_user_id,
        telegram_payment_charge_id: payment.telegram_payment_charge_id,
        is_canceled: !enabled,
      }),
    });
    const result = await telegram.json();
    if (!telegram.ok || !result.ok) {
      console.error("Telegram cancellation failed:", result.description || telegram.status);
      return json({ error: "Telegram не смог отменить автопродление. Попробуй позже." }, 502);
    }
    await db(`arvex_subscriptions?user_id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ auto_renew: enabled, updated_at: new Date().toISOString() }),
    });
    return json({ ok: true, message: enabled ? "Автопродление снова включено." : "Автопродление отключено. Доступ сохранится до конца оплаченного периода." });
  } catch (error) {
    console.error("cancel-stars-subscription:", error);
    return json({ error: "Не удалось отключить автопродление." }, 500);
  }
});
