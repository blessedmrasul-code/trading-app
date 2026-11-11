# ARVEX — Trading Academy (v4)

Обучающая платформа по трейдингу: демо-торговля на виртуальные средства, школа, экзамены, инструменты и профиль. By Mrasulv.

## Что внутри
- **Торговля:** свой свечной график (Binance, интервалы 1м–1Д), MA / EMA / объём, перекрестие, зум, **полный экран**; LONG и SHORT; плечо 1x–20x; **тейк-профит и стоп-лосс** с автозакрытием; цена ликвидации; Funding Rate; линии позиций на графике.
- **Портфель:** капитал, открытый и закрытый результат, винрейт, история сделок.
- **Школа:** 9 уроков в 4 модулях, тест после каждого урока, словарь из 56 терминов, 2 экзамена (случайные вопросы, перемешанные ответы, таймер), «Путь новичка», список бесплатных ресурсов.
- **Инструменты:** калькулятор позиции (LONG/SHORT, ликвидация, R:R, комиссии), расчёт размера позиции по риску, офлайн-помощник (термины, уроки, разбор сделок).
- **Профиль:** аватар, уровень и звание, XP, статистика, 11 достижений, редактирование, сброс демо-счёта.
- **Запуск:** анимированная заставка с логотипом и обучающий тур из 5 слайдов для новичка (повторить можно в профиле).
- **Установка как приложения (PWA):** сайт на Netlify можно добавить на главный экран телефона (`manifest.webmanifest`, `sw.js`); офлайн открывается из кэша.

## Правила XP
- Урок +20 XP, тест +20 XP, экзамен новичка +50 XP, экзамен трейдера +100 XP. Каждое — один раз.
- Закрытие сделки +10 XP, если позиция удерживалась от 30 секунд; не более 50 XP в день (защита от накрутки). Ликвидация XP не даёт.

## Симулятор фьючерсов (учебный)
Размер позиции = маржа × плечо. Поддерживающая маржа 0,5%. Funding 0,01% за 8 часов (LONG платит, SHORT получает). При ликвидации теряется маржа позиции. Это упрощённая модель, не правила Binance.

## Файлы
`index.html`, `style.css`, `manifest.webmanifest`, `sw.js`, `netlify.toml`, `app.js` (ядро), `chart.js` (график), `school.js`, `tools.js`, `lessons.js`, `exam.js`, `glossary.js`, `logo.png`, `favicon.png`. Данные хранятся в localStorage браузера или приложения.

## Android APK (Capacitor)
Папка `mobile/`. GitHub → Actions → **Build APK** → Run workflow. Workflow копирует сайт в `mobile/www`, создаёт Android-проект, генерирует иконки из `mobile/assets` и собирает debug APK (артефакт `arvex-debug-apk`; галочка «Опубликовать APK в GitHub Releases» создаёт релиз). Для Google Play понадобится подписанный release-билд.

## Важно
Это образовательный симулятор. Реальные деньги и ордера не используются. Не финансовая рекомендация. Серверные аккаунты и синхронизация между устройствами — следующий этап.

## Netlify
`netlify.toml` задаёт публикацию корня репозитория без сборки. В Netlify: Site configuration → Build & deploy → Continuous deployment должен быть привязан репозиторий `trading-app`, ветка `main`, Build command пустой, Publish directory `.`

## Облако (аккаунты и синхронизация)
Без настройки приложение полностью офлайн. Чтобы включить вход по email/паролю и синхронизацию между устройствами:
1. Создай проект на supabase.com, в SQL Editor выполни `backend/supabase.sql`.
2. В `cloud-config.js` впиши `url` (Project URL) и `anonKey` (anon public key). Ключ публичный, данные защищены правилами RLS: каждый видит только свою строку.
3. В Supabase → Authentication можно включить или отключить подтверждение почты.
Пароли приложение не хранит, только токены сессии. При входе побеждает более свежее состояние; на новом пустом устройстве подтягивается облачное.

