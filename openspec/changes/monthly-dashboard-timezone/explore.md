# Exploration: Timezone-consistent "monthly" boundary for the dashboard

**Change**: `monthly-dashboard-timezone` · **Date**: 2026-08-31 · **Phase**: explore

## Executive summary

"Ingresos del mes" under-counts because "current month" is computed in **two independent places, both in UTC**, which diverge for negative-offset users near a month boundary:

- **READ**: `packages/domain/src/dashboard/GetMonthlyDashboard.ts` — `monthRange` (L52-55) and `monthKey` (L57-58) use `getUTCFullYear()/getUTCMonth()` on `clock.now()`.
- **WRITE**: `packages/api/src/adapters/dynamodb/repositories/DynamoDBMonthlyAggregateRepository.ts` — `monthFromOccurredAt` (L198-201) buckets by the UTC month of `occurredAt`.

Repro confirmed: incomes at `2026-08-31T23:59:56.667Z` and `2026-09-01T00:11:41.645Z`, user in Peru (UTC-5) → UTC buckets `2026-08` and `2026-09`; on 2026-09-01 the dashboard reads `2026-09` and shows only the second.

Chosen direction (Option 2): the browser sends its IANA timezone per request; `APP_TIMEZONE` in `env.ts` (default `America/Lima`) is the fallback for Telegram / recurring / any omitted request. Both write bucketing and read boundary must use the **same** timezone via one pure `Intl.DateTimeFormat` helper (no date libraries).

The direction has one **CRITICAL** unaddressed gap: ADD/UPDATE/DELETE events for the same transaction must resolve to the same month bucket or the aggregate deltas never net to zero — per-request browser tz breaks that unless the resolved tz (or computed month) is persisted on the transaction.

## 1. Verification vs code — every task-context claim CONFIRMED

| Claim | Evidence |
|---|---|
| READ derives month in UTC | `GetMonthlyDashboard.ts` L52-58, L87, L105-112 |
| WRITE buckets by UTC month of `occurredAt` | `DynamoDBMonthlyAggregateRepository.ts` L198-201, L209 (per-snapshot) |
| Aggregates updated async via SQS → `applyTransactionEvent` | `handlers/transaction/processTransactionEvents.ts` L21 (batchItemFailures retry) |
| Events published in `transactionMutations.ts` | L19-119; schema `events/transactionEvents.ts` |
| `publishSafely` swallows publish failures | `transactionMutations.ts` L121-133 (log, no rethrow) |
| Client default `occurredAt = new Date().toISOString()` | `TransactionForm.tsx` L98 |
| `DatePickerField` emits `Date.UTC(localY,localM,localD,12,0,0,0)` | `DatePickerField.tsx` L39-49 |
| Read chain hook→query→api→handler | `useMonthlyDashboard.ts`→`queries.ts`→`dashboardApi.ts`→`apiClient.get('/dashboard/monthly')`→`handlers/dashboard/getMonthlyDashboard.ts` L10 |
| No server user store, only Cognito `sub` | `middleware/withAuth.ts` L41-44 |
| Preferred currency in `localStorage` only; settings page exists | `features/settings/usePreferredCurrency.ts`; `features/settings/pages/SettingsPage.tsx` |
| `env.ts` centralized (`as const`, no `APP_TIMEZONE`) | `packages/api/src/env.ts` |
| `Clock` port `now()/nowIso()`; `SystemClock` = `new Date()` | `domain/src/shared/Clock.ts`, `adapters/system/SystemClock.ts` |
| Telegram writes, no browser tz | `telegram/conversations/recordTransaction.ts` L155-166 (`occurredAt: new Date()`, hard-coded `'PEN'`) |
| Lambda runs UTC | AWS sets `TZ=UTC`; runtime `nodejs22.x` (`infra-sls/serverless.yml` L11) → full ICU + `Intl.supportedValuesOf` |

**Corrections / additions:**

