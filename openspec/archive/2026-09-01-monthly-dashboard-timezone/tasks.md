# Tasks: monthly-dashboard-timezone

> SDD phase: tasks
> Project: smart-wallet
> Change: monthly-dashboard-timezone
> Date: 2026-09-01
> Engram topic_key: `sdd/monthly-dashboard-timezone/tasks`

**Branch**: `feat/monthly-dashboard-timezone`
**Delivery**: single PR, `delivery_strategy: exception-ok` — size accepted, no chaining.
**Order**: dependency-linear. Helper + Vitest runner first (leaf everything imports),
then domain use case, then api (`env` → handler → container → aggregate repo),
then web, then infra, then docs/runbook, then full verification.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200–260 authored (helper ~60, test ~70, rest small edits); pnpm-lock delta is generated/excluded |
| Files created | 3 (`accountingMonth.ts`, `vitest.config.ts`, `accountingMonth.test.ts`) |
| Files modified | ~10 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception (pre-accepted by maintainer; not required at this forecast size) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Shared accounting-month helper + Vitest runner in `packages/domain` | PR 1 | `pnpm --filter @smart-wallet/domain test` | Vitest (unit) — real DST/boundary cases | Revert `accountingMonth.ts`, `vitest.config.ts`, test, `package.json`/`tsconfig.json` edits |
| 2 | Read path + api wiring + aggregate write bucket adopt the helper | PR 1 | `pnpm --filter @smart-wallet/domain --filter @smart-wallet/api typecheck` | Manual post-deploy: repro pair in one card; aggregate==fallback | Revert `GetMonthlyDashboard.ts`, `env.ts`, handler, `container.ts`, `DynamoDBMonthlyAggregateRepository.ts` |
| 3 | `DatePickerField` local-noon stamping | PR 1 | `pnpm --filter @smart-wallet/web typecheck && pnpm --filter @smart-wallet/web lint` | Manual: pick 31 Aug at UTC-5 → lands 31 Aug | Revert `DatePickerField.tsx` |
| 4 | Infra env + docs/runbook | PR 1 | `pnpm --filter @smart-wallet/infra-sls typecheck` | N/A — config + docs only | Drop `APP_TIMEZONE` from `serverless.yml` |

Threat matrix: design §7 = **N/A** (no routing, shell, subprocess, VCS/PR automation, or
process-integration boundary). No RED threat-test tasks.

---

## Phase 1 — Domain helper + Vitest runner (leaf)

- [x] **T-01** Create `packages/domain/src/shared/accountingMonth.ts` with `isValidTimeZone(tz): boolean`,
  `monthKeyInTimeZone(instant, timeZone): string` (explicit `String(y).padStart(4,'0')` + `padStart(2,'0')`,
  SK-safe), `monthRangeInTimeZone(instant, timeZone): { from, to }` — range **derived from the key**,
  two-pass offset fixed point (offset at the target instant, never at `now`), `to = instant`. Per design ADR-3.
  Pure, no I/O, no new port (sw-hexagonal: `Intl` is stdlib). Satisfies spec R2, R3.
  Verify: `pnpm --filter @smart-wallet/domain typecheck`.
- [x] **T-02** Modify `packages/domain/src/shared/index.ts`: add
  `export { isValidTimeZone, monthKeyInTimeZone, monthRangeInTimeZone } from './accountingMonth.js';`
  (named-export style). Deps: T-01. Verify: `pnpm --filter @smart-wallet/domain typecheck`.
- [x] **T-03** _(VITEST RUNNER STAND-UP — must complete before T-06)_ Add `vitest` devDependency to
  `packages/domain/package.json` and set `"test": "vitest run"` (replaces `echo 'no tests yet'`); run
  `pnpm install`. Independent of T-01/T-02. Verify: `pnpm --filter @smart-wallet/domain test` exits 0
  (no test files yet). Satisfies spec R11.
- [x] **T-04** _(VITEST RUNNER STAND-UP — must complete before T-06)_ Create `packages/domain/vitest.config.ts`:
  `defineConfig({ test: { include: ['src/**/*.test.ts'] } })`, no globals. Per design ADR-6. Deps: T-03.
