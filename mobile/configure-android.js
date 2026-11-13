"use strict";
const fs = require("node:fs");
const path = require("node:path");

const manifest = path.resolve(__dirname, "android/app/src/main/AndroidManifest.xml");
if (!fs.existsSync(manifest)) {
  console.error("AndroidManifest.xml не найден. Сначала выполните npx cap add android.");
  process.exit(1);
}
let xml = fs.readFileSync(manifest, "utf8");
if (xml.includes('android:scheme="app.arvex.trading"') && xml.includes('android:path="/callback"')) {
  console.log("ARVEX OAuth deep link уже настроен.");
  process.exit(0);
}
const activityRe = /<activity\b(?=[^>]*android:name="[^"]*MainActivity")[^>]*>[\s\S]*?<\/activity>/;
const match = xml.match(activityRe);
if (!match) {
  console.error("Не найдена MainActivity в AndroidManifest.xml.");
  process.exit(1);
}
let activity = match[0];
activity = activity.replace(/<activity\b([^>]*)>/, (tag, attrs) => {
  if (/android:launchMode=/.test(attrs)) return tag.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"');
  return '<activity' + attrs + ' android:launchMode="singleTask">';
});
const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="app.arvex.trading" android:host="auth" android:path="/callback" />
            </intent-filter>`;
activity = activity.replace(/<\/activity>$/, filter + "\n        </activity>");
xml = xml.replace(match[0], activity);
fs.writeFileSync(manifest, xml);
console.log("ARVEX OAuth deep link добавлен в MainActivity.");