1. **The event's top-level `occurredAt` is the publish instant, not the transaction time.** `transactionMutations.ts` sets `occurredAt: new Date().toISOString()` on the envelope; the real timestamp is in the snapshot (`after.occurredAt` / `before.occurredAt` via `transactionSnapshotFromEntity`, `transactionEvents.ts` L53-59). The aggregate repo correctly buckets off `snapshot.occurredAt`, **per snapshot** (an update moving `occurredAt` across a boundary emits `-1` old month, `+1` new month).
2. **The fallback path has the SAME UTC bug.** `GetMonthlyDashboard` calls `transactionRepo.summarizeMonthlyByCurrency(userId, range)` only when the aggregate is `undefined` OR empty (L109-112). That fallback (`DynamoDBTransactionRepository.ts` L740-810) filters `occurredAt >= :from AND occurredAt <= :to` from the UTC `monthRange`. Fixing only the aggregate path leaves this wrong.
3. **Aggregate path and fallback disagree on the upper bound.** `monthRange.to = now`; the fallback honors `occurredAt <= now` (excludes future-dated same-month), but the aggregate `listMonthlySummaries` queries the whole month prefix with no upper bound (includes them). Pre-existing inconsistency to resolve.
4. **Real SK prefixes** (`keyBuilders.ts` L28-37, L61-64): `MONTHLY_AGG#`, `MONTHLY_CAT_AGG#` (not `MONTHLY_CATEGORY_AGG#`), `PROCESSED_EVENT#`. Wipe list must use these.
5. **ZERO tests in the repo.** `packages/domain` and `packages/api` `test` scripts are `echo 'no tests yet'`; no `*.test.ts`/`*.spec.ts` outside `node_modules`; no vitest/jest config; web has no test setup. "Update tests" is a non-task; "add tests" implies standing up a runner first.
6. **`GetMonthlyDashboardInput` today is `{ userId: string }` only** (L48-50); handler passes `{ userId: event.userId }` — no tz plumbing exists.
7. **`GET /dashboard/monthly` takes no query params**; no `MonthlyDashboardQuerySchema`. `validateQuery` exists (`middleware/withValidation.ts` L50-62), treats missing query as `{}`.
8. **`zIso8601`** (`shared-types/src/date.ts`) is a loose `Date.parse` refine; the event schema uses strict `z.string().datetime()`. Both client stampings satisfy strict.

## 2. Touchpoints by package

**domain**
- `src/dashboard/GetMonthlyDashboard.ts` — `monthRange`/`monthKey` become tz-aware; `GetMonthlyDashboardInput` gains `timezone: string`.
- **NEW** `src/shared/accountingMonth.ts` — pure `monthKeyInTimeZone(instant, tz): string` + `monthRangeInTimeZone(instant, tz): {from,to}` via `Intl.DateTimeFormat`; export from `src/index.ts`.
- `src/transaction/TransactionRepository.ts` — `summarizeMonthlyByCurrency(userId, range)` shape stays (tz-derived `range` suffices for the current month); only callers change.
- `src/transaction/Transaction.ts` + `CreateTransactionProps` — only if persisting `accountingTimezone`/`accountingMonth` (W1/W2).
- `src/shared/Clock.ts` — only if folding tz into a port (option B).

**api**
- `src/env.ts` — add `appTimezone: process.env.APP_TIMEZONE ?? 'America/Lima'`.
- `src/handlers/dashboard/getMonthlyDashboard.ts` — resolve tz (query param / header), validate, default `env.appTimezone`, pass `timezone` into `container.getMonthlyDashboard`.
- `src/adapters/dynamodb/repositories/DynamoDBMonthlyAggregateRepository.ts` — `monthFromOccurredAt` → `monthKeyInTimeZone(new Date(snapshot.occurredAt), event.timezone ?? env.appTimezone)`; import domain helper.
- `src/events/transactionEvents.ts` — add `timezone` (IANA, `zIanaTimeZone`) to each event variant (envelope-level); consider `optional` for a transition window.
- `src/application/transactionMutations.ts` — thread `timezone` through `addTransactionWithEvents`, `updateTransactionWithEvents`, `deleteTransactionWithEvents`, `deleteWalletWithEvents`, `publishMaterializedTransactionEvents`; include in every `publishSafely({...})`. Decide the swallow behavior (§5).
- `src/handlers/transaction/addTransaction.ts`, `patchTransaction.ts`, `deleteTransaction.ts` — read request tz, pass into the `*WithEvents` calls.
- `src/handlers/wallet/deleteWallet.ts` — same for `deleteWalletWithEvents`.
- `src/handlers/recurring/*` (materialize) — `publishMaterializedTransactionEvents` uses `env.appTimezone`.
- `src/telegram/conversations/recordTransaction.ts` — pass `env.appTimezone`.
- `src/handlers/transaction/processTransactionEvents.ts` — default missing `timezone` to `env.appTimezone` for in-flight messages.
- `src/composition/container.ts` — unchanged unless a calendar port/adapter is added.