- [x] **T-05** _(VITEST RUNNER STAND-UP — must complete before T-06)_ Add `"exclude": ["src/**/*.test.ts"]`
  to `packages/domain/tsconfig.json` so `tsc --build` skips tests. Deps: T-03.
  Verify: `pnpm --filter @smart-wallet/domain typecheck` still green.
- [x] **T-06** Create `packages/domain/src/shared/accountingMonth.test.ts` with the six cases from design
  ADR-6: (1) `America/Lima` boundary keys, (2) `America/Lima` range `from = 2026-08-01T05:00:00.000Z`
  + `to` identical to input, (3) `Asia/Tokyo` UTC+ ahead-of-UTC month/range, (4) `Europe/Madrid` DST
  mid-month — month start stays `2026-09-30T22:00:00.000Z`, (5) no-DST stability (`America/Lima` Jan & Jul
  starts both `T05:00:00.000Z`), (6) `isValidTimeZone` true/false table. Import `{ describe, it, expect }`
  from `vitest`. Deps: T-01, T-04, T-05. Verify: `pnpm --filter @smart-wallet/domain test` passes;
  confirm the DST literals against actual run output (design §10 open item). Satisfies spec R11, R3.

## Phase 2 — Domain read path

- [x] **T-07** Modify `packages/domain/src/dashboard/GetMonthlyDashboard.ts`: add `timezone: string` to
  `GetMonthlyDashboardInput`; drop `monthlyAggregateRepo?` from `GetMonthlyDashboardDeps`; delete the local
  `monthRange`/`monthKey` (L52-58); `const range = monthRangeInTimeZone(deps.clock.now(), input.timezone)`;
  `transactionSummaries` is always `await deps.transactionRepo.summarizeMonthlyByCurrency(userId, range)`
  (stop reading the aggregate — design ADR-1 option (c)). Deps: T-02.
  Verify: `pnpm --filter @smart-wallet/domain typecheck`. Satisfies spec R2, R4, R5, R7, R9.

## Phase 3 — API wiring (`env` → handler → container → aggregate repo)

- [x] **T-08** Modify `packages/api/src/env.ts`: resolve `appTimezone` at module load —
  `isValidTimeZone(process.env.APP_TIMEZONE)` check; on invalid/absent/blank, one `console.error` and fall
  back to `'America/Lima'`; **never throw** (env.ts is imported by every handler). Deps: T-02.
  Verify: `pnpm --filter @smart-wallet/api typecheck`. Satisfies spec R1.
- [x] **T-09** Modify `packages/api/src/handlers/dashboard/getMonthlyDashboard.ts`:
  `container.getMonthlyDashboard({ userId: event.userId, timezone: env.appTimezone })`. Deps: T-07, T-08.
  Verify: `pnpm --filter @smart-wallet/api typecheck`. Satisfies spec R1, R9.
- [x] **T-10** Modify `packages/api/src/composition/container.ts`: `makeGetMonthlyDashboard({ walletRepo,
  transactionRepo, clock })` — drop `monthlyAggregateRepo` (L153); `new DynamoDBMonthlyAggregateRepository(
  env.appTimezone)` (L68). **Keep** the `monthlyAggregateRepo` const + its export (L157) — `processTransactionEvents`
  still uses them (aggregate pipeline kept, write-only). Deps: T-07, T-08, T-11.
  Verify: `pnpm --filter @smart-wallet/api typecheck`. Satisfies spec R1.
- [x] **T-11** Modify `packages/api/src/adapters/dynamodb/repositories/DynamoDBMonthlyAggregateRepository.ts`:
  `constructor(private readonly timeZone: string)`; delete `monthFromOccurredAt` (L198-201); `addSnapshotDeltas`
  uses `monthKeyInTimeZone(new Date(snapshot.occurredAt), timeZone)` (still per-snapshot, `before`/`after`
  still emit −1/+1). `listMonthlySummaries` **unchanged** — no `occurredAt <= now` bound (an aggregate row
  has no per-transaction timestamp; design ADR-1). Deps: T-02.
  Verify: `pnpm --filter @smart-wallet/api typecheck`. Satisfies spec R2, R4, R6.

