```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:20f15cce4359f27df88ca03c61c74ef35c82856ce1d6bee6bcd282a22c65254e
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 18/18
test_command: pnpm typecheck && pnpm lint && pnpm test
test_exit_code: 0
test_output_hash: sha256:497a9444aaf2fd4904576194356268f4300788c8998a842eeedba188d6e660fc
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:f0c622893d7c286c775d7adde7024a03f1c74912627ab6d4e6466869a1c65646
```

## Verification Report

**Change**: monthly-dashboard-timezone
**Spec**: `accounting-month` (R1-R8), `dashboard-monthly` (R9), `web-datepicker` (R10), `domain-tests` (R11) - 11 requirements, 18 `#### Scenario:` blocks (the spec header's "22 scenarios" line is a self-inconsistent authoring artifact; the authoritative count from the retrieved spec body is 18).
**Mode**: Standard (`strict_tdd: false`).
**Branch**: `feat/monthly-dashboard-timezone` - working tree only, nothing committed (T-21 deferred to the user).

### Completeness

| Metric | Value |
| --- | --- |
| Tasks total | 21 |
| Tasks complete | 18 (T-01..T-17 + T-14) |
| Tasks incomplete | 3 - T-18/T-19 (partially discharged by runtime evidence below; aggregate-vs-fallback parity cross-check + SQS-consumer lifecycle remain manual), T-20 (manual lifecycle/dropped-event), T-21 (commit/push/PR, deliberately the user's) |

T-14 is done: `git diff --stat` shows `.env.example | 3 +-` and `packages/infra-sls/.env.example | 4 +` (both gained `APP_TIMEZONE=America/Lima`; file contents are permission-blocked here and taken as given per the orchestrator's confirmation).

### Build & Test Execution (re-run from repo root, this verification)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck + Lint + Test | `pnpm typecheck && pnpm lint && pnpm test` | 0 | PASS |
| Build | `pnpm build` | 0 | PASS (6/6 turbo tasks) |

- `pnpm typecheck`: 9/9 turbo tasks OK (`>>> FULL TURBO`, cached).
- `pnpm lint`: 9/9 OK - **0 errors, 1 pre-existing warning** at `packages/web/src/features/dashboard/hooks/useMonthlyDashboard.ts:62` (`react-hooks/exhaustive-deps` on a `useMemo`; that file is NOT touched by this change).
- `pnpm test`: 9/9 OK; `@smart-wallet/domain` Vitest `v4.1.11` -> `src/shared/accountingMonth.test.ts (7 tests)` **7 passed**. All other packages `echo 'no tests yet'`.
- Combined command exit code: **0**.

Verbatim tail of `pnpm typecheck && pnpm lint && pnpm test`:

```
@smart-wallet/api:test: > @smart-wallet/api@0.0.0 test /home/kevin/personal/workspace/projects/smart-wallet/packages/api
@smart-wallet/api:test: > echo 'no tests yet' && exit 0
@smart-wallet/api:test:
@smart-wallet/api:test: no tests yet
@smart-wallet/api:build: cache hit, replaying logs 862c91880da569d3
@smart-wallet/api:build:
@smart-wallet/api:build: > @smart-wallet/api@0.0.0 build /home/kevin/personal/workspace/projects/smart-wallet/packages/api
@smart-wallet/api:build: > tsc --build
@smart-wallet/api:build:
@smart-wallet/infra-sls:test: cache hit, replaying logs 5237c3b2b2a220c4
@smart-wallet/infra-sls:test:
@smart-wallet/infra-sls:test: > @smart-wallet/infra-sls@0.0.0 test /home/kevin/personal/workspace/projects/smart-wallet/packages/infra-sls
@smart-wallet/infra-sls:test: > echo 'no tests yet' && exit 0
@smart-wallet/infra-sls:test:
@smart-wallet/infra-sls:test: no tests yet

 Tasks:    9 successful, 9 total
Cached:    9 cached, 9 total
  Time:    45ms >>> FULL TURBO
```

### Runtime evidence against DynamoDB Local

`serverless-offline` is not installed, so the HTTP stack was not exercised. DynamoDB Local (`smart-wallet-ddb`, `localhost:8000`) was up. I created the single table via `pnpm ddb:init`, then drove the **real read path** - `makeGetMonthlyDashboard` (domain use case) wired to the real `DynamoDBTransactionRepository` against DynamoDB Local, with a stubbed `Clock` and a stub `walletRepo` - via an inline `tsx` script. Seeded rows and both tables were deleted afterwards; `aws dynamodb list-tables` returns `[]` again (original state).

Setup: `APP_TIMEZONE=America/Lima`, `clock.now() = 2026-09-01T04:00:00.000Z` (America/Lima wall clock `2026-08-31 23:00` -> month key `2026-08`). Seeded three `income` PEN rows:

| Row | occurredAt | amount | Lima wall clock | vs. now |
| --- | --- | --- | --- | --- |
| A | `2026-08-31T23:59:56.667Z` | 1000 | 2026-08-31 18:59 | past |
| B | `2026-09-01T00:11:41.645Z` | 2000 | 2026-08-31 19:11 | past |
| C | `2026-09-01T04:30:00.000Z` | 5000 | 2026-08-31 23:30 (still Lima-August) | **future** (> now) |

Result (`RESULT: PASS`):

- `range.from = 2026-08-01T05:00:00.000Z` (first instant of Lima-August) - **expected**.
- `range.to   = 2026-09-01T04:00:00.000Z` (= `clock.now()`) - **expected**.
- `summariesByCurrency` PEN `incomeCents = 3000` = A + B. Row C (same Lima month, but `occurredAt` after `now`) is **excluded**. Without the `to = now` cap the figure would be 8000.

This is direct runtime proof for the repro-pair scenario (R3/R5 "Known repro pair"), the tz-derived range (R2/R9), the `occurredAt <= now` cap on the path that actually serves the dashboard (R4), and dropped-event resilience (R7 - the dashboard returned the correct figure with **no** aggregate ever written).

A second inline check confirmed the `env.ts` invalid-`APP_TIMEZONE` behaviour: `APP_TIMEZONE="Not/AZone"` -> `console.error("[env] APP_TIMEZONE value \"Not/AZone\" is not a valid IANA time zone; falling back to \"America/Lima\"")`, `env.appTimezone === 'America/Lima'`, no throw.

### Spec Compliance Matrix

| # | Requirement / Scenario | Evidence (file:line) | Result |
| --- | --- | --- | --- |
| R1 | Single configured accounting timezone | `packages/api/src/env.ts:17-28,46`; `container.ts:69`; `handlers/dashboard/getMonthlyDashboard.ts:11-14`; `serverless.yml:64` | PASS (substantive) |
| R1.1 | Unset or blank falls back to America/Lima | `env.ts:18-19` (`trimmed === ''` branch) + Vitest `isValidTimeZone('') === false` (`accountingMonth.test.ts:69`); runtime env check | PASS |
| R1.2 | Invalid IANA value is a deploy-time error | `env.ts:19-27` - `console.error` + fall back to `America/Lima`, **never throws** (per design ADR-5 + task T-08) | PARTIAL - see WARNING 1 |
| R2 | One shared month helper (`monthKeyInTimeZone` / `monthRangeInTimeZone`, range derived from key) | `packages/domain/src/shared/accountingMonth.ts:97-118`; exported `shared/index.ts:20-24`; consumed by `GetMonthlyDashboard.ts:5,79` and `DynamoDBMonthlyAggregateRepository.ts:8,208` | PASS |
| R2.1 | Month key zero-padded, sort-key safe | `accountingMonth.ts:99` explicit `String(w.year).padStart(4,'0')` + `String(w.month).padStart(2,'0')`; Vitest case 1; runtime key `2026-08` | PASS |
| R2.2 | Range derived from the key | `accountingMonth.ts:111-116` - `key = monthKeyInTimeZone(...)`, `[year,month]` sliced from the key, `from = instantFromWallClock(Date.UTC(year, month-1, 1,...))`; Vitest case 2; runtime `range.from` | PASS |
| R3 | Month membership uses configured-tz wall clock | `accountingMonth.ts:44-59` `wallClockOf` via `formatToParts` | PASS |
| R3.1 | Negative offset straddling UTC midnight | Vitest case 1 (`2026-08-31T23:59:56.667Z` and `2026-09-01T00:11:41.645Z` -> `2026-08`, `America/Lima`); runtime test (both rows land in August total) | PASS |
| R3.2 | Positive offset ahead of UTC | Vitest case 3 (`2026-08-31T20:00:00Z` -> `2026-09`, `Asia/Tokyo`; range start `2026-08-31T15:00:00.000Z`) | PASS |
| R3.3 | DST transition mid-month | Vitest case 4 (`Europe/Madrid`, `2026-10-27T12:00:00Z` -> month start `2026-09-30T22:00:00.000Z`, the +02 offset at month start, not the +01 at `now`); two-pass fixed point `accountingMonth.ts:75-78` | PASS |
| R4 | "This month" capped at now on both paths | `accountingMonth.ts:116` `to: instant`; `DynamoDBTransactionRepository.ts:762-768` `FilterExpression: occurredAt >= :from AND occurredAt <= :to` (`:to = range.to.toISOString()`) | PASS |
| R4.1 | Future-dated same-month txn excluded from aggregate path | `GetMonthlyDashboard.ts:97` never calls `listMonthlySummaries` -> the aggregate cannot inject a future txn into the current-month figure (ADR-1, structural); runtime test excluded row C | PASS |
| R4.2 | Both paths apply the same upper bound (fallback figure == aggregate figure) | Fallback cap runtime-verified; the independent "== aggregate" cross-check needs the SQS consumer and was not run | DEFERRED - manual (T-19), see WARNING 2 |
| R5 | Read and write agree for the current month | `GetMonthlyDashboard.ts:97` always `summarizeMonthlyByCurrency`; write bucket `DynamoDBMonthlyAggregateRepository.ts:208` uses the same `monthKeyInTimeZone` with the same `env.appTimezone` (`container.ts:69`) | PASS (by construction) |
| R5.1 | Aggregate and fallback parity | Same helper + same tz on both sides (inspection); independent numeric parity not executed (no consumer drain) | DEFERRED - manual (T-18 step 6), see WARNING 2 |
| R5.2 | Known repro pair lands in one card | Runtime test: `2026-08-31T23:59:56.667Z` + `2026-09-01T00:11:41.645Z` both in the same PEN "Ingresos del mes" total (3000) | PASS |
| R6 | Transaction lifecycle nets aggregate to zero | `DynamoDBMonthlyAggregateRepository.ts:65-72` Created `+1`, Deleted `-1`, Updated `-1`(before)+`+1`(after); `addSnapshotDeltas:201-233` buckets **per snapshot** via `monthKeyInTimeZone`, so before/after can fall in different months and still net to 0 | PASS (code) |
| R6.1 | Create, cross-boundary update, delete | Logic verified by inspection (per-snapshot +/-1 buckets); full runtime netting not exercised (no consumer) | DEFERRED - manual (T-20) |
| R7 | Dropped aggregate event does not corrupt the card | `GetMonthlyDashboard.ts:97` current month always recomputed from transactions; aggregate never consulted for the displayed figure | PASS |
| R7.1 | Lost aggregate event still reconciles | Runtime test: correct figure (3000) returned with **no** aggregate row ever written for the month | PASS |
| R8 | No data deletion by software | `rg` over `packages/api/src` finds no code path deleting `MONTHLY_AGG#` / `MONTHLY_CAT_AGG#` / `PROCESSED_EVENT#`; `design.md` sec.8 step 2 + sec.9 and `proposal.md` document the operator-only runbook; T-15 confirmed | PASS |
| R8.1 | Rollout cleanup is operator-driven | Same - verified by absence of any delete path + doc review | PASS |
| R9 | Monthly dashboard read boundary uses the accounting-month helper | `GetMonthlyDashboard.ts:79` `const range = monthRangeInTimeZone(deps.clock.now(), input.timezone)` (key + range both from the helper; `to = now`); handler passes `env.appTimezone` (`getMonthlyDashboard.ts:13`) | PASS |
| R9.1 | Month-boundary read in configured timezone | Runtime test: `now = 2026-09-01T04:00:00Z`, `America/Lima` -> month key `2026-08`, `range.from = 2026-08-01T05:00:00.000Z`, `range.to == now` (spec's `02:00:00Z` example is the same behaviour class) | PASS |
| R9.2 | Fallback receives the timezone-derived range | Runtime test: `summarizeMonthlyByCurrency(userId, range)` called with the tz-derived `[from, now]`, returned the tz-correct total | PASS |
| R10 | DatePickerField resolves picked day in the local calendar | `packages/web/src/components/common/DatePickerField.tsx:41-49` - `new Date(y, m, d, 12, 0, 0, 0).toISOString()` (local-noon ctor; was `Date.UTC(...)`); JSDoc updated `:22-27` | PASS (code) |
| R10.1 | Pick 31 August while the browser is at UTC-5 | Local noon on the picked Y/M/D at UTC-5 -> `2026-08-31T17:00:00Z`, which is 31 Aug in both the browser-local and `America/Lima` calendars; noon is +-12h from any boundary so no adjacent-day shift; local **midnight** was rejected in ADR-4 for exactly that reason. No web test runner (ADR-6 scoped Vitest to `packages/domain`); manual browser confirm remains | DEFERRED - manual (browser) |
| R11 | Minimal Vitest runner for the helper | `packages/domain/package.json:16` `"test": "vitest run"` + `vitest ^4.1.11`; `vitest.config.ts` `include: ['src/**/*.test.ts']`; `tsconfig.json:9` `"exclude": ["src/**/*.test.ts"]` | PASS |
| R11.1 | Helper test suite executes required cases | `pnpm test` ran `accountingMonth.test.ts` - 7 passed: UTC-5 both sides of the boundary (case 1), UTC-5 range (case 2), `Asia/Tokyo` UTC+ (case 3), `Europe/Madrid` DST mid-month (case 4), `America/Lima` no-DST Jan+Jul stability (case 5), `isValidTimeZone` table (case 6) | PASS |

**Scenario tally**: 18/18 have a verified covering implementation. 13 have direct passing runtime or automated (Vitest) evidence. Five (R1.2, R4.2, R5.1, R6.1, R10.1) are covered by implementation that is coherent with the design and are routed to final confirmation by mechanisms the change's own artifacts sanction: R1.2 is the deliberate ADR-5 boot-time-fallback decision (WARNING 1); R4.2/R5.1/R6.1/R10.1 are on the `tasks.md` "Manual runtime verification checklist (T-18 - T-20)" and `design.md` sec.6 ("Manual after deploy"). Per the sdd-verify decision gate, project-sanctioned manual verification keeps these WARNING/deferred, not CRITICAL. They are enumerated as pre-archive conditions below.

### Design Coherence (ADR-1 .. ADR-6)

| ADR | Followed? | Notes |
| --- | --- | --- |
| ADR-1 - aggregate is a write-only past-month cache; dashboard always recomputes current month | Yes | `GetMonthlyDashboard.ts` drops `monthlyAggregateRepo` from deps and the aggregate read; `container.ts:69,157` keeps the `monthlyAggregateRepo` singleton + export; `processTransactionEvents.ts:21` still calls `container.monthlyAggregateRepo.applyTransactionEvent`. `listMonthlySummaries` left unchanged (no `occurredAt` bound) - consistent with "aggregate never serves the current month". |
| ADR-2 - plain `timezone: string` use-case input, no port | Yes | `GetMonthlyDashboardInput.timezone` (`GetMonthlyDashboard.ts:47-50`); handler passes `env.appTimezone`; no `AccountingCalendar` port. |
| ADR-3 - range derived from key, two-pass offset fixed point, `to = instant`, explicit `padStart` | Yes | `accountingMonth.ts:75-118` matches the design pseudocode; `wallClockOf` uses `formatToParts` with `calendar: 'gregory'`, `hourCycle: 'h23'`; `hour === 24` normalised to 0 (`:55`). |
| ADR-4 - DatePickerField local noon | Yes | `DatePickerField.tsx:41-49` + JSDoc. |
| ADR-5 - IANA validation: validated fallback at boot, logged, never throwing | Yes (by design) - see WARNING 1 for the spec-text tension | `env.ts:17-28` single boot-time `resolveAppTimezone`; one `console.error`; no per-request `Intl` call with an unvalidated value. |
| ADR-6 - Vitest in `packages/domain` only, colocated test, `tsconfig` excludes tests | Yes | `vitest.config.ts`, `package.json`, `tsconfig.json`, `accountingMonth.test.ts` all as specified. The DST literals in ADR-6 (open question sec.10) are now confirmed by the passing run: `Europe/Madrid` Oct start `2026-09-30T22:00:00.000Z`, `Asia/Tokyo` `2026-08-31T15:00:00.000Z`, `America/Lima` `T05:00:00.000Z` year-round. |

### Apply Deviation Assessment

| # | Deviation | Assessment | Blocks archive? |
| --- | --- | --- | --- |
| 1 | `eslint.config.mjs` +4 lines: `packages/domain/src/**/*.test.ts` added to global `ignores` | **Acceptable, follow-up.** Forced by ADR-6's `tsconfig.json` `"exclude": ["src/**/*.test.ts"]` - the typed ESLint project service cannot resolve a file that is in no tsconfig project. Mirrors the pre-existing `**/*.config.{js,ts,mjs,cjs}` entry immediately above it (same root cause, same fix). Consequence: `accountingMonth.test.ts` is not linted and not type-checked (`pnpm typecheck` = `tsc --noEmit` over the excluded project). The test still runs and passes under Vitest's own esbuild transform. ADR-6 already names `tsconfig.test.json` as the follow-up that would restore both. | No |
| 2 | `env.ts` logs + falls back on invalid `APP_TIMEZONE` instead of throwing / failing the deploy | **Acceptable, documented (ADR-5 + T-08); tracked as WARNING 1.** The implementation is a single boot-time resolution (not a per-request fallback), it *is* surfaced to the operator (`console.error` -> CloudWatch), and the fallback value equals the intended production value so the R5 read/write-agreement invariant holds regardless. The gap vs. the strict spec text ("treated as a deployment/configuration failure surfaced to the operator") is that a bad value does not fail `sls deploy` or CI. Design rationale is sound: `env.ts` is imported by every handler and the SQS consumer, so throwing would take the whole API down and cause an SQS redrive loop over an unrelated env typo. | No |

### Issues

**CRITICAL / BLOCKER**: None.

**WARNING**:

1. **R1.2 - invalid `APP_TIMEZONE` is not a hard deploy-time failure.** `env.ts` logs one `console.error` and falls back to `America/Lima` rather than surfacing a deployment/configuration failure that fails the deploy. Deliberate per ADR-5 and task T-08 (avoid taking the whole API + SQS consumer down over an unrelated env typo). Substantive intent of R1 (one configured tz, no per-request tz, read/write agree) is fully met. Recommended compensating control: add a post-deploy check (or a CI/`sls` preflight lint of `APP_TIMEZONE`) and a runbook line to grep CloudWatch for `"[env] APP_TIMEZONE"` after each deploy.
2. **R4.2 / R5.1 - aggregate-vs-fallback numeric parity not runtime-verified.** The fallback cap and the shared-helper wiring are verified (inspection + read-path runtime test), but the independent "aggregate figure == fallback figure per currency" cross-check requires draining the `processTransactionEvents` SQS consumer, which needs `serverless-offline` (not installed). Routed to manual T-18 step 6 / T-19 by the change's own checklist.

**SUGGESTION**:

1. Land the `tsconfig.test.json` follow-up (already named in ADR-6) so `accountingMonth.test.ts` regains type-check and lint coverage; then drop the `eslint.config.mjs` ignore entry.
2. Run the T-20 lifecycle check (create -> cross-boundary update -> delete nets `MONTHLY_AGG#` to zero for both months) once a local or deployed SQS consumer is available; the `addSnapshotDeltas` per-snapshot +/-1 logic is correct by inspection but has no runtime proof.
3. `wallClockOf` returns `0` for any missing `formatToParts` field (`accountingMonth.ts:48`). Harmless for the fixed formatter, but a defensive `NaN`/throw would fail louder if the `Intl` options ever change.
4. The spec header says "22 scenarios" while the body has 18 `#### Scenario:` blocks - fix the header during archive so the counts are self-consistent.

### Tasks Completeness

| Task | State | Evidence |
| --- | --- | --- |
| T-01..T-06 (helper + Vitest runner) | Done | `accountingMonth.ts`, `vitest.config.ts`, `accountingMonth.test.ts` present; `pnpm test` 7/7 |
| T-07 (read path) | Done | `GetMonthlyDashboard.ts` - `timezone` input added, `monthlyAggregateRepo` removed, always `summarizeMonthlyByCurrency` |
| T-08 (`env.ts`) | Done | `resolveAppTimezone` + `appTimezone` (see WARNING 1 for the strict-reading caveat) |
| T-09 (handler) | Done | `getMonthlyDashboard.ts:11-14` passes `timezone: env.appTimezone` |
| T-10 (container) | Done | `makeGetMonthlyDashboard({ walletRepo, transactionRepo, clock })`; `new DynamoDBMonthlyAggregateRepository(env.appTimezone)`; singleton + export kept |
| T-11 (aggregate repo) | Done | `constructor(timeZone)`; `monthFromOccurredAt` deleted; `addSnapshotDeltas` uses `monthKeyInTimeZone`; `listMonthlySummaries` unchanged |
| T-12 (DatePickerField) | Done | local-noon ctor + JSDoc |
| T-13 (`serverless.yml`) | Done | `APP_TIMEZONE: ${env:APP_TIMEZONE, 'America/Lima'}` under `provider.environment` |
| T-14 (`.env.example` x2) | Done | user-added; `git diff --stat` shows both files changed |
| T-15, T-16 (docs / tech-debt notes) | Done | confirmed in prior apply batch; no code |
| T-17 (workspace `pnpm typecheck && lint && test`) | Done | re-run this verification, exit 0 |
| T-18 (repro pair in one card + parity) | Partial | repro pair: **runtime PASS** here; parity cross-check: manual |
| T-19 (future-dated exclusion, both paths) | Partial | fallback path: **runtime PASS** here; aggregate cross-check: manual |
| T-20 (lifecycle nets to zero + dropped-event) | Open | dropped-event: strong indirect runtime evidence (R7.1); lifecycle netting: manual |
| T-21 (commit / push / PR) | Open | deliberately the user's |

### Verdict

**PASS WITH WARNINGS**

All static gates pass with exit 0 (`pnpm typecheck && pnpm lint && pnpm test`, and `pnpm build`). The shared `accountingMonth` helper is implemented per ADR-3 (two-pass offset fixed point, range derived from the key, explicit `padStart`), covered by 7 passing Vitest cases including the `Europe/Madrid` DST-mid-month regression, and its DST literals are now confirmed. The dashboard read path adopts the helper, always recomputes the current month from transactions, and caps the range at `now` - verified end-to-end against DynamoDB Local: the known repro pair (`2026-08-31T23:59:56.667Z` + `2026-09-01T00:11:41.645Z`) lands in one August card and a future-dated same-month row is excluded. The write bucket uses the same helper with the same `env.appTimezone`; the aggregate + SQS pipeline is kept write-only (`monthlyAggregateRepo` still constructed, exported, and consumed by `processTransactionEvents`).

No CRITICAL findings, no blockers. Two WARNINGS: (1) invalid `APP_TIMEZONE` is a logged boot-time fallback rather than a hard deploy failure - a deliberate, documented ADR-5 decision whose substantive intent is met; (2) the aggregate-vs-fallback numeric parity cross-check and the T-20 lifecycle netting need an SQS consumer (`serverless-offline` not installed) and stay on the sanctioned manual checklist. Neither blocks archive.

**Pre-archive conditions** (not blockers, to be recorded on the PR):
- T-21: single conventional commit, push `feat/monthly-dashboard-timezone`, open PR referencing the SDD artifacts.
- Post-deploy or local-with-`serverless-offline`: T-18 step 6 (aggregate == fallback per currency), T-19 aggregate cross-check, T-20 (lifecycle nets `MONTHLY_AGG#` to zero across a boundary), and the R10 browser check (pick 31 Aug at UTC-5).
- Consider the WARNING-1 compensating control (deploy preflight / runbook grep for `"[env] APP_TIMEZONE"`).

## Key Learnings

1. The tz-aware monthly read path was verified end to end by driving `makeGetMonthlyDashboard` with the real `DynamoDBTransactionRepository` against DynamoDB Local and a stubbed clock, without needing `serverless-offline`.
2. `monthRangeInTimeZone` sets `to = clock.now()`, and `summarizeMonthlyByCurrency` filters `occurredAt <= :to`, so the future-dated same-month exclusion (spec R4) holds on the exact path the dashboard uses.
3. `GetMonthlyDashboard` no longer reads `listMonthlySummaries` at all, which makes dropped-aggregate-event resilience (spec R7) structural: the runtime test returned the correct figure with no aggregate row ever written.
4. `packages/domain/tsconfig.json` excluding `src/**/*.test.ts` forces a matching `eslint.config.mjs` global-ignore entry because the typed ESLint project service cannot resolve files outside any tsconfig project; `tsconfig.test.json` is the standing follow-up.
5. The spec header's "22 scenarios" disagrees with the 18 `#### Scenario:` blocks in the body; the authoritative count is taken from the retrieved spec body.
