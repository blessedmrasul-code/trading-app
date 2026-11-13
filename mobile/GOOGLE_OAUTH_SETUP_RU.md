# Google-вход ARVEX — настройка Supabase

ARVEX использует Google OAuth с PKCE. Пароли Google и Client Secret не передаются приложению.

Адреса возврата:
- Android: `app.arvex.trading://auth/callback`
- GitHub Pages, главная страница: `https://blessedmrasul-code.github.io/trading-app/`
- GitHub Pages, маршрут приложения: `https://blessedmrasul-code.github.io/trading-app/app/`
- Netlify: `https://sage-peony.netlify.app/`

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

В Authentication → URL Configuration → Redirect URLs добавьте адреса, с которых реально открывают приложение:

`app.arvex.trading://auth/callback`

`https://blessedmrasul-code.github.io/trading-app/`

`https://blessedmrasul-code.github.io/trading-app/app/`

`https://sage-peony.netlify.app/`

Site URL и существующие redirect URL не удаляйте. Веб-версия возвращает пользователя на текущий путь приложения; Android — по custom scheme. Если используется другой домен, добавьте и его точный HTTPS-адрес в Redirect URLs.

## 3. Проверка

После включения провайдера проверьте:
1. Google открывает выбор аккаунта.
2. После выбора аккаунта веб-сайт возвращает пользователя на ту же страницу ARVEX.
3. Android возвращает пользователя обратно в приложение.
4. Профиль показывает email Google.
5. Сессия переживает закрытие и повторное открытие приложения.
6. Email/пароль, регистрация и восстановление пароля продолжают работать.

Client Secret хранится только в настройках Supabase. В APK используется только публичный ключ приложения.
