import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const pass = (message) => console.log("OK:", message);

const html = read("index.html");
const localScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
const localStyles = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["']/gi)].map((m) => m[1]);

for (const src of [...localScripts, ...localStyles]) {
  if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("data:")) continue;
  const clean = src.split("?")[0].replace(/^\.\//, "");
  if (!fs.existsSync(path.join(root, clean))) fail(`index.html references missing asset: ${src}`);
}
if (!process.exitCode) pass("all local script and stylesheet references exist");

for (const name of fs.readdirSync(root).filter((n) => n.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (result.status !== 0) fail(`JavaScript syntax error in ${name}: ${result.stderr || result.stdout}`);
}
if (!process.exitCode) pass("all root JavaScript files pass node --check");

try { JSON.parse(read("manifest.webmanifest")); pass("manifest.webmanifest is valid JSON"); }
catch (error) { fail(`manifest.webmanifest is invalid: ${error.message}`); }

const cloudTests = spawnSync(process.execPath, [path.join(root, "scripts/test-cloud-sync.mjs")], { encoding: "utf8" });
if (cloudTests.status !== 0) fail(`Cloud sync regression tests failed: ${cloudTests.stderr || cloudTests.stdout}`);
else pass("cloud sync regression tests pass");

const config = read("cloud-config.js");
if (/service[_-]?role|sb_secret_/i.test(config)) fail("secret Supabase key pattern found in cloud-config.js");
else pass("cloud-config.js contains no service-role/secret-key pattern");

const clientCode = fs.readdirSync(root).filter((n) => n.endsWith(".js")).map((n) => read(n)).join("\\n");
if (/(?:api|fapi)\\/v\\d+\\/order\\b/i.test(clientCode)) fail("real exchange order endpoint found in client JavaScript");
else pass("client JavaScript contains no real exchange order endpoint");

const premium = read("premium.js");
const schema = read("backend/premium.sql");
for (const rpc of ["arvex_my_premium", "arvex_admin_is_admin", "arvex_admin_stats", "arvex_admin_history", "arvex_admin_search_users", "arvex_admin_set_subscription", "arvex_admin_revoke_subscription"]) {
  if (!premium.includes(rpc) || !schema.includes(rpc)) fail(`PREMIUM RPC mismatch or missing function: ${rpc}`);
}
if (!process.exitCode) pass("PREMIUM UI RPC names match the SQL schema");

if (html.includes('src="access.js"') || html.includes('src="shop-config.js"')) {
  fail("legacy one-time-access scripts must not be loaded alongside subscription PREMIUM");
} else pass("legacy one-time-access scripts are not loaded");

if (process.exitCode) process.exit(1);
console.log("ARVEX static validation completed.");
