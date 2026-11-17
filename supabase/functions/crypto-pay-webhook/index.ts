function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
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
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifySignature(rawBody: string, signature: string, token: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const secret = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(hex, signature.toLowerCase());
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = Deno.env.get("CRYPTO_PAY_API_TOKEN") || "";
    if (!token) return json({ error: "Webhook is not configured" }, 503);
    const signature = req.headers.get("crypto-pay-api-signature") || "";
    const rawBody = await req.text();
    if (!signature || !(await verifySignature(rawBody, signature, token))) return json({ error: "Invalid signature" }, 401);
    const update = JSON.parse(rawBody);
    if (update?.update_type !== "invoice_paid") return json({ ok: true, ignored: true });
    const invoice = update?.payload;
    if (!invoice?.invoice_id || invoice.status !== "paid" || invoice.currency_type !== "fiat" ||
        invoice.fiat !== "USD" || !invoice.paid_asset || !invoice.paid_amount || !invoice.amount) {
      return json({ error: "Invalid paid invoice payload" }, 400);
    }
    const allowed = ["USDT","TON","BTC","ETH","LTC","BNB","TRX","USDC"];
    if (!allowed.includes(String(invoice.paid_asset))) return json({ error: "Unsupported paid asset" }, 400);
    const result = await adminRequest("rpc/arvex_apply_cryptopay_invoice", {
      method: "POST",
      body: JSON.stringify({
        p_invoice_id: Number(invoice.invoice_id),
        p_amount_usd: Number(invoice.amount),
        p_paid_asset: String(invoice.paid_asset),
        p_paid_amount: Number(invoice.paid_amount),
        p_paid_at: invoice.paid_at || update.request_date || new Date().toISOString()
      })
    });
    if (result !== true) return json({ error: "Invoice was not applied" }, 409);
    return json({ ok: true });
  } catch (error) {
    console.error("crypto-pay-webhook:", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});