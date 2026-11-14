# LP-1b (app side) — in-season routing parity test, fixture copy, CR-25/CR-27 index lines

Pointer record. The plan, both plan reviews, Fix pass 1 and the full verification record for this slice live in the data repo:
`sleeper-dashboard-data/.claude/tasks/learned-projection-1b-weekly-bench.md` (data `main` @ `a0eab8f`; slice `f8607ee`, fix pass 1 `693536c` + `5cba9a6`).

App commits: `d71f9c1` (parity test `src/__tests__/inSeasonRoutingParity.test.js`, fixture copy `src/__fixtures__/inseason-routing-parity-2026-11-13.json`, CR-25/CR-27 index lines, index cap 13,000 → 14,200, `docs/navigation.md` and `CLAUDE.md` fixture-row wording) and `9158f9d` (fix pass 1: rebuilt fixture copy, re-pinned SHA-256 `95c356fbd95b681b1b49bfc5b67e9d750e3206907d2db37a548db83707c52841`). No app behaviour change; no file under `src/utils`, `src/api`, `src/components`, `src/hooks`, `src/context` or `src/App.jsx` differs from `2c3578b`.

## Verification

Session 1, 2026-11-14 — see the data-repo task file's `## Verification`. App side: implementation review (full) found no app flags; fix-pass re-review (light) confirmed the app diff is exactly the fixture and the pinned hash. T-APP-1 and T-APP-2 green and shown red. `npm test` 3,504 pass · `npm run lint` 0 problems · `npm run build` clean.

Signed off by Anton 2026-11-14
