const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
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
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Некорректный счёт." }, 400);
    const rows = await adminRequest("arvex_crypto_payment_intents?id=eq." + encodeURIComponent(id) + "&user_id=eq." + encodeURIComponent(user.id) + "&select=id,user_id,token_contract,recipient_address,amount_atomic,created_at,expires_at,status,txid");
    const intent = rows?.[0];
    if (!intent) return json({ error: "Счёт не найден." }, 404);
    if (intent.status === "paid") return json({ paid: true, message: "Платёж уже подтверждён." });
    if (intent.status !== "pending" || Date.parse(intent.expires_at) < Date.now()) return json({ paid: false, expired: true, message: "Срок действия счёта истёк. Создай новый." });
    const tronKey = Deno.env.get("TRONGRID_API_KEY") || "";
    if (!tronKey) return json({ error: "Проверка платежа ещё не настроена: отсутствует ключ TronGrid." }, 503);
    const url = "https://api.trongrid.io/v1/accounts/" + encodeURIComponent(intent.recipient_address) +
      "/transactions/trc20?only_confirmed=true&limit=200&contract_address=" + USDT_CONTRACT;
    const chainResponse = await fetch(url, { headers: { "TRON-PRO-API-KEY": tronKey } });
    if (!chainResponse.ok) {
      console.error("TronGrid response:", chainResponse.status);
      return json({ error: "Сеть TRON временно не отвечает. Попробуй позже." }, 503);
    }
    const chain = await chainResponse.json();
    const transfer = (chain?.data || []).find((tx: any) =>
      String(tx?.to || "").toLowerCase() === String(intent.recipient_address).toLowerCase() &&
      String(tx?.token_info?.address || "").toLowerCase() === USDT_CONTRACT.toLowerCase() &&
      String(tx?.value || "") === String(intent.amount_atomic) &&
      Number(tx?.block_timestamp || 0) >= Date.parse(intent.created_at) - 120000 &&
      Number(tx?.block_timestamp || 0) <= Date.now() + 60000
    );
    if (!transfer?.transaction_id) return json({ paid: false, message: "Поступление пока не найдено. Если уже отправил USDT, подожди подтверждения сети и проверь ещё раз." });
    const result = await adminRequest("rpc/arvex_apply_crypto_payment", {
      method: "POST",
      body: JSON.stringify({
        p_intent_id: id,
        p_txid: String(transfer.transaction_id),
        p_confirmed_at: new Date(Number(transfer.block_timestamp)).toISOString()
      })
    });
    if (result !== true) return json({ paid: false, message: "Транзакция уже обработана или счёт устарел. Напиши в поддержку, если средства отправлены." }, 409);
    return json({ paid: true, txid: transfer.transaction_id, message: "Оплата подтверждена. Premium активирован на 30 дней." });
  } catch (error) {
    console.error("check-crypto-payment:", error);
    return json({ error: "Не удалось проверить платёж. Попробуй позже." }, 500);
  }
});