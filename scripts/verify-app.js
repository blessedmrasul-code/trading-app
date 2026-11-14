#!/usr/bin/env node
// CI verification for the Premium server-side content gate.
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
const cloud = read("cloud.js");
const schoolSource = read("school.js");
const schoolLogic = schoolSource.slice(0, schoolSource.indexOf('window.addEventListener("DOMContentLoaded"'));
assert.ok(!schoolSource.includes("Архитектура риска: выживание серии"), "Premium lesson bodies must not be bundled in public school.js");
assert.ok(!schoolSource.includes("Капитал $20 000, риск 0,5%"), "Premium stress exam must not be bundled in public school.js");
for (const file of ["app.js", "lessons.js", "exam.js"]) {
  const source = read(file);
  assert.ok(!source.includes("Архитектура риска: выживание серии") && !source.includes("Капитал $20 000, риск 0,5%"), "Premium content leaked into " + file);
}
const premiumEndpoint = read("supabase/functions/premium-academy/index.ts");
assert.ok(premiumEndpoint.includes("/auth/v1/user") && premiumEndpoint.includes("arvex_user_bans") && premiumEndpoint.includes("arvex_subscriptions"), "Premium endpoint must validate JWT, bans, and subscription server-side");
assert.ok(premiumEndpoint.includes("arvex_premium_academy_content") && premiumEndpoint.includes("Cache-Control") && premiumEndpoint.includes("expires_at"), "Premium endpoint must load private database content and prevent caching");
assert.ok(cloud.includes("/functions/v1/premium-academy") && cloud.includes("masterclass()"), "Client must request Premium content from the authenticated endpoint");

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
const app = read("app.js");
assert.ok(app.includes("ARVEX_CAP_LOCAL_NOTIFICATIONS") && app.includes("requestPermissions"), "Settings must request Android notification permission");
assert.ok(app.includes("Cloud.loadNotifications()") && cloud.includes("loadNotifications()"), "Notifications must refresh when the app returns to the foreground");
assert.ok(cloud.includes('const AUTH_REDIRECT="app.arvex.trading://auth/callback"'), "Email confirmation and password recovery must return to the ARVEX app");
assert.ok(!cloud.includes('id="cloudGoogle"') && !cloud.includes("startGoogleSignIn"), "Google sign-in must be absent from the app");
assert.ok(app.includes("Cloud.acceptEmailConfirmation()") && cloud.includes("async function acceptEmailConfirmation"), "Email confirmation must be processed automatically during app initialization");
assert.ok(cloud.includes('req("/auth/v1/recover"') && cloud.includes("recoveryType"), "Password recovery must request an OTP and retain legacy native callback support");
assert.ok(!cloud.includes('req("/auth/v1/signup?redirect_to=') && !cloud.includes('req("/auth/v1/resend?redirect_to=') && !cloud.includes('req("/auth/v1/recover?redirect_to='), "Registration, resend and password recovery OTP requests must not force a website redirect");
assert.ok(cloud.includes("cleanAuthCallbackUrl") && cloud.includes('searchParams.delete(key)'), "Auth callback tokens and error parameters must be removed from browser history");


assert.ok(cloud.includes('setAttribute("aria-modal","true")') && cloud.includes("child.inert=true") && cloud.includes('e.key==="Tab"'), "Ban overlay must trap keyboard focus and disable background controls");
assert.ok(cloud.includes('id="arvexBanAppeal"') && cloud.includes("Mrasulv"), "Ban overlay must show the administrator and provide an appeal link");
assert.ok(!cloud.includes("async function exitBlockedApp(){\n  await signOut();"), "Leaving a ban screen must not sign the blocked user out and enable guest bypass");
assert.ok(cloud.includes('browser.open({url:appealLink.href})'), "Android ban appeals must open in the system browser");

