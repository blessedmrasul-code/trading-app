"use strict";
const fs = require("node:fs");
const path = require("node:path");

const gradleFile = path.resolve(__dirname, "android/app/build.gradle");
if (fs.existsSync(gradleFile)) {
  let gradle = fs.readFileSync(gradleFile, "utf8");
  if (!/versionCode\\s+\\d+/.test(gradle) || !/versionName\\s+"[^"]+"/.test(gradle)) {
    console.error("Не удалось определить versionCode/versionName Android.");
    process.exit(1);
  }
  gradle = gradle.replace(/versionCode\\s+\\d+/, "versionCode 1203");
  gradle = gradle.replace(/versionName\\s+"[^"]+"/, 'versionName "1.2.3"');
  fs.writeFileSync(gradleFile, gradle);
  console.log("Android version set to 1.2.3 (versionCode 1203).");
}
const manifest = path.resolve(__dirname, "android/app/src/main/AndroidManifest.xml");
const rawDir = path.resolve(__dirname, "android/app/src/main/res/raw");
fs.mkdirSync(rawDir, { recursive: true });
// Short, soft original ARVEX notification chime used only when sound is enabled.
const sampleRate = 22050;
const sampleCount = Math.floor(sampleRate * 0.16);
const dataBytes = sampleCount * 2;
const wav = Buffer.alloc(44 + dataBytes);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataBytes, 4);
wav.write("WAVE", 8); wav.write("fmt ", 12); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < sampleCount; i++) {
  const fadeIn = Math.min(1, i / (sampleRate * 0.012));
  const fadeOut = Math.max(0, 1 - i / sampleCount);
  const sample = Math.round(7200 * fadeIn * fadeOut * Math.sin(2 * Math.PI * 880 * i / sampleRate));
  wav.writeInt16LE(sample, 44 + i * 2);
}
fs.writeFileSync(path.join(rawDir, "arvex_notification.wav"), wav);
if (!fs.existsSync(manifest)) {
  console.error("AndroidManifest.xml не найден. Сначала выполните npx cap add android.");
  process.exit(1);
}
let xml = fs.readFileSync(manifest, "utf8");
const activityRe = /<activity\b(?=[^>]*android:name="[^"]*MainActivity")[^>]*>[\s\S]*?<\/activity>/;
const match = xml.match(activityRe);
if (!match) {
  console.error("Не найдена MainActivity в AndroidManifest.xml.");
  process.exit(1);
}

// Auth redirects must reopen the existing Capacitor activity so its
// appUrlOpen listener and WebView PKCE verifier remain available.
let activity = match[0];
activity = activity.replace(/<activity\b([^>]*)>/, (tag, attrs) => {
  if (/android:launchMode=/.test(attrs)) return tag.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"');
  return '<activity' + attrs + ' android:launchMode="singleTask">';
});
const hasDeepLink = activity.includes('android:scheme="app.arvex.trading"')
  && activity.includes('android:host="auth"')
  && activity.includes('android:path="/callback"');
if (!hasDeepLink) {
  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="app.arvex.trading" android:host="auth" android:path="/callback" />
            </intent-filter>`;
  activity = activity.replace(/<\/activity>$/, filter + "\n        </activity>");
}
if (activity !== match[0]) {
  xml = xml.replace(match[0], activity);
  fs.writeFileSync(manifest, xml);
  console.log("ARVEX auth callback deep link и режим singleTask проверены/обновлены.");
} else {
  console.log("ARVEX auth callback deep link и режим singleTask уже настроены.");
}
