import { hasActiveBan, hasActivePremiumSubscription } from "../supabase/functions/premium-academy/access.ts";

const now = Date.parse("2026-11-14T12:00:00.000Z");
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("active monthly Premium is accepted", () => {
  assert(hasActivePremiumSubscription({
    starts_at: "2026-11-01T00:00:00.000Z",
    expires_at: "2026-12-01T00:00:00.000Z",
    is_forever: false,
  }, now), "active subscription should be accepted");
});
Deno.test("expired Premium is rejected", () => {
  assert(!hasActivePremiumSubscription({
    starts_at: "2026-10-01T00:00:00.000Z",
    expires_at: "2026-11-13T00:00:00.000Z",
    is_forever: false,
  }, now), "expired subscription must be rejected");
});
Deno.test("future-start Premium is rejected", () => {
  assert(!hasActivePremiumSubscription({
    starts_at: "2026-11-15T00:00:00.000Z",
    expires_at: "2026-12-15T00:00:00.000Z",
    is_forever: false,
  }, now), "subscription that has not started must be rejected");
});
Deno.test("lifetime Premium requires a valid start date", () => {
  assert(hasActivePremiumSubscription({
    starts_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
    is_forever: true,
  }, now), "valid lifetime subscription should be accepted");
  assert(!hasActivePremiumSubscription({
    starts_at: null,
    expires_at: null,
    is_forever: true,
  }, now), "lifetime flag without start date must be rejected");
});
Deno.test("missing subscription is rejected", () => {
  assert(!hasActivePremiumSubscription(null, now), "missing subscription must be rejected");
});
Deno.test("ban rows are handled fail-closed", () => {
  assert(hasActiveBan([{ user_id: "test" }]), "existing ban row must block access");
  assert(!hasActiveBan([]), "empty ban result must allow next authorization check");
  assert(hasActiveBan(null), "malformed ban response must block access");
});
