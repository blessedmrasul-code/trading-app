# Google-вход ARVEX — настройка Supabase

ARVEX использует Google OAuth с PKCE (без передачи access token в адресной строке).

Redirect URI:
- Android: `app.arvex.trading://auth/callback`
- GitHub Pages web app: `https://blessedmrasul-code.github.io/trading-app/app/`

## 1. Google Cloud Console

Создайте OAuth 2.0 Client ID типа **Web application**.

В Authorized redirect URIs добавьте ровно:

`https://bpjtntrjoxmuzgotorpi.supabase.co/auth/v1/callback`

Сохраните Client ID и Client Secret. Не помещайте Client Secret в APK, JavaScript, GitHub или чат.

## 2. Supabase

В проекте `bpjtntrjoxmuzgotorpi` откройте Authentication → Providers → Google:
- включите Google provider;
- вставьте Client ID;
- вставьте Client Secret;
- сохраните настройки.

В Authentication → URL Configuration → Redirect URLs добавьте обе строки:

`app.arvex.trading://auth/callback`

`https://blessedmrasul-code.github.io/trading-app/app/`

Site URL и существующие redirect URL не удаляйте. Веб-версия возвращает пользователя на текущий путь приложения; Android — по custom scheme.

## 3. Проверка

После включения провайдера соберите Android APK и проверьте:
1. Google открывает выбор аккаунта.
2. После выбора аккаунта Android возвращает пользователя в ARVEX.
3. Профиль показывает email Google.
4. Сессия переживает закрытие и повторное открытие приложения.
5. Email/пароль, регистрация и восстановление пароля продолжают работать.

Client Secret хранится только в настройках Supabase. В APK используется только публичный ключ приложения.