## Phase 4 — Web (parallel with Phases 1–3)

- [x] **T-12** Modify `packages/web/src/components/common/DatePickerField.tsx`: replace
  `new Date(Date.UTC(y, m, d, 12, 0, 0, 0))` with `new Date(y, m, d, 12, 0, 0, 0)` (local noon, design ADR-4)
  and update the JSDoc to state the picked day resolves in the browser-local calendar. No feature-folder or
  React Query `queryKey` change. Verify: `pnpm --filter @smart-wallet/web typecheck && pnpm --filter
  @smart-wallet/web lint`. Satisfies spec R10.

## Phase 5 — Infra (parallel with Phases 1–4)

- [x] **T-13** Modify `packages/infra-sls/serverless.yml`: add
  `APP_TIMEZONE: ${env:APP_TIMEZONE, 'America/Lima'}` under `provider.environment` (not a reserved key like
  `AWS_REGION`). Verify: YAML parses and `pnpm --filter @smart-wallet/infra-sls typecheck`. Satisfies spec R1.
- [x] **T-14** `.env.example`: the tasks-phase claim "no such file exists" is **incorrect** — `fd -H` finds
  `.env.example` at the repo root, `packages/infra-sls/.env.example`, and `packages/web/.env.example` (they are
  dotfiles, so a plain `fd .env.example` without `-H` misses them). Per design §4 the `infra-sls` and root
  `.env.example` (which document the serverless/API env vars) should gain `APP_TIMEZONE=America/Lima`.
  **Apply blocked**: this apply environment denies all read/write access to `.env*` paths, so the executor
  could not edit them. A human must add `APP_TIMEZONE=America/Lima` to the root and `packages/infra-sls/.env.example`.
  Not functionally required — `serverless.yml` (T-13) and `env.ts` (T-08) already default to `America/Lima`.

## Phase 6 — Docs / runbook / tech-debt (parallel)

- [x] **T-15** Confirm the change folder documents the **operator-run** optional cleanup (never coded, never
  assistant-run): after deploy, an operator MAY delete stale items under `PK = USER#<sub>` with SK prefixes
  `MONTHLY_AGG#`, `MONTHLY_CAT_AGG#`, `PROCESSED_EVENT#` (design §8 step 2 / §9). Ensure `design.md` and
  `proposal.md` both carry the "no data deletion by software" note. No code. Satisfies spec R8.
  **Apply: confirmed** — `design.md` §8 step 2 + §9 and `proposal.md` D6 (L87), §rollout step 2 (L111),
  §rollback (L164) all state the wipe is a manual operator step, never code/assistant. No code changed.
- [x] **T-16** Confirm both recorded tech-debt items stay noted in `design.md` §8/§10 (and Engram) and are
  **not scheduled** here: (a) the partition-wide `begins_with('TXN#')` scan in `summarizeMonthlyByCurrency`
  — future fix is a per-wallet `SK BETWEEN` range query; (b) the now write-only aggregate + SQS pipeline.
  No code. **Apply: confirmed** — `design.md` ADR-1 ("Cost, honestly" + §8 step 4 tripwire) covers (a);
  ADR-1 + §9 cover (b) as the kept write-only pipeline. Neither is scheduled in this change. Engram
  `mem_save` remains unavailable in this environment, so the Engram copy is not refreshed this batch.

## Phase 7 — Full verification (sequential, last)

- [x] **T-17** Workspace-wide `pnpm typecheck && pnpm lint && pnpm test` from repo root — all green
  (`turbo run test` fans out to the new `packages/domain` Vitest). Deps: T-01..T-16.
  **Apply: green** — `pnpm typecheck` 9/9 tasks OK; `pnpm lint` 9/9 OK (1 pre-existing
  `react-hooks/exhaustive-deps` warning in `useMonthlyDashboard.ts:62`, an untouched file, 0 errors);
  `pnpm test` 9/9 OK, `@smart-wallet/domain` Vitest 4.1.11 → 1 file / 7 tests passed. Combined command
  exit 0.
