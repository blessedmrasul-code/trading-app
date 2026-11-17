const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ASSETS = "USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC";
const PLANS: Record<number, number> = { 30: 3, 90: 9, 180: 17, 365: 32 };
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function keyFromEnv(jsonName: string, legacyName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get(jsonName) || "{}").default || ""; } catch { return ""; }
}
async function adminRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = keyFromEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Supabase service key is not configured");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return response.status === 204 ? null : await response.json().catch(() => null);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt) return json({ error: "Сначала войди в аккаунт ARVEX." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishable = keyFromEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!supabaseUrl || !publishable) return json({ error: "Supabase не настроен." }, 503);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishable, Authorization: `Bearer ${jwt}` } });
    if (!userResponse.ok) return json({ error: "Сессия истекла. Войди снова." }, 401);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Не удалось подтвердить аккаунт." }, 401);

    const serviceKey = keyFromEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const banResponse = await fetch(`${supabaseUrl}/rest/v1/arvex_user_bans?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!banResponse.ok) return json({ error: "Не удалось проверить ограничения аккаунта." }, 503);
    if ((await banResponse.json()).length) return json({ error: "Аккаунт заблокирован администратором." }, 403);

    const ownerId = Deno.env.get("ARVEX_OWNER_USER_ID") || "";
    if (ownerId && user.id === ownerId) return json({ lifetime: true, message: "Пожизненный Premium уже активен." });
    const token = Deno.env.get("CRYPTO_PAY_API_TOKEN") || "";
    if (!token) return json({ error: "Crypto Pay ещё не подключён: добавь серверный API Token в Supabase Secrets." }, 503);

    const body = await req.json().catch(() => ({}));
    const days = Number(body?.days || 30);
    const price = PLANS[days];
    if (!price) return json({ error: "Выбери тариф на 30, 90, 180 или 365 дней." }, 400);

    const payload = crypto.randomUUID();
    const returnUrl = "https://blessedmrasul-code.github.io/trading-app/crypto-pay.html?payload=" + encodeURIComponent(payload);
    const apiResponse = await fetch("https://pay.crypt.bot/api/createInvoice", {
      method: "POST",
      headers: { "Crypto-Pay-API-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        currency_type: "fiat", fiat: "USD", amount: String(price),
        accepted_assets: ASSETS, payload, expires_in: 1800,
        allow_comments: false, allow_anonymous: false,
        paid_btn_name: "callback", paid_btn_url: returnUrl
      })
    });
    const apiData = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok || apiData?.ok !== true || !apiData?.result?.invoice_id || !apiData?.result?.bot_invoice_url) {
      console.error("Crypto Pay createInvoice failed:", apiData?.error || apiResponse.status);
      return json({ error: "Crypto Bot не смог создать счёт. Попробуй позже." }, 502);
    }
    const invoice = apiData.result;
    const rows = await adminRequest("arvex_cryptopay_invoices", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        invoice_id: Number(invoice.invoice_id), user_id: user.id, payload, period_days: days,
        amount_usd: price, status: "active",
        expires_at: invoice.expiration_date || new Date(Date.now() + 30 * 60 * 1000).toISOString()
      })
    });
    if (!rows?.[0]?.id) throw new Error("Could not save Crypto Pay invoice intent");
    return json({ id: rows[0].id, invoiceId: invoice.invoice_id, payload, url: invoice.bot_invoice_url,
      days, priceUsd: price, acceptedAssets: ASSETS.split(","), expiresAt: invoice.expiration_date || null });
  } catch (error) {
    console.error("create-crypto-pay-invoice:", error);
    return json({ error: "Не удалось подготовить счёт Crypto Bot. Попробуй позже." }, 500);
  }
});