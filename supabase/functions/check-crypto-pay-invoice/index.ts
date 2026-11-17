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

    const body = await req.json().catch(() => ({}));
    const payload = String(body?.payload || "");
    if (!/^[0-9a-f-]{36}$/i.test(payload)) return json({ error: "Некорректный счёт." }, 400);
    const rows = await adminRequest("arvex_cryptopay_invoices?payload=eq." + encodeURIComponent(payload) +
      "&user_id=eq." + encodeURIComponent(user.id) + "&select=invoice_id,payload,amount_usd,status,period_days");
    const stored = rows?.[0];
    if (!stored) return json({ error: "Счёт не найден." }, 404);
    if (stored.status === "paid") return json({ paid: true, message: "Оплата уже подтверждена." });

    const token = Deno.env.get("CRYPTO_PAY_API_TOKEN") || "";
    if (!token) return json({ error: "Crypto Pay не настроен: отсутствует серверный API Token." }, 503);
    const apiResponse = await fetch("https://pay.crypt.bot/api/getInvoices", {
      method: "POST", headers: { "Crypto-Pay-API-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_ids: String(stored.invoice_id) })
    });
    const apiData = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok || apiData?.ok !== true) return json({ error: "Crypto Pay временно не отвечает." }, 502);
    const invoice = (apiData.result?.items || apiData.result || [])[0];
    if (!invoice || String(invoice.payload || "") !== payload) return json({ error: "Счёт не найден у платёжного провайдера." }, 404);
    if (invoice.status !== "paid") {
      return json({ paid: false, expired: invoice.status === "expired",
        message: invoice.status === "expired" ? "Срок счёта истёк. Создай новый." : "Оплата пока не найдена. Подожди подтверждения и проверь ещё раз." });
    }
    const amountUsd = Number(invoice.amount);
    const paidAsset = String(invoice.paid_asset || "").toUpperCase();
    const paidAmount = Number(invoice.paid_amount);
    const allowed = ["USDT","TON","BTC","ETH","LTC","BNB","TRX","USDC"];
    if (String(invoice.currency_type || "") !== "fiat" || String(invoice.fiat || "") !== "USD" ||
        !Number.isFinite(amountUsd) || amountUsd.toFixed(2) !== Number(stored.amount_usd).toFixed(2) ||
        !allowed.includes(paidAsset) || !Number.isFinite(paidAmount) || paidAmount <= 0) {
      return json({ error: "Данные оплаты не совпали со счётом. Обратись в поддержку." }, 409);
    }
    const paidAt = invoice.paid_at ? new Date(invoice.paid_at).toISOString() : new Date().toISOString();
    const result = await adminRequest("rpc/arvex_apply_cryptopay_invoice", {
      method: "POST",
      body: JSON.stringify({ p_invoice_id: Number(stored.invoice_id), p_amount_usd: amountUsd,
        p_paid_asset: paidAsset, p_paid_amount: paidAmount, p_paid_at: paidAt })
    });
    if (result !== true) return json({ paid: false, message: "Не удалось применить оплату. Напиши в поддержку." }, 409);
    return json({ paid: true, message: "Оплата подтверждена. Premium активирован на " + Number(stored.period_days) + " дней." });
  } catch (error) {
    console.error("check-crypto-pay-invoice:", error);
    return json({ error: "Не удалось проверить оплату. Попробуй позже." }, 500);
  }
});