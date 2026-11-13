#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const lessonSource = read("lessons.js");
const examSource = read("exam.js");
const { LESSONS, EXAMS, buildExam } = vm.runInNewContext(
  lessonSource + "\n" + examSource + "\n;({ LESSONS, EXAMS, buildExam })",
  {}
);

assert.ok(LESSONS.length >= 20, `Expected at least 20 lessons, got ${LESSONS.length}`);
assert.equal(new Set(LESSONS.map((lesson) => lesson.id)).size, LESSONS.length, "Lesson IDs must be unique");
for (const lesson of LESSONS) {
  assert.ok(lesson.title && lesson.summary, `Lesson ${lesson.id} needs title and summary`);
  assert.ok(lesson.body.length >= 3, `Lesson ${lesson.id} needs substantive body sections`);
  assert.ok(lesson.points.length >= 3, `Lesson ${lesson.id} needs key takeaways`);
  assert.ok(lesson.quiz.length >= 3, `Lesson ${lesson.id} needs at least three quiz questions`);
  for (const q of lesson.quiz) {
    assert.ok(q.q && q.explain, `Lesson ${lesson.id} has an incomplete quiz question`);
    assert.ok(q.options.length >= 3, `Lesson ${lesson.id} question needs three options`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `Lesson ${lesson.id} has an invalid answer index`);
  }
}

for (const id of ["novice", "advanced", "expert"]) {
  const config = EXAMS[id];
  assert.ok(config, `Missing ${id} exam`);
  const uniquePool = new Set(config.pool().map((q) => q.q));
  assert.ok(uniquePool.size >= config.count, `${id} exam pool is smaller than its question count`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const questions = buildExam(id);
    assert.equal(questions.length, config.count, `${id} exam returned wrong question count`);
    assert.equal(new Set(questions.map((q) => q.q)).size, questions.length, `${id} exam contains duplicate questions`);
    for (const q of questions) {
      assert.ok(q.opts.length >= 3, `${id} exam question needs three options`);
      assert.equal(q.opts.filter((option) => option.ok).length, 1, `${id} exam question must have exactly one correct option`);
    }
  }
}

const css = read("style.css");
assert.ok(css.includes("textarea.field{display:block;color:var(--text)"), "Textarea must explicitly use readable foreground color");
assert.ok(css.includes("[hidden]{display:none!important}"), "The hidden attribute must override inline display styles");
const cloud = read("cloud.js");
assert.ok(cloud.includes('const GOOGLE_REDIRECT="app.arvex.trading://auth/callback"'), "Google OAuth must return to the ARVEX Android deep link");
assert.ok(cloud.includes('id="cloudGoogle"'), "Profile must render the Google sign-in button");
assert.ok(cloud.includes("startGoogleSignIn") && cloud.includes("acceptOAuthCallback"), "Google OAuth start and callback handlers must exist");
assert.ok(cloud.includes('/^\\S+@\\S+\\.\\S+$/'), "Password recovery must validate email with a working non-whitespace regex");
assert.ok(read("mobile/package.json").includes('"@capacitor/app"'), "Capacitor App plugin is required for native OAuth callbacks");
assert.ok(read("mobile/package.json").includes('"@capacitor/local-notifications"'), "Android system notifications plugin must be included");
assert.ok(read("mobile/capacitor-app-bridge.js").includes("LocalNotifications"), "Native notification plugin must be exposed to the app");
assert.ok(cloud.includes("deliverSystemNotifications") && cloud.includes("ARVEX_CAP_LOCAL_NOTIFICATIONS"), "Unread account notifications must be delivered to the Android notification center");
assert.ok(app.includes("ARVEX_CAP_LOCAL_NOTIFICATIONS") && app.includes("requestPermissions"), "Settings must request Android notification permission");
assert.ok(cloud.includes('setInterval(()=>{if(session)checkAccountStatus()},30000)'), "Active sessions must be rechecked for administrator bans periodically");

