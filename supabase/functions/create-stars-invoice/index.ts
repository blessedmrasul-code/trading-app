// ARVEX: create a recurring 30-day Telegram Stars invoice for the signed-in user.
// Required Edge Function secrets: TELEGRAM_BOT_TOKEN, ARVEX_STARS_PRICE,
// ARVEX_OWNER_USER_ID. Supabase URL and API keys are injected by the platform.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function keyFromEnv(jsonName: string, legacyName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get(jsonName) || "{}");
    return keys.default || "";
  } catch {
    return "";
  }
}

async function adminRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = keyFromEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Supabase secret API key is not configured");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return response.status === 204 ? null : await response.json();
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
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!supabaseUrl || !publishable) {
      return json({ error: "Supabase is not configured yet" }, 503);
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishable, Authorization: `Bearer ${jwt}` },
    });
    if (!userResponse.ok) return json({ error: "Session expired. Sign in again." }, 401);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Could not verify account" }, 401);

    const ownerId = Deno.env.get("ARVEX_OWNER_USER_ID") || "";
    if (ownerId && user.id === ownerId) {
      await adminRequest("entitlements?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id, plan: "lifetime", expires_at: null, auto_renew: false,
          updated_at: new Date().toISOString(),
        }),
      });
      return json({ lifetime: true, message: "Owner lifetime access is active." });
    }

    if (!botToken) return json({ error: "Telegram bot is not configured yet" }, 503);

    const stars = Number(Deno.env.get("ARVEX_STARS_PRICE") || "120");
    if (!Number.isInteger(stars) || stars < 1 || stars > 10000) {
      return json({ error: "Invalid Stars price configuration" }, 500);
    }

    const payload = `arvex_${crypto.randomUUID()}`;
    await adminRequest("telegram_payment_intents", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: user.id, invoice_payload: payload,
        stars_amount: stars, currency: "XTR", status: "pending",
      }),
    });

    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "ARVEX Premium",
        description: "Полный доступ к ARVEX на 30 дней. Автопродление через Telegram Stars.",
        payload,
        provider_token: "",
        currency: "XTR",
        prices: [{ label: "ARVEX Premium · 30 дней", amount: stars }],
        subscription_period: 2592000,
      }),
    });
    const invoice = await telegramResponse.json();
    if (!telegramResponse.ok || !invoice.ok || typeof invoice.result !== "string") {
      await adminRequest(`telegram_payment_intents?invoice_payload=eq.${encodeURIComponent(payload)}`, {
        method: "DELETE",
      });
      return json({ error: "Telegram could not create the invoice" }, 502);
    }

    return json({ url: invoice.result, stars, periodDays: 30, recurring: true });
  } catch (error) {
    console.error("create-stars-invoice:", error);
    return json({ error: "Could not create payment link. Try again later." }, 500);
  }
});