- [ ] **T-18** Manual repro-pair check (local `serverless-offline` + DynamoDB Local, or post-deploy):
  `APP_TIMEZONE=America/Lima`; create income transactions at `2026-08-31T23:59:56.667Z` and
  `2026-09-01T00:11:41.645Z`. Load the August dashboard → both appear in the same "Ingresos del mes" total;
  the aggregate-backed figure equals the fallback figure per currency. Satisfies spec R3, R5.
- [ ] **T-19** Manual future-dated exclusion check: with `now` inside the current month, create a transaction
  whose `occurredAt` is later today (after `now`) in the same calendar month. Confirm it is excluded from the
  current-month total on **both** the aggregate-backed path and the fallback `summarizeMonthlyByCurrency`
  path, and the two totals match. Satisfies spec R4.
- [ ] **T-20** Also verify (manual, if convenient): a transaction created → updated across a month boundary →
  deleted leaves `MONTHLY_AGG#` at its pre-transaction value for both months (spec R6); and a dropped
  aggregate event no longer leaves the card wrong because the current month is always recomputed (spec R7).
- [ ] **T-21** Single conventional commit (no Co-Authored-By, no AI attribution), push
  `feat/monthly-dashboard-timezone`, open PR referencing the SDD artifacts with the T-18/T-19 results.

> **Apply batch 1 status**: T-01–T-17 done on branch `feat/monthly-dashboard-timezone`; T-14 blocked
> (`.env*` access denied — see note); T-18–T-20 are manual runtime checks (`serverless-offline` +
> DynamoDB Local, neither installed) — checklist below; T-21 intentionally NOT executed (no commit /
> push / PR this batch). The Vitest helper suite (T-06, 7 passing cases) is the automated correctness
> evidence for this batch.

---

## Manual runtime verification checklist (T-18 – T-20)

These require a running API against DynamoDB Local. `serverless-offline` and `dynamodb-local` are
**not** in the repo's dependencies, so install them first or run the checks against a real `--stage`
deploy. Nothing here is automated and no deploy was performed by the apply phase.

### Prerequisites (one-time, local)

1. `pnpm --filter @smart-wallet/infra-sls add -D dynamodb-local` (or run DynamoDB Local via Docker:
   `docker run -p 8000:8000 amazon/dynamodb-local`).
2. Create the single table locally (PK `PK` / SK `SK`, plus GSI1 `GSI1PK`/`GSI1SK`) — mirror
   `packages/infra-cdk` `SingleTable`.
3. Start the API: from `packages/infra-sls`, `APP_TIMEZONE=America/Lima IS_OFFLINE=true DYNAMODB_ENDPOINT=http://localhost:8000 pnpm exec serverless offline --stage local`.
4. Auth header for every request: `X-Mock-User-Id: 11111111-1111-4111-8111-111111111111`.

### T-18 — repro pair lands in one card  (spec R3, R5)

1. Create a wallet (`POST /wallets`, currency e.g. `PEN`), note `walletId`.
2. `POST /wallets/{walletId}/transactions` with `type: income`, `amountCents: 1000`,
   `occurredAt: 2026-08-31T23:59:56.667Z`.
3. `POST /wallets/{walletId}/transactions` with `type: income`, `amountCents: 2000`,
   `occurredAt: 2026-09-01T00:11:41.645Z`.
4. Let the SQS consumer (`processTransactionEvents`) drain so `MONTHLY_AGG#2026-08` is written.
5. `GET /dashboard/monthly` while `now` is inside September 2026 → the response range is the
   **August** window; if `now` is still in August, force the August read by setting the system clock.
   **Expected**: `summariesByCurrency` for `PEN` shows `monthlyIncome` = 3000 cents (both txns), i.e.
   the `2026-09-01T00:11Z` transaction is bucketed into `2026-08` (America/Lima wall clock
   `2026-08-31T19:11`).
6. Cross-check parity: temporarily point the read at the aggregate (or inspect `MONTHLY_AGG#2026-08`
   directly) — the aggregate income total must equal the fallback `summarizeMonthlyByCurrency` total
   for `PEN`. **Expected**: identical per currency.