**shared-types**
- **NEW** `src/timezone.ts` (or extend `src/date.ts`) — `zIanaTimeZone` via `Intl.DateTimeFormat` try/catch refine (mirrors `date.ts`); optional `Intl.supportedValuesOf` allowlist.
- `src/schemas/dashboard.ts` — `MonthlyDashboardQuerySchema = { tz?: zIanaTimeZone }` if param-based.
- `src/schemas/transaction.ts` — optional `timezone` on `AddTransactionRequestSchema`/`UpdateTransactionRequestSchema` if body-field approach.
- `src/index.ts` — export new schema(s).

**web**
- `src/lib/api/client.ts` — cleanest single site: attach `X-Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone` to every request.
- **NEW** `src/lib/timezone.ts` — `getBrowserTimeZone()` with fallback.
- `src/features/dashboard/dashboardApi.ts` + `queries.ts` — if param-based: pass `tz` and add it to the React Query `queryKey` (`dashboardKeys.monthly()`); `staleTime: 30_000` would otherwise mask the fix.
- `src/features/transactions/**` — if body-field: `TransactionForm` + add/edit pages + `transactionsApi` add `timezone`.
- `src/components/common/DatePickerField.tsx` — separate latent bug: a picked day stamped at noon UTC can land in the wrong local month for far-from-UTC users.
- `src/features/settings/**` — OPTIONAL "Zona horaria" section (`SettingsPage.tsx` + new `TimeZoneSection.tsx` + `useTimeZone` hook mirroring `usePreferredCurrency`, `schemas.ts`) if a manual override is wanted.
- `src/lib/i18n.ts` — strings only if settings UI is added.

**infra**
- `infra-sls/serverless.yml` — add `APP_TIMEZONE: ${env:APP_TIMEZONE, 'America/Lima'}` under `provider.environment`; add `X-Timezone` to `httpApi.cors.allowedHeaders` if header transport. Runtime `nodejs22.x` already fine.
- `infra-cdk/**` — check whether the SQS consumer env is wired here; aggregate table / TTL / GSI unaffected.

## 3. Timezone flow options (no decision)

**Read-side month computation:**

| Option | Pros | Cons |
|---|---|---|
| A. `timezone` as use-case input; domain computes via pure `src/shared/` helper | Domain owns the accounting period; unit-testable, no I/O; no new port; `Intl` is stdlib | Domain param looks presentation-ish (it is really an accounting input) |
| B. New `AccountingCalendar` port (or fold tz into `Clock`); `Intl` adapter in api | Keeps `Intl` out of domain if you consider tz math "infra" | Heavy for a stdlib call; still pass tz through the input; more wiring |
| C. Compute `month`+`range` at the api boundary, pass in; domain date-free | Domain stays completely date-free; one computation site | Accounting-month rule leaks into the handler; must be shared with the write path; use case becomes a passthrough |

Leaning A (matches the existing `Date.UTC` style in this file), but a design-phase call.

**IANA validation location:** `shared-types` `zIanaTimeZone` (try/catch refine, optional allowlist) reused by web + api and matching the `date.ts` precedent; vs api handler-only; vs domain returning a domain error (against the "validate user input at the handler boundary" gate in `sw-hexagonal`). Framing: structural validation in `shared-types`; the handler falls back to `env.appTimezone` on absent/invalid rather than 400-ing (a bad `X-Timezone` header must not break the dashboard).

**Write-side consistency (the hard part):**

| Option | Pros | Cons |
|---|---|---|
| W1. Persist resolved `accountingTimezone` (IANA) on the transaction; `before` snapshot + later events carry it | Deltas always reverse against the original bucket; travel-safe; read path can still use the request tz | New persisted field across `Transaction` prop, `CreateTransactionProps`, DDB mapper, `TransactionSnapshot` schema, response DTO |
| W2. Persist computed `accountingMonth` ("YYYY-MM") per transaction; events carry `before.month`/`after.month` | Consumer needs no `Intl`; unambiguous | Same persistence surface; month frozen even if the rule changes; still need per-snapshot month for occurredAt-moving updates |
| W3. Writes always bucket with `env.appTimezone` (ignore per-request tz on write path); per-request tz affects only the read boundary | Simplest; always consistent; **correct today** for the single Peru user with `APP_TIMEZONE=America/Lima` (read and write both equal `America/Lima`) | Diverges again if the fixed tz is ever wrong for a real user |
| W4. Accept + document the limitation | Least work | Latent corruption; hard to debug later |

W3 is the smallest change that is actually consistent and is correct for the present data reality; W1/W2 are the robust answers if multi-timezone use is real. This is the key design decision.

