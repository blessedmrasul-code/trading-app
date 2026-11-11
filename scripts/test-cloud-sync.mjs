import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "cloud.js"), "utf8");

async function scenario({ local, remote, expectedMode }) {
  const values = new Map([
    ["arvex_cloud_session", JSON.stringify({
      access: "test-access-token",
      refresh: "test-refresh-token",
      exp: Date.now() + 60 * 60 * 1000,
      email: "tester@example.com",
      uid: "11111111-1111-4111-8111-111111111111"
    })],
    ["arvex_v3_state", JSON.stringify(local)]
  ]);
  const pushes = [];
  let loaded = 0, rendered = 0;

  const context = {
    window: {
      ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "sb_publishable_test" },
      dispatchEvent() {}
    },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    fetch: async (url, options = {}) => {
      if (String(url).includes("/rest/v1/arvex_saves?user_id=")) {
        return { ok: true, json: async () => remote ? [{ data: remote, updated_at: new Date().toISOString() }] : [] };
      }
      if (String(url).includes("/rest/v1/arvex_saves?on_conflict=user_id")) {
        pushes.push(JSON.parse(options.body));
        return { ok: true, json: async () => null };
      }
      throw new Error("Unexpected test request: " + url);
    },
    Event: class Event {},
    STORAGE_KEY: "arvex_v3_state",
    activeScreen: "trade",
    loadState() { loaded++; },
    renderTop() { rendered++; },
    renderTicker() {}, renderHead() {}, renderPositions() {},
    renderPortfolio() {}, renderSchool() {}, renderProfile() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    Date,
    console
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "cloud.js" });
  const cloud = vm.runInContext("Cloud", context);
  await cloud.sync();

  const stored = JSON.parse(values.get("arvex_v3_state"));
  if (expectedMode === "pull") {
    assert.deepEqual(stored, remote, "newer cloud state should replace older local state");
    assert.equal(pushes.length, 0, "newer cloud state must not be overwritten");
    assert.equal(loaded, 1, "app state should reload after pulling cloud data");
    assert.equal(rendered, 1, "UI should rerender after pulling cloud data");
  } else {
    assert.deepEqual(stored, local, "newer local state must remain intact");
    assert.equal(pushes.length, 1, "local state should be pushed to cloud");
    assert.deepEqual(pushes[0].data, local, "the exact local state should be uploaded");
  }
}

await scenario({
  local: { updatedAt: 100, balance: 9000, marker: "local-old" },
  remote: { updatedAt: 200, balance: 12000, marker: "cloud-new" },
  expectedMode: "pull"
});
await scenario({
  local: { updatedAt: 300, balance: 8000, marker: "local-new" },
  remote: { updatedAt: 200, balance: 12000, marker: "cloud-old" },
  expectedMode: "push"
});
await scenario({
  local: { updatedAt: 200, balance: 7000, marker: "local-tie" },
  remote: { updatedAt: 200, balance: 12000, marker: "cloud-tie" },
  expectedMode: "push"
});
console.log("Cloud sync regression tests passed (newer cloud, newer local, equal timestamps).");
