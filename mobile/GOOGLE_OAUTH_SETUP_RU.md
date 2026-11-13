# Google-вход и подтверждение email ARVEX

ARVEX использует Google OAuth через PKCE. Client Secret Google никогда не хранится в приложении.

Адреса возврата именно в приложение:
- Android: `app.arvex.trading://auth/callback`
- GitHub Pages: `https://blessedmrasul-code.github.io/trading-app/app/`
- Netlify: `https://sage-peony.netlify.app/app/`

## 1. Google Cloud Console

Создайте OAuth 2.0 Client ID типа **Web application**.

В Authorized redirect URIs добавьте ровно один callback Supabase:

`https://bpjtntrjoxmuzgotorpi.supabase.co/auth/v1/callback`

Сохраните Client ID и Client Secret. Не помещайте Client Secret в APK, JavaScript, GitHub или чат.

## 2. Supabase

В проекте `bpjtntrjoxmuzgotorpi` откройте Authentication → Providers → Google:
- включите Google provider;
- вставьте Client ID;
- вставьте Client Secret;
- сохраните настройки.

В Authentication → URL Configuration → Redirect URLs добавьте адреса приложения:

`app.arvex.trading://auth/callback`

`https://blessedmrasul-code.github.io/trading-app/app/`

`https://sage-peony.netlify.app/app/`

Не удаляйте существующие redirect URL. Корень сайта используется страницей подписки; вход и подтверждение email возвращаются на маршрут `/app/`, чтобы пользователь не попадал обратно на страницу покупки.

## 3. Что делает приложение

- Google-вход использует PKCE и возвращает пользователя на текущий маршрут приложения.
- Подтверждение email также возвращает пользователя в ARVEX, а не на страницу подписки.
- После подтверждения email приложение автоматически получает профиль, создаёт сессию и выполняет синхронизацию.
- OAuth/email токены и коды удаляются из адресной строки после обработки.

## 4. Проверка

1. На сайте ARVEX откройте `/app/` и зарегистрируйтесь по email.
2. Откройте письмо и подтвердите адрес — должна открыться ARVEX, пользователь войдёт автоматически.
3. В профиле проверьте email и синхронизацию.
4. Выйдите и проверьте вход через Google.
5. Повторите Google-вход в Android APK.

Client Secret хранится только в настройках Supabase. В APK используется только публичный ключ приложения.