assert.ok(cloud.includes('/^\\S+@\\S+\\.\\S+$/'), "Password recovery must validate email with a working non-whitespace regex");
assert.ok(cloud.includes("/auth/v1/resend") && cloud.includes("resendConfirmation"), "Unconfirmed users must be able to request a fresh confirmation email");
assert.ok(cloud.includes("/auth/v1/verify") && cloud.includes("cloudEmailCode") && cloud.includes("verifyEmailCode"), "Users must be able to confirm email with an in-app six-digit OTP");
assert.ok(cloud.includes("id=\"cloudResend\"") && cloud.includes("id=\"cloudVerifyCode\""), "The account screen must expose resend and OTP verification controls");
assert.ok(read("mobile/package.json").includes('"@capacitor/app"'), "Capacitor App plugin is required for native email-confirmation and recovery callbacks");
assert.ok(read("mobile/package.json").includes('"@capacitor/local-notifications"'), "Android system notifications plugin must be included");
assert.ok(read("mobile/capacitor-app-bridge.js").includes("LocalNotifications"), "Native notification plugin must be exposed to the app");
assert.ok(cloud.includes("deliverSystemNotifications") && cloud.includes("ARVEX_CAP_LOCAL_NOTIFICATIONS"), "Unread account notifications must be delivered to the Android notification center");
assert.ok(cloud.includes('setInterval(()=>{if(session)loadNotifications()},60000)'), "Unread notifications must be polled while a signed-in user is active");

assert.ok(cloud.includes("createChannel") && cloud.includes("arvex_notification.wav"), "Android notification channels must respect sound and vibration preferences");
assert.ok(read("mobile/configure-android.js").includes("arvex_notification.wav"), "Android build must generate the bundled ARVEX notification sound");

assert.ok(cloud.includes('setInterval(()=>{if(session)checkAccountStatus()},30000)'), "Active sessions must be rechecked for administrator bans periodically");

assert.ok(read("mobile/configure-android.js").includes('android:scheme="app.arvex.trading"'), "Android manifest must register the app callback scheme for email confirmation and recovery");
assert.ok(!cloud.includes("blessedmrasul-code.github.io/trading-app"), "Email confirmation must not use the retired GitHub Pages redirect");
assert.ok(cloud.includes('req("/auth/v1/signup"') && cloud.includes('req("/auth/v1/resend"'), "Signup and resend must use in-app OTP requests without redirect URLs");
assert.ok(cloud.includes('type:"recovery",email:e,token:pin') && cloud.includes('type:"signup",email:e,token:pin') && cloud.includes('/^\\d{8}$/') && cloud.includes('maxlength="8"'), "Password recovery must accept eight-digit OTPs while signup keeps its separate six-digit flow");
assert.ok(cloud.includes("async function acceptEmailConfirmation") && cloud.includes("handleAuthDeepLink"), "Email confirmation must automatically sign the user back into the app");
const sql = read("backend/supabase.sql");
assert.ok(!sql.includes("'subscription_expiry'"), "Expiry notifications must use a kind allowed by the notifications table constraint");
assert.ok(sql.includes("'subscription',\n      'subscription-expiry:'"), "Expiry notifications must use the supported subscription kind");
assert.ok(cloud.includes('document.addEventListener("submit"'), "Support form must use delegated submit handling");
assert.ok(cloud.includes('Prefer":"return=representation'), "Support creation must verify a returned row");
assert.ok(cloud.includes("arvex_admin_list_support_tickets"), "Admin support inbox must call the protected RPC");
assert.ok(cloud.includes("arvex_admin_set_support_status"), "Admin must be able to update ticket status");
assert.ok(app.includes("Cloud.accountHTML()"), "Profile must render cloud sign-in and registration controls");
assert.ok(app.includes("Access.cardHTML()"), "Profile must render the subscription purchase card");
assert.ok(app.includes("Cloud.userToolsHTML()"), "Profile must render promo codes and account tools");
const access = read("access.js");
assert.ok(cloud.includes("arvex_my_account_status") && cloud.includes("arvexBanOverlay"), "Signed-in users must be checked for account bans and shown the block screen");
assert.ok(cloud.includes("LOCAL_OWNER_KEY") && cloud.includes("LOCAL_RESET_KEY"), "Local progress must be isolated when users switch accounts");
assert.ok(cloud.includes("info.administrator||'Mrasulv'"), "Ban screen must display the administrator recorded by the server");
assert.ok(read("supabase/migrations/20261113111418_arvex_ban_issuer_identity.sql").includes("admin_user.id=e.admin_id"), "Ban audit must identify the actual administrator who issued each action");
assert.ok(cloud.includes('arvex_my_account_status",{method:"POST",headers:hdr(tok),body:"{}"}'), "Ban status RPC must be called with its zero-argument signature");
assert.ok(cloud.includes("delete-own-account") && cloud.includes("arvexDeleteConfirm"), "Account deletion must use the protected server endpoint and explicit confirmation");
assert.ok(cloud.includes('body:JSON.stringify({confirm:"DELETE"})'), "Account deletion must send the confirmation required by the Edge Function");
assert.ok(cloud.includes("admin-user-ban") && cloud.includes("arvex_admin_list_bans") && cloud.includes("arvex_admin_ban_history"), "Creator panel must support audited ban and unban management");
assert.ok(app.includes("arvexSoundToggle") && app.includes("arvexVibrationToggle") && app.includes("arvexNotificationsToggle"), "Settings must expose notification, sound and vibration preferences");
assert.ok(read("mobile/build-web.js").includes("'offer.html'") && fs.existsSync(path.join(root,"offer.html")), "Android web bundle must include the Premium terms page");
assert.ok(read("mobile/package.json").includes('"@capacitor/browser": "8.0.0"'), "Capacitor browser dependency must remain pinned for external app links");
assert.ok(read("supabase/migrations/20261113110431_arvex_bans_and_account_controls.sql").includes("arvex_user_bans"), "Ban migration must exist");