**Event payload — raw `timezone` vs precomputed `month`:**

| Option | Pros | Cons |
|---|---|---|
| Carry `timezone` on the event; consumer computes per-snapshot month | Single bucketing impl; handles `TransactionUpdated` crossing a boundary; nothing frozen at publish | Consumer needs `Intl`; requires the same tz at create/update/delete (→ W1/W3) |
| Carry precomputed `month` per snapshot (`before.month`, `after.month`) | Trivial consumer; unambiguous | Two computation sites (publisher + dashboard read) must share the helper or they re-diverge; month frozen |
| Single `month` on the envelope | Simplest schema | BROKEN for updates that move `occurredAt` across a month — do not do this |

## 4. "Accounting month" concept

- Half-open interval `[first instant of month in tz, first instant of next month in tz)`; current code uses `to: now`. The spec must state explicitly whether "this month" includes future-dated entries (aggregate path says yes, fallback says no).
- `monthRangeInTimeZone` needs care: there is no `Date.from(localParts, tz)`. Format `now` → `{year, month}` for `tz`, then compute the UTC instant of `year-month-01T00:00` local using the tz offset **at that target instant** (can differ from the offset at `now` if a DST change falls mid-month; month starts are never the ambiguous/skipped DST wall-clock instants).
- `monthKeyInTimeZone` is simple: `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit' }).format(instant)` → `"YYYY-MM"`; used directly as the DDB SK so it must be stable and zero-padded.
- Derive `monthRange` from `monthKey` (parse key + tz offset) so the two helpers cannot disagree.

## 5. Secondary bug: silent publish failure + permanently trusted stale aggregate

1. `publishSafely` (`transactionMutations.ts` L121-133) catches and logs SQS publish failures without rethrowing → the transaction write succeeds but no event is enqueued, so the aggregate silently misses that transaction.
2. `GetMonthlyDashboard` falls back to `summarizeMonthlyByCurrency` only when the aggregate is `undefined` or **empty** (L109-112). Once a month has any aggregate row, a missing/partial aggregate is trusted forever.

Options (no decision): rethrow from `publishSafely` (couples writes to SQS; client idempotency keys make retry safe) · transactional outbox (`OUTBOX#` item in the same `TransactWriteItems` + a Streams publisher — biggest change, likely overkill) · freshness check on read (store `lastEventAt`/`transactionCount` per aggregate, compare to a source count, fall back/recompute on mismatch) · treat the aggregate as a pure cache and always recompute the current month via `summarizeMonthlyByCurrency` · **delete the whole aggregate/event pipeline** (`MONTHLY_AGG#`/`MONTHLY_CAT_AGG#`/`PROCESSED_EVENT#`, the SQS queue, `processTransactionEvents`, `DynamoDBMonthlyAggregateRepository`) and always use a tz-aware `summarizeMonthlyByCurrency` — removes the entire read/write divergence class **and** this bug; large deletion but the wipe is already planned; a strong candidate at this data scale · observability only (metric + alarm + manual recompute Lambda — a band-aid).

## 6. DST / edge cases for spec + design

- **UTC-5, last hour of month**: `2026-08-31T23:59:56Z` = `18:59:56 -05` → `2026-08`; `2026-09-01T00:11:41Z` = `2026-08-31 19:11 -05` → still `2026-08`.
- **Timezones ahead of UTC** (`Asia/Tokyo` +09): `2026-08-31T20:00:00Z` = `2026-09-01 05:00 +09` → `2026-09` while UTC says `2026-08`. The fix must work both directions.
- **Peru currently has no DST** (`America/Lima` fixed -05); the helper must key off the IANA name (not a numeric offset) so a future DST tz still works.
- **DST transition inside a month**: month boundaries are never the skipped/duplicated DST wall-clock instants, so `monthKey` is unambiguous; `monthRange.from` must use the tz offset at the month start.
- **Invalid IANA string**: `new Intl.DateTimeFormat('en-US', { timeZone: 'Foo/Bar' })` throws `RangeError`. Decide fallback vs 400. `Intl` is effectively case-sensitive (`america/lima` throws). Empty/missing → `env.appTimezone`.
- **`Intl.supportedValuesOf('timeZone')`** (Node 18+, on `nodejs22.x`) omits some alias/link names → a try/catch construction is the more permissive validator.
- **Runtime**: `TZ=UTC` + `nodejs22.x` ship full ICU — no `full-icu` package/layer. Confirm `serverless-offline` and any CDK-defined Lambdas also run Node ≥18 with full ICU.
- **`DatePickerField`** noon-UTC stamping can still place a picked day in the wrong month.
- **React Query** `staleTime: 30_000` — tz must enter the `queryKey` if param-based.