## Релиз для Google Play
См. `mobile/signing/README.md` и workflow `Release (signed AAB + APK)`.

## Платный доступ (текущий прототип)
- `shop-config.js` содержит настройки старого сценария разовой оплаты. `enabled:false` — платный доступ выключен.
- Форма заявки отправляет Telegram, устройство и email в `orders` Supabase, если облако настроено; иначе предлагает написать владельцу в Telegram.
- `backend/supabase.sql` создаёт/настраивает `arvex_saves`, `arvex_subscriptions`, `arvex_admins`, `orders` и серверные таблицы Telegram Stars. Для подписок используется существующая таблица `arvex_subscriptions`; отдельная таблица `entitlements` не нужна.
- **Важно:** текущая проверка Premium в `access.js` ещё использует локальный флаг. Не включай платные функции и не принимай оплату через этот прототип до переноса проверки прав на сервер. Telegram Stars, 30-дневные подписки и автопродление пока не реализованы.
- `offer.html` — шаблон оферты; перед продажами его нужно заполнить и проверить.

## Telegram Stars subscriptions (prepared, not activated)

ARVEX now contains a server-side Telegram Stars subscription flow. It is deliberately **disabled by default**: set `starsEnabled: true` in `shop-config.js` only after the Supabase project, Edge Functions, and Telegram webhook have been configured and tested.

- Default price: **120 Telegram Stars**.
- Billing period: **30 days**, using Telegram's recurring Stars invoice support.
- Payment is verified by the Telegram webhook; the browser never grants Premium itself.
- The owner receives lifetime access when their Supabase Auth user UUID matches the server secret `ARVEX_OWNER_USER_ID`.

### Supabase database

Run the complete `backend/supabase.sql` script in the Supabase SQL Editor. It creates private payment-intent and payment-receipt tables. Do not add public read/write policies to these two tables.

### Edge Function secrets

Set these secrets in Supabase Dashboard → Edge Functions → Secrets:

- `TELEGRAM_BOT_TOKEN` — token from BotFather. Never put it in browser code or Git.
- `TELEGRAM_WEBHOOK_SECRET` — random secret containing only letters, digits, underscores or hyphens; use at least 32 random characters.
- `ARVEX_STARS_PRICE` — optional; defaults to `120`.
- `ARVEX_OWNER_USER_ID` — the owner's UUID from Supabase Authentication → Users. This is how lifetime owner access is assigned.
- Supabase provides the project URL and server API keys to Edge Functions. Never expose a secret/service-role key in the website.

### Deploy and connect the Telegram bot

The functions are already deployed to the ARVEX Supabase project. To redeploy after a code change, use the Supabase CLI linked to that project:

```sh
supabase functions deploy create-stars-invoice
supabase functions deploy telegram-stars-webhook
supabase functions deploy cancel-stars-subscription
```

The `telegram-stars-webhook` function has JWT verification disabled in `supabase/config.toml`; it authenticates Telegram using the webhook secret header. The invoice function requires the signed-in ARVEX user's JWT.

Set the bot webhook to the deployed function URL using Telegram's `setWebhook` method, passing the same secret in `secret_token` and allowing only `pre_checkout_query` and `message` updates. Run this locally with the values in your shell environment (do not commit them):

```sh
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${SUPABASE_URL}/functions/v1/telegram-stars-webhook\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"pre_checkout_query\"]}"
```

Keep the bot token and webhook secret private.

The repository's `cloud-config.js` is already connected to the ARVEX Supabase project with its public publishable key. The three Edge Functions are deployed there. Keep `starsEnabled: false` until the private secrets are configured, the Telegram webhook is registered, and a real Stars payment has been tested. Only then set `starsEnabled: true` in `shop-config.js`.

**Important:** Telegram Stars subscriptions are recurring. Users must be told clearly that renewal is automatic and can be cancelled through ARVEX or Telegram. The ARVEX profile includes controls to disable or re-enable automatic renewal; the paid period remains active until its expiry. Do not activate sales until that control/support process and the legal offer are ready.
