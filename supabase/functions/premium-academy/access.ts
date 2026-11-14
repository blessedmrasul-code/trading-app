export type PremiumSubscription = {
  starts_at?: string | null;
  expires_at?: string | null;
  is_forever?: boolean | null;
};

export function hasActivePremiumSubscription(
  subscription: PremiumSubscription | null | undefined,
  now = Date.now(),
): boolean {
  if (!subscription) return false;
  const startsAt = subscription.starts_at ? Date.parse(subscription.starts_at) : NaN;
  const expiresAt = subscription.expires_at ? Date.parse(subscription.expires_at) : NaN;
  return Number.isFinite(startsAt) && startsAt <= now && (
    subscription.is_forever === true ||
    (Number.isFinite(expiresAt) && expiresAt > now)
  );
}

export function hasActiveBan(rows: unknown): boolean {
  return !Array.isArray(rows) || rows.length > 0;
}
