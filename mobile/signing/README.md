# Подпись Android-релиза ARVEX

Для release APK и AAB нужен постоянный приватный Android keystore. Не создавайте новый ключ для каждого обновления: Android не позволит обновить установленное приложение, если подпись изменится.

## 1. Создать ключ один раз

На компьютере с установленным JDK выполните:

```bash
keytool -genkeypair -v -keystore arvex-release.jks -alias arvex-release -keyalg RSA -keysize 2048 -validity 10000
```

Сохраните файл `arvex-release.jks`, пароль хранилища, пароль ключа и alias в надёжном месте. Не отправляйте их в чат, не добавляйте keystore в Git и не публикуйте его.

## 2. Подготовить Base64

Linux/macOS:
```bash
base64 -w 0 arvex-release.jks
```

macOS, если `-w` не поддерживается:
```bash
base64 < arvex-release.jks | tr -d '\\n'
```

Windows PowerShell:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("arvex-release.jks"))
```

## 3. Добавить GitHub Actions secrets

Откройте репозиторий → Settings → Secrets and variables → Actions → New repository secret. Создайте четыре секрета:

- `ARVEX_KEYSTORE_BASE64` — вся Base64-строка из шага 2.
- `ARVEX_STORE_PASSWORD` — пароль keystore.
- `ARVEX_KEY_ALIAS` — `arvex-release` (или выбранный alias).
- `ARVEX_KEY_PASSWORD` — пароль ключа.

Не вставляйте значения секретов в исходный код или Issues.

## 4. Собрать релиз

Откройте Actions → **Release (signed APK + AAB)** → Run workflow. Укажите version name и увеличьте version code относительно предыдущего релиза. После успешной сборки скачайте APK из Artifacts или GitHub Releases. AAB предназначен для Google Play.

## Важно

Потеря keystore или паролей может лишить возможности выпускать обновления с той же подписью. Сделайте две безопасные резервные копии keystore. Никогда не храните их в этом репозитории.
