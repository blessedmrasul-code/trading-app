// Собирает отдельную точку входа ARVEX app/ в mobile/www; корень остаётся магазином подписки.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const out = path.resolve(__dirname, 'www');
const FILES = ['style.css', 'app.js', 'cloud-config.js', 'cloud.js', 'shop-config.js', 'access.js', 'chart.js', 'school.js', 'tools.js', 'lessons.js', 'exam.js', 'glossary.js', 'logo.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'subscribe.html', 'offer.html'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const appIndex = path.join(root, 'app', 'index.html');
if (!fs.existsSync(appIndex)) {
  console.error('Не найден файл приложения: app/index.html');
  process.exit(1);
}
fs.copyFileSync(appIndex, path.join(out, 'index.html'));
for (const f of FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error('Не найден файл сайта: ' + f);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(out, f));
}
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'capacitor-app-bridge.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: path.join(out, 'capacitor-app-bridge.bundle.js')
});
console.log('www готов: app/index.html + ' + FILES.join(', ') + ' + Google OAuth bridge');
