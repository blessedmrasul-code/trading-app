# ARVEX — настройка писем с шестизначным кодом

Клиент ARVEX уже поддерживает ввод кода при регистрации и восстановлении пароля. Для того чтобы Supabase отправлял код, а не ссылку, обязательно замени два шаблона в Supabase Dashboard → Authentication → Email Templates.

## 1. Confirm signup / Подтверждение регистрации

Тема: Код подтверждения ARVEX

<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#101018;color:#f5f5f7;border-radius:16px">
  <h2 style="color:#8b7cff">Подтверждение ARVEX</h2>
  <p>Введи этот шестизначный код в приложении ARVEX:</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;background:#1b1b29;border-radius:12px;text-align:center">{{ .Token }}</div>
  <p style="color:#aaa">Если ты не создавал аккаунт ARVEX, просто проигнорируй это письмо.</p>
</div>

## 2. Reset password / Восстановление пароля

Тема: Код восстановления пароля ARVEX

<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#101018;color:#f5f5f7;border-radius:16px">
  <h2 style="color:#8b7cff">Восстановление пароля ARVEX</h2>
  <p>Введи этот шестизначный код в приложении ARVEX, чтобы задать новый пароль:</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;background:#1b1b29;border-radius:12px;text-align:center">{{ .Token }}</div>
  <p style="color:#aaa">Если ты не запрашивал восстановление, проигнорируй это письмо. Никому не сообщай код.</p>
</div>

**Ключевой момент:** в обоих шаблонах должна быть переменная {{ .Token }}. Удали кнопки и ссылки с {{ .ConfirmationURL }}, иначе Supabase продолжит отправлять ссылку.

## 3. Что уже исправлено в приложении

- Запрос регистрации /auth/v1/signup больше не передаёт URL для перенаправления.
- Повторная отправка подтверждения /auth/v1/resend остаётся внутри ARVEX.
- Запрос сброса пароля /auth/v1/recover больше не передаёт URL сайта.
- Код регистрации проверяется с типом signup, код восстановления — с типом recovery.
- После проверки recovery-кода приложение открывает форму нового пароля.

## 4. Проверка после настройки

1. Убедись, что Custom SMTP включён и Gmail SMTP работает.
2. Оставь подтверждение email включённым в Authentication → Providers → Email.
3. Зарегистрируй новый тестовый адрес: письмо должно содержать 6 цифр.
4. Введи код в ARVEX: регистрация должна завершиться без открытия браузера.
5. Для существующего тестового аккаунта нажми «Забыли пароль?», получи код, введи его и задай новый пароль внутри ARVEX.

Не отправляй никому Gmail App Password, Supabase service-role key или другие секреты.
