// Копирует файлы сайта из корня репозитория в mobile/www для Capacitor.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(__dirname, 'www');
const FILES = ['index.html', 'style.css', 'app.js', 'cloud-config.js', 'cloud.js', 'chart.js', 'school.js', 'tools.js', 'lessons.js', 'exam.js', 'glossary.js', 'logo.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of FILES) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.error('Не найден файл сайта: ' + f);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(out, f));
}
console.log('www готов: ' + FILES.join(', '));
