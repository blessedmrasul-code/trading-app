// Create a Telegram bot deep link bound to the currently authenticated ARVEX account.
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
  if (!key) throw new Error("Supabase secret API key is not configured");
  const response = await fetch(\`\${url}/rest/v1/\${path}\`, {
    ...init,
    headers: { apikey: key, Authorization: \`Bearer \${key}\`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  if (!response.ok) throw new Error(\`Database request failed (\${response.status})\`);
  return response.status === 204 ? null : await response.json().catch(() => null);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt || jwt === authHeader) return json({ error: "Sign in to ARVEX first" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishable = keyFromEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!supabaseUrl || !publishable) return json({ error: "Supabase is not configured" }, 503);
    const userResponse = await fetch(\`\${supabaseUrl}/auth/v1/user\`, {
      headers: { apikey: publishable, Authorization: \`Bearer \${jwt}\` }
    });
    if (!userResponse.ok) return json({ error: "Session expired. Sign in again." }, 401);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Could not verify account" }, 401);
    const ownerId = Deno.env.get("ARVEX_OWNER_USER_ID") || "";
    if (ownerId && user.id === ownerId) return json({ lifetime: true, message: "Owner lifetime access is active." });
    const stars = Number(Deno.env.get("ARVEX_STARS_PRICE") || "120");
    if (!Number.isInteger(stars) || stars !== 120) return json({ error: "Invalid Stars price configuration" }, 500);
    const payload = \`arvex_\${crypto.randomUUID()}\`;
    await adminRequest("telegram_payment_intents", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: user.id, invoice_payload: payload, stars_amount: stars, currency: "XTR", status: "pending" })
    });
    return json({ url: \`https://t.me/ArvexPremiumBot?start=\${payload}\`, stars, periodDays: 30 });
  } catch (error) {
    console.error("create-stars-bot-link:", error);
    return json({ error: "Could not prepare Telegram payment. Try again later." }, 500);
  }
});
