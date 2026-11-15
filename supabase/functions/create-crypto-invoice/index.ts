const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RECEIVER = "TH6guxXKMXgXYdgincWowjTGLjLdPuijtK";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
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
  if (!key) throw new Error("Supabase secret key is not configured");
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
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt || jwt === authHeader) return json({ error: "Сначала войди в аккаунт ARVEX." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishable = keyFromEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!supabaseUrl || !publishable) return json({ error: "Supabase не настроен." }, 503);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publishable, Authorization: `Bearer ${jwt}` } });
    if (!userResponse.ok) return json({ error: "Сессия истекла. Войди снова." }, 401);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Не удалось подтвердить аккаунт." }, 401);
    const secret = keyFromEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const banCheck = await fetch(`${supabaseUrl}/rest/v1/arvex_user_bans?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` }
    });
    if (!banCheck.ok) return json({ error: "Не удалось проверить ограничения аккаунта." }, 503);
    if ((await banCheck.json()).length) return json({ error: "Аккаунт заблокирован администратором." }, 403);
    const ownerId = Deno.env.get("ARVEX_OWNER_USER_ID") || "";
    if (ownerId && user.id === ownerId) return json({ lifetime: true, message: "Пожизненный Premium уже активен." });
    const apiKey = Deno.env.get("TRONGRID_API_KEY") || "";
    if (!apiKey) return json({ error: "Криптооплата ещё настраивается: не добавлен серверный ключ TronGrid." }, 503);
    const base = Number(Deno.env.get("ARVEX_USDT_PRICE") || "5");
    if (!Number.isFinite(base) || base < 1 || base > 1000) return json({ error: "Неверная цена USDT." }, 500);
    await adminRequest("arvex_crypto_payment_intents?status=eq.pending&expires_at=lt." + encodeURIComponent(new Date().toISOString()), {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "expired" })
    });
    const baseCents = Math.round(base * 100);
    for (let attempt = 0; attempt < 25; attempt++) {
      const random = new Uint16Array(1); crypto.getRandomValues(random);
      const cents = baseCents + 1 + (random[0] % 99);
      const amountAtomic = cents * 10000;
      const amount = (cents / 100).toFixed(2);
      const rows = await adminRequest("arvex_crypto_payment_intents", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: user.id, network: "TRON", token_symbol: "USDT",
          token_contract: USDT_CONTRACT, recipient_address: RECEIVER,
          amount_atomic: amountAtomic, amount_usdt: amount,
          status: "pending", expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        })
      }).catch((e) => {
        if (String(e).includes("(409)")) return null;
        throw e;
      });
      if (!rows?.[0]?.id) continue;
      return json({
        id: rows[0].id, network: "TRON (TRC20)", token: "USDT",
        amount: amount, wallet: RECEIVER, expiresAt: rows[0].expires_at,
        explorerUrl: "https://tronscan.org/#/address/" + RECEIVER
      });
    }
    return json({ error: "Не удалось создать уникальный счёт. Попробуй ещё раз." }, 503);
  } catch (error) {
    console.error("create-crypto-invoice:", error);
    return json({ error: "Не удалось подготовить криптосчёт. Попробуй позже." }, 500);
  }
});