assert.ok(read("mobile/configure-android.js").includes('android:scheme="app.arvex.trading"'), "Android manifest must register the OAuth callback scheme");
assert.ok(!cloud.includes("blessedmrasul-code.github.io/trading-app"), "Email confirmation must not use the retired GitHub Pages redirect");
assert.ok(cloud.includes('req("/auth/v1/signup",{'), "Signup must rely on the Supabase project Site URL instead of a hard-coded redirect");
const sql = read("backend/supabase.sql");
assert.ok(!sql.includes("'subscription_expiry'"), "Expiry notifications must use a kind allowed by the notifications table constraint");
assert.ok(sql.includes("'subscription',\n      'subscription-expiry:'"), "Expiry notifications must use the supported subscription kind");
assert.ok(cloud.includes('document.addEventListener("submit"'), "Support form must use delegated submit handling");
assert.ok(cloud.includes('Prefer":"return=representation'), "Support creation must verify a returned row");
assert.ok(cloud.includes("arvex_admin_list_support_tickets"), "Admin support inbox must call the protected RPC");
assert.ok(cloud.includes("arvex_admin_set_support_status"), "Admin must be able to update ticket status");
const app = read("app.js");
assert.ok(app.includes("Cloud.accountHTML()"), "Profile must render cloud sign-in and registration controls");
assert.ok(app.includes("Access.cardHTML()"), "Profile must render the subscription purchase card");
assert.ok(app.includes("Cloud.userToolsHTML()"), "Profile must render promo codes and account tools");
const access = read("access.js");
assert.ok(cloud.includes('code_challenge_method","s256"'), "Google OAuth must use PKCE instead of exposing tokens in redirects");
assert.ok(cloud.includes('location.origin+location.pathname'), "Web Google OAuth must return to the current app route");
assert.ok(cloud.includes('app.arvex.trading://auth/callback'), "Android Google OAuth deep link must remain registered");
assert.ok(cloud.includes("arvex_my_account_status") && cloud.includes("arvexBanOverlay"), "Signed-in users must be checked for account bans and shown the block screen");
assert.ok(cloud.includes('arvex_my_account_status",{method:"POST",headers:hdr(tok),body:"{}"}'), "Ban status RPC must be called with its zero-argument signature");
assert.ok(cloud.includes("delete-own-account") && cloud.includes("arvexDeleteConfirm"), "Account deletion must use the protected server endpoint and explicit confirmation");
assert.ok(cloud.includes('body:JSON.stringify({confirm:"DELETE"})'), "Account deletion must send the confirmation required by the Edge Function");
assert.ok(cloud.includes("admin-user-ban") && cloud.includes("arvex_admin_list_bans") && cloud.includes("arvex_admin_ban_history"), "Creator panel must support audited ban and unban management");
assert.ok(app.includes("arvexSoundToggle") && app.includes("arvexVibrationToggle") && app.includes("arvexNotificationsToggle"), "Settings must expose notification, sound and vibration preferences");
assert.ok(read("mobile/build-web.js").includes("'offer.html'") && fs.existsSync(path.join(root,"offer.html")), "Android web bundle must include the Premium terms page");
assert.ok(read("mobile/package.json").includes('"@capacitor/browser": "8.0.0"'), "Native Google OAuth browser dependency must be pinned");
assert.ok(read("supabase/migrations/20261113120000_arvex_bans_and_account_controls.sql").includes("arvex_user_bans"), "Ban migration must exist");
assert.ok(read("supabase/functions/admin-user-ban/index.ts").includes("arvex_admin_record_ban"), "Ban and unban actions must be recorded by the admin-only RPC");
assert.ok(read("supabase/migrations/20261113120000_arvex_bans_and_account_controls.sql").includes("arvex_is_banned()"), "Banned accounts must be denied by database RLS");
assert.ok(read("supabase/functions/delete-own-account/index.ts").includes("/auth/v1/admin/users/"), "Self-service deletion must use the server-side Auth Admin API");
assert.ok(access.includes("link.hidden=active"), "Active Premium users must not see the purchase CTA");
const appHtml = read("app/index.html");
assert.ok(appHtml.includes('id="subscribeFooterLink"') && appHtml.includes('id="footerPremiumStatus"'), "Footer must switch to Premium status");
const manifest = JSON.parse(read("manifest.webmanifest"));
for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), `Missing PWA icon: ${icon.src}`);
assert.ok(fs.existsSync(path.join(root, "icon-512.png")), "Android launcher source icon is missing");
assert.ok(fs.existsSync(path.join(root, "mobile/apply-android-icons.sh")), "Android icon generation script is missing");