## 7. Open questions for `sdd-propose`

1. Is "the month" defined by the device timezone at each request, or by one configured `APP_TIMEZONE`? (A fixed `America/Lima` is already correct for the single Peru user — is per-request tz worth its cost now, or defer?)
2. If per-request tz on the write path: how do we guarantee create/update/delete of one transaction share a bucket — W1 (persist tz), W2 (persist month), or W3 (writes use `env.appTimezone`)?
3. Where does the timezone preference live — pure auto-detect (no storage), client-only `localStorage` (like preferred currency), or a new server-side `USER#<sub>/SETTINGS` item (there is no user store today)?
4. Telegram + recurring always `env.appTimezone` — and is `America/Lima` the right default to ship?
5. Does "this month" include future-dated transactions in the current month? (Aggregate path yes, fallback no — unify.)
6. Scope of the secondary reliability bug (§5): fix in this change or split out?
7. Do we keep the monthly aggregate table at all, or delete the pipeline and always use a tz-aware `summarizeMonthlyByCurrency`?
8. Exact wipe list: confirm `MONTHLY_AGG#`, `MONTHLY_CAT_AGG#`, `PROCESSED_EVENT#`; also wipe `TXN#` + wallet balances, or retain?
9. `DatePickerField` fix in this change or deferred?
10. Transport: `?tz=` query param + request body field, or a single `X-Timezone` header applied by `apiClient` to every request (needs a `httpApi.cors.allowedHeaders` entry)?

## 8. Existing tests to update

**None exist.** No `*.test.ts`/`*.spec.ts` outside `node_modules`; `packages/domain` and `packages/api` `test` scripts are `echo 'no tests yet'`; no vitest/jest config; web has no test setup. Adding coverage for this change (the `monthKeyInTimeZone`/`monthRangeInTimeZone` helper, tz-aware aggregate bucketing, dashboard boundary, `zIanaTimeZone`) requires first standing up a test runner — itself a scope decision. Minimum high-value: a pure-function unit test for the month helper (UTC-5 both sides of the boundary, a UTC+ timezone, invalid/missing tz, a DST-mid-month case).

## Risks

- **CRITICAL** — aggregate delta consistency across a transaction's lifetime: per-request browser tz can bucket `TransactionCreated` (device tz) and a later `TransactionUpdated`/`TransactionDeleted` (different device tz, or Telegram's `env.appTimezone`) into different months, so the `-1` never cancels the original `+1` and the aggregate is permanently wrong. Must be resolved by W1/W2/W3.
- **HIGH** — the fallback `summarizeMonthlyByCurrency` shares the UTC bug; fixing only the aggregate path still returns a wrong number whenever the aggregate is empty. Both paths must move to the same tz-aware boundary in the same change.
- **HIGH** — silent publish failure + empty-only fallback: a dropped SQS publish makes the dashboard silently and permanently under-count for that month; compounds the primary bug.
- **MEDIUM** — event schema migration: messages already in the queue at deploy time lack `timezone`; make it optional / `?? env.appTimezone` for a transition window, or drain the queue during the planned wipe.
- **MEDIUM** — `monthRangeInTimeZone` correctness (offset must be taken at the target instant, not at `now`); needs a DST-mid-month unit test.
- **MEDIUM** — `DatePickerField` noon-UTC stamping still mis-months back-dated entries if left out of scope.
- **MEDIUM** — read uses the request tz but writes use `env.appTimezone` (W3) → mismatch for any user whose real tz differs from `APP_TIMEZONE`; fine for the current single user, a landmine for a second.
- **LOW** — React Query stale cache hides the fix unless `tz` enters the `queryKey`.
- **LOW** — an `X-Timezone` header needs adding to `httpApi.cors.allowedHeaders` or browsers strip it.
- **LOW** — confirm non-`serverless.yml` runtimes (CDK Lambdas, `serverless-offline`) are Node ≥18 with full ICU.
- **LOW** — an `Intl.supportedValuesOf` allowlist would reject valid alias tz names; prefer try/catch.

## Next recommended

`sdd-propose` — must resolve the CRITICAL write-consistency decision (W1/W2/W3 or delete the aggregate pipeline), the transport (header vs param+body), and the scope of the secondary reliability bug (fix vs defer vs delete).
