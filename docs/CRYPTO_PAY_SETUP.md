# ARVEX Crypto Pay setup

Crypto Pay is a separate checkout method. Telegram Stars and direct USDT TRC20 remain unchanged.

## Fixed prices

| Premium period | USD invoice |
|---|---:|
| 30 days | $3 |
| 90 days | $9 |
| 180 days | $17 |
| 365 days | $32 |

Invoices are fiat-denominated in USD and accept USDT, TON, BTC, ETH, LTC, BNB, TRX, and USDC. Crypto Pay calculates the equivalent amount in the selected asset.

## One-time provider setup

1. Open [@CryptoBot](https://t.me/CryptoBot) and navigate to Crypto Pay → My Apps.
2. Create an app and copy its API Token.
3. In the Supabase Dashboard for project `bpjtntrjoxmuzgotorpi`, open Edge Functions → Secrets.
4. Add a secret named `CRYPTO_PAY_API_TOKEN` and paste the token value into the Value field. Save it. Never commit or send this token in chat.
5. In @CryptoBot → Crypto Pay → My Apps → the new app → Webhooks, enable webhooks and set this URL:

   `https://bpjtntrjoxmuzgotorpi.supabase.co/functions/v1/crypto-pay-webhook`

6. The webhook endpoint verifies the `crypto-pay-api-signature` HMAC-SHA-256 header using the SHA-256 digest of the API token. Do not disable signature verification.

## Server components

- `create-crypto-pay-invoice`: authenticated user endpoint; price and duration are selected server-side.
- `crypto-pay-webhook`: public provider callback with HMAC verification.
- `public.arvex_cryptopay_invoices`: existing private invoice ledger (RLS enabled; service role only).
- `public.arvex_apply_cryptopay_invoice`: existing atomic/idempotent invoice settlement and Premium extension routine.

The webhook only accepts paid USD invoices in the configured asset allowlist. A repeated paid notification does not extend Premium twice. The app must never activate Premium from a browser redirect alone.

## Test before announcing availability

1. Add the API token as a Supabase Edge Function secret.
2. Enable the webhook URL in the Crypto Pay app.
3. Create a low-value test invoice using the Crypto Pay test environment first if a test app is available.
4. Confirm the invoice is stored, the webhook returns HTTP 200, and Premium is extended exactly once.
5. Confirm the payment is visible in the user's account and verify that Stars and TRC20 checkout still work.
