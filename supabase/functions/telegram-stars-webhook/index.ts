// Telegram Stars webhook for ARVEX.
// Verify the X-Telegram-Bot-Api-Secret-Token header before processing updates.
const botToken = () => Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const webhookSecret = () => Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const serviceKey = () => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { return ""; }
};
const dbUrl = () => Deno.env.get("SUPABASE_URL") || "";

async function db(path: string, init: RequestInit = {}) {
  const key = serviceKey();
  if (!key || !dbUrl()) throw new Error("Supabase service credentials are missing");
  const response = await fetch(`${dbUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return body;
}

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram API error: ${method}`);
  return result.result;
}

async function getIntent(payload: string) {
  const rows = await db(
    `telegram_payment_intents?invoice_payload=eq.${encodeURIComponent(payload)}&select=id,user_id,stars_amount,currency,status&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function answerPreCheckout(query: any) {
  let valid = false;
  try {
    const intent = await getIntent(String(query.invoice_payload || ""));
    valid = !!intent &&
      intent.currency === query.currency &&
      Number(intent.stars_amount) === Number(query.total_amount) &&
      query.currency === "XTR";
  } catch (error) {
    console.error("pre-checkout validation failed:", error);
  }
  await telegram("answerPreCheckoutQuery", {
    pre_checkout_query_id: query.id,
    ok: valid,
    ...(!valid ? { error_message: "Счёт недействителен. Создайте новый платёж в ARVEX." } : {}),
  });
}

async function applySuccessfulPayment(message: any) {
  const payment = message?.successful_payment;
  if (!payment || payment.currency !== "XTR" || !payment.telegram_payment_charge_id) {
    throw new Error("Invalid Telegram Stars payment object");
  }
  const intent = await getIntent(String(payment.invoice_payload || ""));
  if (!intent || intent.currency !== "XTR" || Number(intent.stars_amount) !== Number(payment.total_amount)) {
    throw new Error("Payment does not match a valid ARVEX invoice");
  }

  const previous = await db(
    `telegram_star_payments?telegram_payment_charge_id=eq.${encodeURIComponent(payment.telegram_payment_charge_id)}&select=id&limit=1`,
  );
  if (Array.isArray(previous) && previous.length) return;

  const ownerId = Deno.env.get("ARVEX_OWNER_USER_ID") || "";
  const isOwner = ownerId && intent.user_id === ownerId;
  const telegramExpiry = Number(payment.subscription_expiration_date || 0);
  const expiresAt = telegramExpiry > 0
    ? new Date(telegramExpiry * 1000).toISOString()
    : new Date((Number(message.date) || Math.floor(Date.now() / 1000)) * 1000 + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Telegram supplies the authoritative expiration timestamp for recurring Stars payments.
  // A duplicate webhook writes the same expiry and the unique charge ID prevents duplicate receipts.
  if (isOwner) {
    await db("entitlements?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: intent.user_id, plan: "lifetime", expires_at: null, auto_renew: false,
        updated_at: new Date().toISOString(),
      }),
    });
  } else {
    const current = await db(
      `entitlements?user_id=eq.${encodeURIComponent(intent.user_id)}&select=plan,expires_at&limit=1`,
    );
    const existing = Array.isArray(current) ? current[0] : null;
    if (String(existing?.plan || "").toLowerCase() !== "lifetime") {
      await db("entitlements?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: intent.user_id, plan: "monthly", expires_at: expiresAt, auto_renew: true,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  }

  await db("telegram_star_payments?on_conflict=telegram_payment_charge_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      intent_id: intent.id,
      user_id: intent.user_id,
      telegram_user_id: message.from?.id || null,
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      stars_amount: payment.total_amount,
      currency: payment.currency,
      is_recurring: !!payment.is_recurring,
      is_first_recurring: !!payment.is_first_recurring,
      expires_at: telegramExpiry > 0 ? expiresAt : null,
    }),
  });

  await db(`telegram_payment_intents?id=eq.${encodeURIComponent(intent.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "paid",
      telegram_user_id: message.from?.id || null,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function applyRefund(message: any) {
  const refund = message?.refunded_payment;
  if (!refund?.telegram_payment_charge_id) throw new Error("Invalid refunded Stars payment");
  const charge = encodeURIComponent(refund.telegram_payment_charge_id);
  const rows = await db(
    `telegram_star_payments?telegram_payment_charge_id=eq.${charge}&select=id,user_id,intent_id,telegram_user_id`,
  );
  const payment = Array.isArray(rows) ? rows[0] : null;
  if (!payment) throw new Error("Refund does not match a recorded ARVEX payment");

  const intents = await db(
    `telegram_payment_intents?id=eq.${encodeURIComponent(payment.intent_id)}&select=invoice_payload&limit=1`,
  );
  if (!Array.isArray(intents) || intents[0]?.invoice_payload !== refund.invoice_payload) {
    throw new Error("Refund payload does not match the original invoice");
  }

  await db(`telegram_star_payments?id=eq.${encodeURIComponent(payment.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ refunded_at: new Date().toISOString() }),
  });

  const current = await db(
    `entitlements?user_id=eq.${encodeURIComponent(payment.user_id)}&select=plan&limit=1`,
  );
  if (String(current?.[0]?.plan || "").toLowerCase() === "lifetime") return;

  const remaining = await db(
    `telegram_star_payments?user_id=eq.${encodeURIComponent(payment.user_id)}&refunded_at=is.null&expires_at=not.is.null&select=expires_at&order=expires_at.desc&limit=1`,
  );
  const expiresAt = Array.isArray(remaining) && remaining[0]?.expires_at
    ? remaining[0].expires_at
    : new Date().toISOString();

  await db(`entitlements?user_id=eq.${encodeURIComponent(payment.user_id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      plan: "monthly", expires_at: expiresAt, auto_renew: false,
      updated_at: new Date().toISOString(),
    }),
  });

  try {
    const first = await db(
      `telegram_star_payments?user_id=eq.${encodeURIComponent(payment.user_id)}&is_first_recurring=eq.true&select=telegram_user_id,telegram_payment_charge_id&order=created_at.asc&limit=1`,
    );
    if (Array.isArray(first) && first[0]?.telegram_user_id && first[0]?.telegram_payment_charge_id) {
      await telegram("editUserStarSubscription", {
        user_id: first[0].telegram_user_id,
        telegram_payment_charge_id: first[0].telegram_payment_charge_id,
        is_canceled: true,
      });
    }
  } catch (error) {
    console.error("Could not cancel refunded subscription renewal:", error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = webhookSecret();
  const received = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!expected || received !== expected) return new Response("Unauthorized", { status: 401 });

  try {
    const update = await req.json();
    if (update.pre_checkout_query) {
      await answerPreCheckout(update.pre_checkout_query);
    } else if (update.message?.successful_payment) {
      await applySuccessfulPayment(update.message);
    } else if (update.message?.refunded_payment) {
      await applyRefund(update.message);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("telegram-stars-webhook:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
});
