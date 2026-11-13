# Подпись Android-релиза ARVEX

Для подписанного release APK и AAB нужен постоянный приватный Android keystore. Ключ создаётся один раз и используется для всех будущих обновлений. Не создавайте новый ключ для каждого релиза.

## 1. Создать временный GitHub-токен

На GitHub откройте **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.

Настройки токена:
- Token name: `ARVEX signing setup`
- Expiration: 1 day
- Resource owner: ваш аккаунт
- Repository access: Only select repositories → `trading-app`
- Repository permissions → **Secrets: Read and write**

Создайте токен и скопируйте его. Не отправляйте токен в чат и никому его не показывайте.

## 2. Добавить временный токен в репозиторий

Откройте **trading-app → Settings → Secrets and variables → Actions → New repository secret**.

- Name: `ARVEX_BOOTSTRAP_TOKEN`
- Secret: вставьте скопированный токен.

Сохраните секрет.

## 3. Автоматически создать ключ подписи

Откройте **Actions → Setup ARVEX signing key → Run workflow** и запустите workflow на ветке `main`.

GitHub Actions:
- создаст постоянный Android keystore;
- сгенерирует случайные пароли;
- сохранит keystore и пароли напрямую в GitHub Actions Secrets;
- удалит временный `ARVEX_BOOTSTRAP_TOKEN` из секретов репозитория.

Keystore не публикуется в репозитории и не загружается как артефакт.

После успешного выполнения откройте настройки своего GitHub-аккаунта → Developer settings → Personal access tokens и **отзовите временный токен**.

## 4. Собрать релиз

Откройте **Actions → Release (signed APK + AAB) → Run workflow**:
- version name: `1.1.2`
- version code: `13`
- publish release: `true`

Для каждого следующего релиза увеличивайте version code. После успешной сборки APK и AAB появятся в GitHub Releases и в Artifacts.

## Важно

Не удаляйте и не перезаписывайте секреты подписи. Один и тот же keystore нужен для всех обновлений установленного приложения. Храните резервную копию ключа и паролей в безопасном месте, если позже решите экспортировать их из защищённого хранилища.
