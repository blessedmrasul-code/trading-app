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
assert.ok(!cloud.includes("blessedmrasul-code.github.io/trading-app"), "Email confirmation must not use the retired GitHub Pages redirect");
assert.ok(cloud.includes('req("/auth/v1/signup",{'), "Signup must rely on the Supabase project Site URL instead of a hard-coded redirect");
const sql = read("backend/supabase.sql");
assert.ok(!sql.includes("'subscription_expiry'"), "Expiry notifications must use a kind allowed by the notifications table constraint");
assert.ok(sql.includes("'subscription',\n      'subscription-expiry:'"), "Expiry notifications must use the supported subscription kind");
assert.ok(cloud.includes('document.addEventListener("submit"'), "Support form must use delegated submit handling");
assert.ok(cloud.includes('Prefer":"return=representation'), "Support creation must verify a returned row");
assert.ok(cloud.includes("arvex_admin_list_support_tickets"), "Admin support inbox must call the protected RPC");
assert.ok(cloud.includes("arvex_admin_set_support_status"), "Admin must be able to update ticket status");
assert.ok(cloud.includes('async function requestPasswordReset(email)'), "Password recovery request must be implemented");
assert.ok(cloud.includes('if(!/^\\S+@\\S+\\.\\S+$/.test(clean))'), "Password recovery must validate email addresses");
assert.ok(cloud.includes('/auth/v1/recover?redirect_to='), "Password recovery must pass an explicit return URL");
assert.ok(cloud.includes('"?auth=recovery"'), "Password recovery must return to the in-app recovery route");
assert.ok(cloud.includes('params.get("type")!=="recovery"') && cloud.includes('params.get("access_token")'), "Recovery route must accept only Supabase recovery sessions");
assert.ok(cloud.includes('req("/auth/v1/user",{method:"PUT"') && cloud.includes('JSON.stringify({password})'), "New password must be saved through Supabase Auth");
assert.ok(cloud.includes('id="cloudForgot"'), "Login form must expose the forgot-password action");
assert.ok(cloud.includes('id="arvexLanguage"') && cloud.includes('localStorage.setItem("arvex_language"'), "Language preference must be selectable and persistent");

const access = read("access.js");
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

  console.log(`ARVEX checks passed: ${LESSONS.length} lessons, ${Object.keys(EXAMS).length} exams, 30 randomized runs per exam, support submit and UI guards.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