### T-19 — future-dated same-month transaction excluded on both paths  (spec R4)

1. With `now` early in the current month (America/Lima), create an income transaction whose
   `occurredAt` is later **today** but strictly after `now` (e.g. `now + 6h`).
2. Let the aggregate consumer drain.
3. `GET /dashboard/monthly`. **Expected**: the future transaction is **absent** from the
   current-month `monthlyIncome`, because `monthRangeInTimeZone` sets `to = clock.now()` and
   `summarizeMonthlyByCurrency` filters `occurredAt <= to`.
4. Compare the aggregate-backed figure (past-month cache path, not used for the current month) and the
   fallback figure for the current month. **Expected**: the dashboard always recomputes the current
   month from transactions, so the displayed total already excludes the future txn; if you separately
   query the aggregate it may include it (aggregate has no `occurredAt` bound) — this is exactly why
   ADR-1 forbids the aggregate serving the current month. The **displayed** total is the fallback
   total and is correct.

### T-20 — lifecycle nets to zero + dropped-event resilience  (spec R6, R7)

1. Create an income transaction with `occurredAt` in month A (e.g. `2026-07-15`). Drain consumer →
   `MONTHLY_AGG#2026-07` income rises by the amount.
2. `PATCH` the transaction so `occurredAt` moves to month B (e.g. `2026-08-15`). Drain consumer.
   **Expected**: `MONTHLY_AGG#2026-07` income returns to its pre-transaction value and
   `MONTHLY_AGG#2026-08` rises by the amount (the update event emits −1 for `before`, +1 for `after`,
   each bucketed with `monthKeyInTimeZone`).
3. `DELETE` the transaction. Drain consumer. **Expected**: both `MONTHLY_AGG#2026-07` and
   `MONTHLY_AGG#2026-08` are back to their original values (net zero for every affected month).
4. Dropped-event check: create a current-month transaction but do **not** run the consumer (simulate a
   lost SQS message). `GET /dashboard/monthly`. **Expected**: the "Ingresos del mes" total still
   includes the transaction, because the current month is always recomputed from
   `summarizeMonthlyByCurrency` and never trusts the (now stale) aggregate.

---

## Requirement coverage

| Spec requirement | Tasks |
|---|---|
| R1 Single configured accounting timezone | T-08, T-09, T-10, T-13 |
| R2 One shared month helper | T-01, T-02, T-07, T-11 |
| R3 Month membership = configured-tz wall clock | T-01, T-06, T-18 |
| R4 "This month" capped at now, both paths | T-07, T-11, T-19 |
| R5 Read and write agree for current month | T-07, T-18 |
| R6 Transaction lifecycle nets aggregate to zero | T-11, T-20 |
| R7 Dropped aggregate event does not corrupt card | T-07, T-20 |
| R8 No data deletion by software | T-15 |
| R9 Read boundary uses accounting-month helper | T-07, T-09 |
| R10 DatePickerField resolves picked day locally | T-12 |
| R11 Minimal Vitest runner for the helper | T-03, T-04, T-05, T-06 |

## Parallelism

- Sequential spine: T-01 → T-02 → T-07 → (T-09, T-10) ; T-11 → T-10.
- Vitest stand-up (T-03 → T-04, T-05) runs in parallel with T-01/T-02; T-06 needs T-01 + T-04 + T-05.
- T-08 parallel with T-07/T-11; T-09 needs T-07 + T-08; T-10 needs T-07 + T-08 + T-11.
- Phases 4, 5, 6 (T-12, T-13, T-14, T-15, T-16) are fully independent and parallelizable.
- Phase 7 (T-17..T-21) is strictly last.

## Bottlenecks / ownership

- `packages/api/src/composition/container.ts` (T-10) is the wiring chokepoint: it needs the domain
  signature change (T-07), `env.appTimezone` (T-08), and the repo constructor change (T-11) all landed first.
- One writer thread; the api edits (T-08..T-11) touch adjacent files and should be authored together.