(async () => {
  let captured;
  const session = { access: "test-access", refresh: "test-refresh", exp: Date.now() + 60000, email: "test@example.invalid", uid: "00000000-0000-4000-8000-000000000001" };
  const storage = new Map([["arvex_cloud_session", JSON.stringify(session)]]);
  const context = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" } },
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    fetch: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 201, json: async () => [{ id: "ticket-test-id", status: "open" }] };
    }
  };
  const ticket = await vm.runInNewContext(cloud + "\n;Cloud.createSupport('Login issue', 'I cannot sign in to my account.');", context);
  assert.equal(ticket.id, "ticket-test-id", "Support request should return the created ticket");
  assert.equal(captured.options.method, "POST", "Support request must use POST");
  assert.equal(captured.options.headers.Authorization, "Bearer test-access", "Support request must use the signed-in session");
  assert.equal(captured.options.headers.Prefer, "return=representation", "Support request must request server confirmation");
  const body = JSON.parse(captured.options.body);
  assert.equal(body.user_id, session.uid, "Support ticket must be attached to the signed-in user");
  assert.equal(body.message, "I cannot sign in to my account.", "Support message must be preserved");

  const oauthStorage = new Map();
  const oauthLocation = { origin: "https://arvex.example", pathname: "/app/", search: "", hash: "", href: "https://arvex.example/app/" };
  const oauthContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" }, ARVEX_CAP_IS_NATIVE: () => false },
    location: oauthLocation,
    history: { replaceState() {} },
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: {
      getItem(key) { return oauthStorage.get(key) ?? null; },
      setItem(key, value) { oauthStorage.set(key, value); },
      removeItem(key) { oauthStorage.delete(key); }
    },
    crypto: require("node:crypto").webcrypto,
    TextEncoder,
    URL,
    URLSearchParams,
    btoa,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) })
  };
  await vm.runInNewContext(cloud + "\n;Cloud.startGoogleSignIn();", oauthContext);
  const oauthUrl = new URL(oauthLocation.href);
  assert.equal(oauthUrl.searchParams.get("provider"), "google", "Google OAuth must select the Google provider");
  assert.equal(oauthUrl.searchParams.get("redirect_to"), "https://arvex.example/app/", "Web OAuth must return to the app route");
  assert.equal(oauthUrl.searchParams.get("code_challenge_method"), "s256", "OAuth must use S256 PKCE");
  assert.ok(oauthUrl.searchParams.get("code_challenge"), "OAuth must send a PKCE challenge");
  assert.ok(oauthStorage.get("arvex_google_pkce_verifier"), "The PKCE verifier must be stored before redirect");
  assert.equal(oauthUrl.searchParams.has("flow_type"), false, "OAuth must not force the legacy implicit flow");


  const accountStorage = new Map([["arvex_cloud_session", JSON.stringify(session)]]);
  const accountRequests = [];
  const accountContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" } },
    document: { addEventListener() {}, getElementById() { return null; } },
    location: { hash: "", pathname: "/app/", search: "" },
    history: { replaceState() {} },
    localStorage: {
      getItem(key) { return accountStorage.get(key) ?? null; },
      setItem(key, value) { accountStorage.set(key, value); },
      removeItem(key) { accountStorage.delete(key); }
    },
    fetch: async (url, options = {}) => {
      accountRequests.push({ url, options });
      return { ok: true, status: 200, json: async () => url.includes("arvex_my_account_status") ? [{ is_banned: false }] : { ok: true } };
    },
    URL, URLSearchParams
  };
  await vm.runInNewContext(cloud + "\n;(async () => { await Cloud.checkAccountStatus(); await Cloud.deleteOwnAccount(); })();", accountContext);
  const statusRequest = accountRequests.find(x => x.url.includes("arvex_my_account_status"));
  assert.equal(statusRequest.options.body, "{}", "Account status RPC must be invoked without undeclared parameters");
  const deleteRequest = accountRequests.find(x => x.url.includes("functions/v1/delete-own-account"));
  assert.ok(deleteRequest, "Account deletion must call the protected Edge Function");
  assert.deepEqual(JSON.parse(deleteRequest.options.body), { confirm: "DELETE" }, "Account deletion must provide the required explicit confirmation");
  console.log(`ARVEX checks passed: ${LESSONS.length} lessons, ${Object.keys(EXAMS).length} exams, 30 randomized runs per exam, support submit, ban RPC, account deletion, and UI guards.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
