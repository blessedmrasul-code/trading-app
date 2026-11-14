import { MASTER_LESSONS, MASTER_FINAL, MASTER_STRESS } from "./content.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store, private" },
});
function keyFromEnv(jsonName: string, legacyName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get(jsonName) || "{}").default || ""; }
  catch { return ""; }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const base = Deno.env.get("SUPABASE_URL") || "";
    const publishable = keyFromEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = keyFromEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") || "";
    const jwt = authorization.replace(/^Bearer\\s+/i, "");
    if (!base || !publishable || !secret) return json({ error: "Сервер Premium временно недоступен." }, 503);
    if (!jwt || jwt === authorization) return json({ error: "Сначала войди в аккаунт ARVEX." }, 401);

    // Resolve the account through Supabase Auth; never trust client-supplied user IDs or local flags.
    const authResponse = await fetch(base + "/auth/v1/user", {
      headers: { apikey: publishable, Authorization: "Bearer " + jwt },
    });
    if (!authResponse.ok) return json({ error: "Сессия истекла. Войди снова." }, 401);
    const user = await authResponse.json();
    if (!user?.id) return json({ error: "Не удалось подтвердить аккаунт." }, 401);

    const headers = { apikey: secret, Authorization: "Bearer " + secret };
    const userId = encodeURIComponent(user.id);
    const banResponse = await fetch(base + "/rest/v1/arvex_user_bans?user_id=eq." + userId + "&select=user_id&limit=1", { headers });
    if (!banResponse.ok) return json({ error: "Не удалось проверить ограничения аккаунта." }, 503);
    if ((await banResponse.json()).length) return json({ error: "Аккаунт заблокирован администратором." }, 403);

    const subscriptionResponse = await fetch(
      base + "/rest/v1/arvex_subscriptions?user_id=eq." + userId + "&select=starts_at,expires_at,is_forever&limit=1",
      { headers },
    );
    if (!subscriptionResponse.ok) return json({ error: "Не удалось проверить Premium-подписку." }, 503);
    const rows = await subscriptionResponse.json();
    const subscription = Array.isArray(rows) ? rows[0] : null;
    const now = Date.now();
    const startsAt = subscription?.starts_at ? Date.parse(subscription.starts_at) : NaN;
    const expiresAt = subscription?.expires_at ? Date.parse(subscription.expires_at) : NaN;
    const active = !!subscription && (
      subscription.is_forever === true ||
      (Number.isFinite(startsAt) && startsAt <= now && Number.isFinite(expiresAt) && expiresAt > now)
    );
    if (!active) return json({ error: "Для доступа необходима активная Premium-подписка." }, 403);
    return json({ lessons: MASTER_LESSONS, final: MASTER_FINAL, stress: MASTER_STRESS });
  } catch (error) {
    console.error("premium-academy:", error);
    return json({ error: "Не удалось загрузить материалы. Попробуй позже." }, 500);
  }
});
