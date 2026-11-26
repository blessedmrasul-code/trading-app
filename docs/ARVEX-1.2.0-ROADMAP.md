# ARVEX 1.2.0 — release scope

This branch is for the substantial 1.2.0 update. Keep main untouched until validation.

## Product goals
- Rework dashboard/home UX, mobile navigation and onboarding.
- Improve trade terminal, virtual positions, SL/TP controls and history filters without changing real-money functionality (ARVEX remains simulation-only).
- Add trader analytics and journal: win rate, profit factor, averages, breakdowns, notes and mistakes review.
- Expand School with a Free curriculum and a distinct Premium advanced curriculum. Each lesson should include substantial theory, examples, takeaways, practice and quiz; preserve IDs and existing progress compatibility.
- Improve tools: position/risk calculator, watchlist, journaling and educational assistant (must clearly state if offline/rule-based).
- Expand achievements/progression and profile settings while preserving local/cloud sync compatibility.
- QA: auth, Premium entitlement checks, payments (code-level only), ban/appeal flows, persistence, mobile layout, accessibility, localization and error paths.

## Guardrails
- No real orders or real trading.
- Preserve existing user data and progress; do not reset storage or renumber existing lesson IDs.
- Premium access is server-verified; don't rely on client-side flags.
- Prefer incremental changes, inspect/test each slice, and keep main branch unchanged until release review.

## Proposed sequence
1. Baseline audit and mobile UX.
2. School lesson bank and progress UI.
3. Analytics/journal/tool improvements.
4. Dashboard and profile/onboarding.
5. Regression checks, release notes and deployment review.


## Work-in-progress implementation (branch only)
- [x] Add five Free lessons (IDs 22–26) and Premium masterclass module.
- [x] Expand crypto market catalog to 20 symbols.
- [x] Add market search/filter by symbol, name and pair.
- [x] Add inline chart reading mini-guide.
- [x] Add initial Fractal toggle/level overlay implementation (needs chart-engine validation).
- [x] Add local per-asset chart journal notes.
- [ ] Validate market API response for the expanded symbol list and fallback behavior.
- [ ] Validate Fractal overlay in chart engine; refine drawing if unsupported.
- [x] Add initial historical candle Replay slicing slider and reset/full-history control (requires validation).
- [ ] Add replay step/play controls, chart styles, further indicator set and chart drawing tools.
- [ ] Improve analytics, UI redesign and run full regression checks before release.