const notificationGrants = read("supabase/migrations/20261113111707_arvex_notifications_privileges_hardening.sql");
assert.ok(notificationGrants.includes("revoke all on table public.arvex_notifications from public, anon, authenticated"), "Anonymous users must have no direct notification table privileges");
assert.ok(notificationGrants.includes("grant select, update on table public.arvex_notifications to authenticated"), "Signed-in users may only read and mark their own notifications; RLS enforces row ownership");

const supportGrants = read("supabase/migrations/20261113111747_arvex_support_ticket_privileges_hardening.sql");
assert.ok(supportGrants.includes("revoke all on table public.arvex_support_tickets from public, anon, authenticated"), "Anonymous users must not access support ticket storage");
assert.ok(supportGrants.includes("grant select, insert on table public.arvex_support_tickets to authenticated"), "Users may only create and read support tickets; admin RPCs handle moderation");

const notificationColumnGrants = read("supabase/migrations/20261113111825_arvex_notification_column_privileges.sql");
assert.ok(notificationColumnGrants.includes("grant update (read_at) on table public.arvex_notifications to authenticated"), "Users must not edit notification content or ownership");



assert.ok(read("supabase/functions/admin-user-ban/index.ts").includes("arvex_admin_record_ban"), "Ban and unban actions must be recorded by the admin-only RPC");
assert.ok(read("supabase/migrations/20261113110431_arvex_bans_and_account_controls.sql").includes("arvex_is_banned()"), "Banned accounts must be denied by database RLS");
assert.ok(read("supabase/functions/delete-own-account/index.ts").includes("/auth/v1/admin/users/"), "Self-service deletion must use the server-side Auth Admin API");
assert.ok(read("supabase/functions/delete-own-account/index.ts").includes("arvex_user_bans") && read("supabase/functions/delete-own-account/index.ts").includes("Аккаунт заблокирован"), "Banned users must not bypass their restriction by deleting the account");
assert.ok(access.includes("link.hidden=active"), "Active Premium users must not see the purchase CTA");
const appHtml = read("app/index.html");

assert.ok(appHtml.indexOf('src="cloud.js"') < appHtml.indexOf('src="app.js"'), "Cloud auth must load before app initialization");
assert.ok(appHtml.indexOf('src="access.js"') < appHtml.indexOf('src="app.js"'), "Premium entitlement must load before app initialization");

assert.ok(appHtml.includes('id="subscribeFooterLink"') && appHtml.includes('id="footerPremiumStatus"'), "Footer must switch to Premium status");
const premium = read("premium.js");
assert.ok(appHtml.includes('data-go="premium"') && appHtml.includes('id="screen-premium"') && appHtml.includes('id="premiumBody"'), "ARVEX Premium screen must be reachable from navigation");
assert.ok(read("mobile/build-web.js").includes("'premium.js'"), "Android web bundle must include the Premium module");
assert.ok(read("shop-config.js").includes('"pro_analytics"') && read("shop-config.js").includes('"pro_risk_lab"') && read("shop-config.js").includes('"pro_journal"') && read("shop-config.js").includes('"pro_watchlist"'), "Premium feature gates must be configured");
assert.ok(access.includes("locked=f=>") && access.includes("isPremium()"), "Premium access must depend on the server entitlement state");
assert.ok(premium.includes("PREMIUM_KEYS.every(feature => !Access.locked(feature))"), "Every PRO tool must require the matching server entitlement feature gate");
for (const feature of ["RSI","EMA","MACD","Боллинджера","Риск-лаборатория","Торговый дневник","Избранные рынки","Profit factor"]) assert.ok(premium.includes(feature), `Premium module is missing ${feature}`);
assert.ok(premium.includes("localStorage.getItem(\"arvex_local_state_owner\")"), "Premium journal and watchlist must be isolated by account owner");
assert.ok(premium.includes("escapeHTML(entry.body)"), "User journal text must be HTML-escaped before rendering");

