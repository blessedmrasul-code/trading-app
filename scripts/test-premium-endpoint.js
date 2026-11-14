"use strict";
const fs = require("node:fs");
const config = fs.readFileSync("cloud-config.js", "utf8");
const url = config.match(/url:"([^"]+)"/)?.[1];
const apiKey = config.match(/anonKey:"([^"]+)"/)?.[1];
if (!url || !apiKey) throw new Error("Supabase public configuration is missing");

async function expectUnauthorized(label, authorization, body) {
  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  if (authorization) headers.Authorization = authorization;
  const response = await fetch(url.replace(/\/$/, "") + "/functions/v1/premium-academy", {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  if (response.status !== 401) {
    const detail = await response.text();
    throw new Error(label + " must be rejected with HTTP 401; got " + response.status + ": " + detail.slice(0, 300));
  }
}
(async () => {
  await expectUnauthorized("Anonymous request", null, {});
  await expectUnauthorized("Local Premium flag without a session", null, { isPremium: true, premium: true });
  await expectUnauthorized("Malformed JWT", "Bearer invalid.jwt.token", {});
  console.log("Premium endpoint rejects anonymous, local-flag-only, and malformed-token requests.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
