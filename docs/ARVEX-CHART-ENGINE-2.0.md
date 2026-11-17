# ARVEX Chart Engine 2.0 — first migration slice

Status: implemented on `arvex-2-0-audit`; not merged to `main`.

## What changed

- Added `lightweight-charts@5.0.8` as a pinned dependency in `mobile/package.json`.
- Added `app/chart-engine-v2.js`, a chart adapter around Lightweight Charts.
- Kept the existing `CandleChart` implementation as a fallback.
- The app selects `CandleChartV2` when the generated bundle is present; otherwise it uses the original Canvas chart.
- The adapter preserves the current app contract: `setData`, `setLines`, `zoom`, `resize`, `draw`, `ma`, `ema`, `vol`, `cross`, and `onCross`.
- Added an esbuild step to `mobile/build-web.js` to bundle the dependency for both the Capacitor WebView and the generated web app.
- Kept Lightweight Charts attribution visible as required by its license.

## Available in this slice

- Candlestick series fed by the existing Binance Spot kline adapter.
- Volume histogram.
- SMA(20) and EMA(50) overlays.
- Native time and price scales.
- Crosshair with OHLC callback into the existing UI.
- Horizontal price lines for open position entry, liquidation, TP and SL.
- Built-in pan, wheel zoom and pinch zoom.
- Responsive chart container and existing full-screen mode.

## Explicitly not implemented yet

- Bars, line and Heikin Ashi display modes.
- 1W and 1M timeframe controls.
- Drawing toolbar, trendlines, Fibonacci, measuring tool, object selection and undo/redo.
- RSI/MACD/Bollinger separate panes and indicator settings.
- Multi-chart layouts and saved chart templates.
- Futures market data and AI chart analysis.

## Build

From the `mobile/` directory:

```sh
npm install
npm run build:web
```

The build writes `mobile/www/chart-engine-v2.bundle.js`. The existing Android pipeline then runs `npx cap sync android` and builds the APK.

## Verification checklist before merge

1. `npm install` resolves the pinned Lightweight Charts package.
2. `npm run build:web` completes and creates `www/chart-engine-v2.bundle.js`.
3. Browser console has no module or chart initialization errors.
4. Binance live candles and the explicit DEMO fallback both render.
5. MA, EMA and VOL buttons toggle the corresponding series.
6. Crosshair still updates the existing OHLC row.
7. Entry, liquidation, TP and SL price lines still appear.
8. Zoom, drag/pan, pinch zoom and full-screen resizing work on Android.
9. Existing profile, cloud sync, lessons, demo positions and account flows pass regression tests.

The current code branch has not been built into an APK in this change. Do not distribute it as a release until the checklist and Android build pass.