const school = schoolSource;
assert.ok(appHtml.includes('data-premium-purchase') && appHtml.includes('https://t.me/ArvexPremiumBot'), "Footer Premium CTA must target the official Telegram bot");
assert.ok(access.includes('t.closest("[data-premium-purchase]")') && access.includes("openBotPurchase"), "Premium purchase actions must open the bot and create a personalized invoice for signed-in users");
assert.ok(access.includes('browser.open({url})') && access.includes("isNativeApp()"), "Android Premium checkout must open Telegram externally through Capacitor Browser");
assert.ok(access.includes("!Cloud.createStarsBotLink"), "Premium payment must validate the exact bot-link function it calls");
assert.ok(premium.includes('id="proUpgrade"') && !premium.includes('goProfile();return;'), "Premium main CTA must not redirect users to Profile");
assert.ok(appHtml.includes('data-tab="masterclass"') && school.includes("masterData.lessons") && school.includes("loadMasterclassData"), "Premium school must load creator lessons from the authenticated server endpoint");
assert.ok(school.includes("Access.isPremium()") && school.includes("masterSubmit"), "Creator masterclass and exams must be gated by server-verified Premium");
const premiumGate = vm.runInNewContext(
  lessonSource + "\n" + examSource + "\n" + schoolLogic + "\n;({ masterclassHTML })",
  { Access: { isPremium: () => false } }
);
const lockedMasterclass = premiumGate.masterclassHTML();
assert.ok(lockedMasterclass.includes("Доступ открывается после подтверждения Premium на сервере"), "Creator academy must remain locked without server-confirmed Premium");
assert.ok(!lockedMasterclass.includes("Архитектура риска: выживание серии"), "Locked academy must not render Premium lesson content");
assert.ok(app.includes("masterclass:{}") && app.includes("masterclass:{...(s.progress.masterclass||{})}"), "Creator masterclass progress must persist without resetting existing progress");
assert.ok(app.includes('Access.refresh().then(()=>{if(typeof schoolTab!=="undefined"&&schoolTab==="masterclass"'), "Premium entitlement must refresh when the app returns from Telegram payment");
assert.ok(cloud.includes("/functions/v1/admin-user-ban") && cloud.includes("data-admin-unban-user"), "Admin must be able to ban and unban accounts");
assert.ok(cloud.includes("arvex_admin_set_subscription") && cloud.includes("arvex_admin_revoke_subscription"), "Admin panel must grant, extend and revoke Premium");
assert.ok(cloud.includes("data-admin-grant-user") && cloud.includes("data-admin-revoke-user"), "Admin search results must expose Premium management controls");
assert.ok(!cloud.includes("Google") && !app.includes("Продолжить с Google") && !app.includes("Continue with Google"), "Google sign-in must be fully removed from ARVEX");

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

  const notificationStorage = new Map([
    ["arvex_notifications_enabled", "true"],
    ["arvex_sound_enabled", "true"],
    ["arvex_vibration_enabled", "false"]
  ]);
  let notificationChannel = null;
  const scheduledNotifications = [];
  const notificationPlugin = {
    async checkPermissions() { return { display: "granted" }; },
    async createChannel(channel) { notificationChannel = channel; },
    async schedule(options) { scheduledNotifications.push(...options.notifications); }
  };
  const notificationContext = {
    window: { ARVEX_CAP_IS_NATIVE: () => true, ARVEX_CAP_LOCAL_NOTIFICATIONS: notificationPlugin },
    document: { addEventListener() {}, getElementById() { return null; } },
    location: { hash: "", pathname: "/app/", search: "" },
    localStorage: {
      getItem(key) { return notificationStorage.get(key) ?? null; },
      setItem(key, value) { notificationStorage.set(key, value); },
      removeItem(key) { notificationStorage.delete(key); }
    }
  };
  const unreadNotification = { id: "00000000-0000-4000-8000-000000000123", title: "ARVEX test", body: "Notification delivery test", read_at: null };
  await vm.runInNewContext(cloud + "\n;Cloud.deliverSystemNotifications([unreadNotification]);", { ...notificationContext, unreadNotification });
  assert.equal(notificationChannel.sound, "arvex_notification.wav", "Sound preference must select the sound-enabled Android channel");
  assert.equal(notificationChannel.vibration, false, "Vibration preference must be applied to the Android channel");
  assert.equal(scheduledNotifications.length, 1, "One unread notification should be scheduled");
  assert.equal(scheduledNotifications[0].channelId, "arvex-notifications-s1-v0", "Notification must use the matching sound/vibration channel");
  await vm.runInNewContext(cloud + "\n;Cloud.deliverSystemNotifications([unreadNotification]);", { ...notificationContext, unreadNotification });
  assert.equal(scheduledNotifications.length, 1, "Delivered notifications must not be scheduled twice");
  const deniedStorage = new Map([
    ["arvex_cloud_session", JSON.stringify({ access: "test-access", refresh: "test-refresh", exp: Date.now() + 3600000, uid: "notify-user", email: "notify@example.com" })],
    ["arvex_notifications_enabled", "true"]
  ]);
  let deniedNotificationReadUpdates = 0;
  const deniedContext = {
    window: {
      ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" },
      ARVEX_CAP_IS_NATIVE: () => true,
      ARVEX_CAP_LOCAL_NOTIFICATIONS: { async checkPermissions() { return { display: "denied" }; }, async schedule() {} }
    },
    document: { addEventListener() {}, getElementById() { return null; } },
    location: { href: "https://arvex.example/app/", hash: "", pathname: "/app/", search: "" },
    localStorage: {
      getItem(key) { return deniedStorage.get(key) ?? null; },
      setItem(key, value) { deniedStorage.set(key, value); },
      removeItem(key) { deniedStorage.delete(key); }
    },
    fetch: async (url, options = {}) => {
      if (options.method === "PATCH") deniedNotificationReadUpdates++;
      return { ok: true, status: 200, json: async () => url.includes("/arvex_notifications?") ? [unreadNotification] : {} };
    },
    URL, URLSearchParams
  };
  await vm.runInNewContext(cloud + "\n;Cloud.loadNotifications();", deniedContext);
  assert.equal(deniedNotificationReadUpdates, 0, "Notifications without permission must remain unread when the notifications panel is not open");


  const pollingStorage = new Map([
    ["arvex_cloud_session", JSON.stringify(session)],
    ["arvex_notifications_enabled", "true"],
    ["arvex_sound_enabled", "true"],
    ["arvex_vibration_enabled", "false"]
  ]);
  const pollingRequests = [];
  const pollingScheduled = [];
  const pollingPlugin = {
    async checkPermissions() { return { display: "granted" }; },
    async createChannel() {},
    async schedule(options) { pollingScheduled.push(...options.notifications); }
  };
  const pollingContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" }, ARVEX_CAP_IS_NATIVE: () => true, ARVEX_CAP_LOCAL_NOTIFICATIONS: pollingPlugin },
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: {
      getItem(key) { return pollingStorage.get(key) ?? null; },
      setItem(key, value) { pollingStorage.set(key, value); },
      removeItem(key) { pollingStorage.delete(key); }
    },
    fetch: async (url, options = {}) => {
      pollingRequests.push({ url, options });
      return { ok: true, status: 200, json: async () => url.includes("?select=") ? [unreadNotification] : null };
    }
  };
  await vm.runInNewContext(cloud + "\n;Cloud.loadNotifications();", { ...pollingContext, unreadNotification });
  assert.equal(pollingScheduled.length, 1, "Unread notifications must be scheduled even when the profile panel is not open");
  const readReceipt = pollingRequests.find(x => x.options.method === "PATCH");
  assert.ok(readReceipt && readReceipt.url.includes("user_id=eq." + session.uid), "Read receipts must be scoped to the signed-in user");
  assert.ok(JSON.parse(readReceipt.options.body).read_at, "Notification read receipt must be timestamped");

  const disabledNotificationStorage = new Map([
    ["arvex_cloud_session", JSON.stringify(session)],
    ["arvex_notifications_enabled", "false"]
  ]);
  const disabledNotificationRequests = [];
  const disabledNotificationContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" } },
    document: { addEventListener() {}, getElementById() { return null; } },
    localStorage: {
      getItem(key) { return disabledNotificationStorage.get(key) ?? null; },
      setItem(key, value) { disabledNotificationStorage.set(key, value); },
      removeItem(key) { disabledNotificationStorage.delete(key); }
    },
    fetch: async (url, options = {}) => {
      disabledNotificationRequests.push({ url, options });
      return { ok: true, status: 200, json: async () => [unreadNotification] };
    }
  };
  await vm.runInNewContext(cloud + "\n;Cloud.loadNotifications();", { ...disabledNotificationContext, unreadNotification });
  assert.equal(disabledNotificationRequests.some(x => x.options.method === "PATCH"), false, "Disabled notifications must remain unread until the user sees them");

  const otpStorage = new Map();
  const otpRequests = [];
  const otpContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" }, ARVEX_CAP_IS_NATIVE: () => false },
    document: { addEventListener() {}, getElementById() { return null; } },
    location: { href: "https://arvex.example/app/", origin: "https://arvex.example", pathname: "/app/", search: "", hash: "" },
    history: { replaceState() {} },
    localStorage: {
      getItem(key) { return otpStorage.get(key) ?? null; },
      setItem(key, value) { otpStorage.set(key, value); },
      removeItem(key) { otpStorage.delete(key); }
    },
    fetch: async (url, options = {}) => {
      otpRequests.push({ url, options });
      if (url.includes("/auth/v1/verify")) return { ok: true, status: 200, json: async () => ({ access_token: "otp-access", refresh_token: "otp-refresh", expires_in: 3600, user: { id: "otp-user", email: "otp@example.invalid" } }) };
      if (url.includes("arvex_my_account_status")) return { ok: true, status: 200, json: async () => [{ is_banned: false }] };
      if (url.includes("/arvex_saves?")) return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => ({}) };
    },
    renderTop() {}, renderTicker() {}, renderHead() {}, renderPositions() {}, renderPortfolio() {}, renderProfile() {},
    activeScreen: "profile", URL, URLSearchParams
  };
  await vm.runInNewContext(cloud + "\n;(async () => { await Cloud.resendConfirmation('otp@example.invalid'); await Cloud.verifyEmailCode('otp@example.invalid', '123456'); })();", otpContext);
  const resendRequest = otpRequests.find(x => x.url.includes("/auth/v1/resend"));
  assert.ok(resendRequest, "Resend must call Supabase Auth resend endpoint");
  assert.deepEqual(JSON.parse(resendRequest.options.body), { type: "signup", email: "otp@example.invalid" }, "Resend must target the pending signup email");
  const verifyRequest = otpRequests.find(x => x.url.includes("/auth/v1/verify"));
  assert.deepEqual(JSON.parse(verifyRequest.options.body), { type: "signup", email: "otp@example.invalid", token: "123456" }, "OTP verification must send the email and six-digit signup token");
  assert.equal(JSON.parse(otpStorage.get("arvex_cloud_session")).uid, "otp-user", "A valid email OTP must establish the signed-in session");

  const emailConfirmStorage = new Map();
  const emailConfirmMessage = { textContent: "" };
  let emailConfirmCleanedUrl = "";
  let emailConfirmCallback = null;
  const emailConfirmHash = "#type=signup&access_token=email-access&refresh_token=email-refresh&expires_in=3600";
  const emailConfirmContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" }, ARVEX_CAP_IS_NATIVE: () => false },
    location: { href: "https://arvex.example/app/" + emailConfirmHash, origin: "https://arvex.example", pathname: "/app/", search: "", hash: emailConfirmHash },
    setTimeout(callback) { emailConfirmCallback = callback; return 1; },
    history: { replaceState(_state, _title, url) { emailConfirmCleanedUrl = url; } },
    document: { addEventListener() {}, getElementById(id) { return id === "cloudMsg" ? emailConfirmMessage : null; } },
    localStorage: {
      getItem(key) { return emailConfirmStorage.get(key) ?? null; },
      setItem(key, value) { emailConfirmStorage.set(key, value); },
      removeItem(key) { emailConfirmStorage.delete(key); }
    },
    fetch: async (url) => ({
      ok: true, status: 200,
      json: async () => url.includes("/auth/v1/user")
        ? { id: "verified-user", email: "verified@example.invalid" }
        : url.includes("arvex_my_account_status")
          ? [{ is_banned: false }]
          : []
    }),
    URL, URLSearchParams
  };
  await vm.runInNewContext(cloud + "\n;", emailConfirmContext);
  assert.equal(typeof emailConfirmCallback, "function", "Web email confirmation callback must be detected automatically on app startup");
  await emailConfirmCallback();
  const confirmedSession = JSON.parse(emailConfirmStorage.get("arvex_cloud_session"));
  assert.equal(confirmedSession.uid, "verified-user", "Email confirmation must create a signed-in session automatically");
  assert.equal(emailConfirmCleanedUrl, "/app/", "Email confirmation tokens must be removed from the address bar");
  assert.match(emailConfirmMessage.textContent, /Email подтверждён/, "The app must confirm successful email verification");

  const blockedSessionStorage = new Map([["arvex_cloud_session", JSON.stringify(session)]]);
  let blockedExitCalls = 0;
  const blockedExitContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" }, ARVEX_CAP_IS_NATIVE: () => true, ARVEX_CAP_APP: { addListener() {}, getLaunchUrl() { return Promise.resolve(null); }, exitApp() { blockedExitCalls++; } } },
    document: { addEventListener() {}, getElementById() { return null; } },
    location: { href: "https://arvex.example/app/", pathname: "/app/", search: "", hash: "", replace() {} },
    localStorage: {
      getItem(key) { return blockedSessionStorage.get(key) ?? null; },
      setItem(key, value) { blockedSessionStorage.set(key, value); },
      removeItem(key) { blockedSessionStorage.delete(key); }
    },
    URL, URLSearchParams, setTimeout() { return 0; }, clearTimeout() {}, console: { warn() {} }
  };
  await vm.runInNewContext(cloud + "\n;Cloud.exitBlockedApp();", blockedExitContext);
  assert.equal(blockedExitCalls, 1, "Ban screen exit must close the Android app");
  assert.equal(blockedSessionStorage.has("arvex_cloud_session"), true, "Exiting a ban screen must preserve the blocked session for the next launch");

  const recoveryStorage = new Map();
  const recoveryVerifyBodies = [];
  let recoverySheetOpened = 0;
  const recoveryContext = {
    window: { ARVEX_CLOUD: { url: "https://example.supabase.co", anonKey: "public-test-key" } },
    document: { addEventListener() {}, getElementById() { return null; } },
    location: { href: "https://arvex.example/app/", hash: "", pathname: "/app/", search: "" },
    history: { replaceState() {} },
    localStorage: {
      getItem(key) { return recoveryStorage.get(key) ?? null; },
      setItem(key, value) { recoveryStorage.set(key, value); },
      removeItem(key) { recoveryStorage.delete(key); }
    },
    fetch: async (url, options = {}) => {
      if (url.includes("/auth/v1/verify")) {
        recoveryVerifyBodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ access_token: "verified-access", refresh_token: "verified-refresh", expires_in: 3600, user: { id: "recovery-user", email: "recovery@example.com" } }) };
      }
      return { ok: true, status: 200, json: async () => url.includes("/auth/v1/user")
        ? { id: "recovery-user", email: "recovery@example.com" }
        : [{ is_banned: false }] };
    },
    setTimeout(callback) { callback(); return 1; },
    openSheet() { recoverySheetOpened++; },
    URL, URLSearchParams
  };
  const recoveryUrl = "app.arvex.trading://auth/callback#access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600&type=recovery";
  await vm.runInNewContext(cloud + "\n;(async () => { await Cloud.acceptRecoveryCallback(" + JSON.stringify(recoveryUrl) + "); await Cloud.verifyRecoveryCode(\"recovery@example.com\", \"12345678\"); })();", recoveryContext);
  assert.deepEqual(recoveryVerifyBodies[0], { type: "recovery", email: "recovery@example.com", token: "12345678" }, "Password recovery must send all eight digits to Supabase");
  assert.equal(recoverySheetOpened, 2, "Android password recovery must open the new-password form after callback and OTP verification");
  assert.equal(JSON.parse(recoveryStorage.get("arvex_cloud_session")).uid, "recovery-user", "Password recovery callback must establish the verified session");
  console.log(`ARVEX checks passed: ${LESSONS.length} lessons, ${Object.keys(EXAMS).length} standard exams, ${MASTER_LESSONS.length} creator lessons, ${MASTER_FINAL.length} final questions, ${MASTER_STRESS.length} stress questions, 30 randomized runs per standard exam, support submit, bans/unbans, Premium grants/revokes, payment routing, account deletion, notifications, and auth recovery.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
