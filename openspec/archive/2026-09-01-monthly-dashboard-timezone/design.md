# Timezone-consistent monthly boundary — Design

## 1. Technical approach

One accounting rule, one pure function, one read path.

`packages/domain/src/shared/accountingMonth.ts` becomes the single definition of "the month" for a
given IANA timezone. `GetMonthlyDashboard` takes the timezone as an explicit use-case input and
derives `{from, to}` from it; `DynamoDBMonthlyAggregateRepository` buckets snapshots with the same
function and the same `env.appTimezone`. The current-month read stops trusting the aggregate and
always recomputes from transactions, which simultaneously fixes the staleness bug (D3) and makes the
`occurredAt <= now` cap (D4) structural instead of duplicated.

## 2. Architecture decisions

### ADR-1 — D3 mechanism: aggregate as a pure cache for past months only

**Choice**: `GetMonthlyDashboard` always computes the current month via
`transactionRepo.summarizeMonthlyByCurrency(userId, range)`. The aggregate + SQS pipeline keeps
running (D2) and keeps writing `MONTHLY_AGG#` / `MONTHLY_CAT_AGG#`, but the dashboard no longer reads
it. `monthlyAggregateRepo` is dropped from `GetMonthlyDashboardDeps` and from that one container
call site; the singleton stays (still used by `processTransactionEvents`).

| Option | Verdict |
|---|---|
| (a) rethrow from `publishSafely` | **Rejected — it is not actually safe.** `addTransactionWithEvents` publishes only `if (result.ok && !result.value.replay)` (`transactionMutations.ts` L21). A rethrow makes the client retry with the same `Idempotency-Key`, the retry returns `replay: true`, and the publish is skipped **forever**. The write succeeds, the event is lost, and the user sees a 5xx. It converts a silent hole into a loud hole. |
| (b) reconcile-on-read (`lastEventAt`/count) | Rejected. Needs new aggregate attributes, a cheap source-of-truth count that does not exist (counting `TXN#` costs the same Query as the recompute itself), and equal counts still do not prove equal sums. More schema, more code, still probabilistic. |
| (c) pure cache / always recompute current month | **Chosen.** Zero new schema, zero new attributes, no coupling of writes to SQS, self-healing by construction: a dropped, duplicated, or out-of-order event can no longer be observed. Reversible in one line (restore the aggregate read). |

**Cost, honestly**: `summarizeMonthlyByCurrency` queries `PK = USER#<id> AND begins_with(SK,'TXN#')`
— the whole transaction partition — with a projection and an `occurredAt` filter
(`DynamoDBTransactionRepository.ts` L740-808). At ~10k transactions that is roughly 2 MB scanned ≈
250 RCU per dashboard load, paginated by the existing loop. Acceptable at personal-finance scale;
the growth tripwire is documented in §8.

**Consequence for D4**: an aggregate item holds a pre-summed month with no per-transaction
`occurredAt`, so `listMonthlySummaries` **cannot** express `occurredAt <= now`. That is a structural
reason it must not serve the current month. `listMonthlySummaries` is therefore left unchanged: the
aggregate is only ever valid for months strictly before the current one, where capping at `now` is a
no-op. D4 is enforced once, by the `occurredAt <= :to` filter already present in the fallback.

**Consequence for the proposal**: `transactionMutations.ts` is **not modified** by this change.
`publishSafely` keeps logging and swallowing; it can no longer produce a wrong card.

### ADR-2 — Read-side shape: plain `timezone` input (option A)

**Choice**: `GetMonthlyDashboardInput = { userId: string; timezone: string }`; the handler passes
`env.appTimezone`. **Rejected**: (B) an `AccountingCalendar` port — `sw-hexagonal` reserves ports for
I/O collaborators; `Intl` is stdlib and the calculation is pure, so a port buys wiring, not
testability. (C) computing the range in the handler — leaks the accounting rule out of the domain and
the write path would still need the same helper, recreating two call sites.

### ADR-3 — `monthRangeInTimeZone` algorithm

The range is derived **from the key**, and the offset is taken **at the target instant** via a
two-pass fixed point, never at `now`.

```ts
type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

// formatToParts (not format) → locale-independent; calendar: 'gregory', hourCycle: 'h23'.
const wallClockOf = (instant: Date, timeZone: string): WallClock => { /* cached Intl.DateTimeFormat per tz */ };

/** The wall-clock reading re-read as if it were UTC. */
const asUtcMs = (w: WallClock): number => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/** Offset (ms east of UTC) in effect AT `instant`. */
const offsetMsAt = (instant: Date, tz: string): number => asUtcMs(wallClockOf(instant, tz)) - instant.getTime();

/** UTC instant whose `tz` wall clock equals `wallUtcMs` (read as UTC). */
const instantFromWallClock = (wallUtcMs: number, tz: string): Date => {
  const guess = wallUtcMs - offsetMsAt(new Date(wallUtcMs), tz); // offset near the target
  return new Date(wallUtcMs - offsetMsAt(new Date(guess), tz));  // refined: offset AT the target
};

export const monthKeyInTimeZone = (instant: Date, timeZone: string): string => {
  const w = wallClockOf(instant, timeZone);
  return `${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}`;
};

export const monthRangeInTimeZone = (instant: Date, timeZone: string): { from: Date; to: Date } => {
  const [y, m] = monthKeyInTimeZone(instant, timeZone).split('-').map(Number); // derived from the key
  return { from: instantFromWallClock(Date.UTC(y, m - 1, 1, 0, 0, 0), timeZone), to: instant }; // D4: capped at now
};
```

Why two passes: the first pass uses the offset near the target wall clock, the second uses the offset
at the resulting instant, so a DST change later in the month cannot shift the month start. A month
start is never a skipped or duplicated wall-clock instant in practice; if one ever were, the fixed
point still returns an instant that is after every instant of the previous month and before every
instant of the following month, so the range stays correct.

`monthKeyInTimeZone` is used verbatim as the DDB SK segment, so it must stay zero-padded — hence the
explicit `padStart` rather than a locale-formatted string.

### ADR-4 — `DatePickerField`: local noon in the browser timezone

**Choice**: replace `new Date(Date.UTC(y, m, d, 12, 0, 0, 0))` with `new Date(y, m, d, 12, 0, 0, 0)`
(local constructor) and update the JSDoc.

The picker hands back a `Date` already expressed in the browser's local calendar; the current code
re-reads those local Y/M/D as **UTC** fields, shifting the instant by the browser offset. Local noon
keeps the picked calendar day correct for any reader within ±12 h of the browser timezone — which
covers `APP_TIMEZONE` today (browser and server are both `America/Lima`) and stays correct if they
diverge by up to half a day. It also round-trips: `format(new Date(value))` (date-fns, local) renders
the same day the user clicked. Local **midnight** was rejected: it sits exactly on the boundary, so a
one-hour disagreement between the browser and `APP_TIMEZONE` moves the entry to the previous day, and
in the zones where DST starts at 00:00 that wall clock does not exist.

### ADR-5 — IANA validation: validated fallback at boot, logged, never throwing

**Choice**: `packages/api/src/env.ts` resolves `appTimezone` at module load through
`isValidTimeZone` (exported from the same domain helper, so the validator and the consumer share one
`Intl` construction). Invalid → one `console.error` and fall back to `'America/Lima'`.

Rationale: `env.ts` is imported by every handler, so throwing there takes the entire API down over a
typo in an unrelated env var. Falling back is not silent (it logs) and is not corrupting: the fallback
**is** the intended value, and because read and write both read the one resolved `env.appTimezone`,
the read/write invariant holds either way. Letting an unvalidated value reach `Intl` would instead
throw a `RangeError` per request and, in the SQS consumer, produce a redrive loop.

No `zIanaTimeZone` in `shared-types`: nothing crosses the wire (D1 — no header, no query param, no
body field), so a shared schema would be unused public surface.

### ADR-6 — Vitest in `packages/domain`

| Item | Decision |
|---|---|
| Runner | `vitest` as a devDependency of `packages/domain` only. No root/web/api runner. |
| Config | `packages/domain/vitest.config.ts`: `defineConfig({ test: { include: ['src/**/*.test.ts'] } })`. No globals — the test imports `{ describe, it, expect } from 'vitest'` so `eslint src` and the existing config need no change. |
| Script | `packages/domain/package.json` → `"test": "vitest run"` (replaces `echo 'no tests yet'`). Root `pnpm test` already fans out via `turbo run test`. |
| Location | `packages/domain/src/shared/accountingMonth.test.ts` (colocated; the repo has no `tests/` convention). |
| tsconfig | Add `"exclude": ["src/**/*.test.ts"]` to `packages/domain/tsconfig.json` so `tsc --build` (composite, emits to `dist`) does not compile tests. Trade-off: the test file is then not covered by `pnpm typecheck`; a `tsconfig.test.json` is a follow-up, not this change. |

Cases (the DST expectations must be confirmed by running the test — they are derived from IANA rules,
not observed):

1. `America/Lima` boundary: `2026-08-31T23:59:56.667Z` → `2026-08`; `2026-09-01T00:11:41.645Z` →
   `2026-08`; `2026-09-01T05:00:00.000Z` → `2026-09` (exact month start).
2. `America/Lima` range: `monthRangeInTimeZone(2026-09-01T00:11Z)` → `from = 2026-08-01T05:00:00.000Z`,
   `to` identical to the passed instant (D4).
3. `Asia/Tokyo` (+09, ahead of UTC): `2026-08-31T20:00:00Z` → `2026-09`, `from = 2026-08-31T15:00:00.000Z`.
4. DST mid-month (`Europe/Madrid`, October 2026; DST ends 25 Oct): for an instant late in the month
   (offset +01) the month start must still be `2026-09-30T22:00:00.000Z` (+02 at the start), not
   `…T23:00:00.000Z`. This is the exact regression the naive "offset at `now`" implementation causes.
5. No-DST stability: `America/Lima` month starts are `T05:00:00.000Z` in both January and July 2026.
6. `isValidTimeZone`: `'America/Lima'` and `'UTC'` → true; `'Foo/Bar'` and `''` → false. The explore's
   claim that `Intl` rejects lowercase names is **not** asserted — ECMA-402 matches zone names
   ASCII-case-insensitively, so it is likely wrong and nothing depends on it.

## 3. Data flow

```
WRITE   handler → *WithEvents → publishSafely → SQS → processTransactionEvents
                                                        │
                                                        ▼
                              DynamoDBMonthlyAggregateRepository(env.appTimezone)
                                monthKeyInTimeZone(snapshot.occurredAt, tz)  ← per snapshot
                                        │  (past-month cache only)
                                        ▼
                                   MONTHLY_AGG# / MONTHLY_CAT_AGG#

READ    GET /dashboard/monthly → handler {userId, timezone: env.appTimezone}
                                    ▼
                     GetMonthlyDashboard → monthRangeInTimeZone(clock.now(), tz)
                                    ▼
                     transactionRepo.summarizeMonthlyByCurrency(userId, {from, to})   ← always
```

Both arrows call the same helper with the same `env.appTimezone`; there is no second definition left.

## 4. File changes

| File | Action | Shape |
|---|---|---|
| `packages/domain/src/shared/accountingMonth.ts` | Create | `isValidTimeZone(tz: string): boolean`, `monthKeyInTimeZone(instant: Date, timeZone: string): string`, `monthRangeInTimeZone(instant: Date, timeZone: string): { from: Date; to: Date }` |
| `packages/domain/src/shared/index.ts` | Modify | `export { isValidTimeZone, monthKeyInTimeZone, monthRangeInTimeZone } from './accountingMonth.js';` (named-export style, matching the file) |
| `packages/domain/src/dashboard/GetMonthlyDashboard.ts` | Modify | `GetMonthlyDashboardInput` gains `timezone: string`; drop `monthlyAggregateRepo?` from `GetMonthlyDashboardDeps`; delete the local `monthRange`/`monthKey` (L52-58); `const range = monthRangeInTimeZone(deps.clock.now(), input.timezone)`; `transactionSummaries` is always `await deps.transactionRepo.summarizeMonthlyByCurrency(userId, range)` |
| `packages/api/src/env.ts` | Modify | `appTimezone: resolveTimeZone(process.env.APP_TIMEZONE)` — `isValidTimeZone` check, `console.error` + `'America/Lima'` on invalid/absent |
| `packages/api/src/handlers/dashboard/getMonthlyDashboard.ts` | Modify | `container.getMonthlyDashboard({ userId: event.userId, timezone: env.appTimezone })` |
| `packages/api/src/composition/container.ts` | Modify | `makeGetMonthlyDashboard({ walletRepo, transactionRepo, clock })` (drop `monthlyAggregateRepo`, L153); `new DynamoDBMonthlyAggregateRepository(env.appTimezone)` (L68). The `monthlyAggregateRepo` const and its export (L157) stay — `processTransactionEvents` uses them |
| `.../repositories/DynamoDBMonthlyAggregateRepository.ts` | Modify | `constructor(private readonly timeZone: string)`; `monthFromOccurredAt` deleted; `addSnapshotDeltas(snapshot, sign, timeZone, totals, categories)` uses `monthKeyInTimeZone(new Date(snapshot.occurredAt), timeZone)`. Still per snapshot, so `before`/`after` still emit −1/+1. `listMonthlySummaries` unchanged (see ADR-1) |
| `packages/web/src/components/common/DatePickerField.tsx` | Modify | Local-noon stamping (ADR-4) + JSDoc |
| `packages/infra-sls/serverless.yml` | Modify | `provider.environment`: `APP_TIMEZONE: ${env:APP_TIMEZONE, 'America/Lima'}` |
| `packages/domain/package.json` | Modify | `vitest` devDependency; `"test": "vitest run"` |
| `packages/domain/vitest.config.ts` | Create | Minimal config (ADR-6) |
| `packages/domain/src/shared/accountingMonth.test.ts` | Create | Six cases (ADR-6) |
| `packages/domain/tsconfig.json` | Modify | `"exclude": ["src/**/*.test.ts"]` |
| `.env.example` (if it documents API env vars) | Modify | Document `APP_TIMEZONE` |

**Not modified**, contrary to the proposal's Affected Areas: `packages/api/src/application/transactionMutations.ts`
(ADR-1 removes the need), `packages/shared-types/**`, `packages/web/src/features/dashboard/**`
(no per-request tz ⇒ the React Query key is unchanged), `httpApi.cors.allowedHeaders`, `infra-cdk/**`.

## 5. Runtime / ICU

| Runtime | Finding |
|---|---|
| Lambda (`serverless.yml` L11) | `nodejs22.x` — full ICU since Node 13. No `full-icu` layer. |
| `infra-cdk` | Defines **no** Lambda functions (`SingleTable`, `UserPool`, `WebDistribution`, `SsmParameters`, `TelegramSessionsTable`, `TransactionEventsQueue`, `GithubOidcRole`); grep for `Function`/`lambda`/`Runtime` returns nothing. Nothing to confirm. |
| `serverless-offline` | Runs on the developer's Node; root `engines.node` is `>=20.18.0`. Full ICU. |
| Browser | `DatePickerField` uses no `Intl` timezone API — only the local `Date` constructor. |

Explore risk "non-`serverless.yml` runtimes lacking full ICU" is **closed**.

## 6. Testing strategy

| Layer | What | How |
|---|---|---|
| Unit | `monthKeyInTimeZone`, `monthRangeInTimeZone`, `isValidTimeZone` | Vitest, `packages/domain` (ADR-6) — the only genuinely subtle logic |
| Integration | Read/write agreement, D4 cap | Manual after deploy: the repro pair in one card; a future-dated same-month transaction absent from the total |
| Static | Workspace health | `pnpm typecheck`, `pnpm lint`, `pnpm test` |

## 7. Threat matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. The change touches date arithmetic, one DynamoDB read path, and one
env var.

## 8. Rollout / migration

1. Deploy. No schema migration, no request-contract change; in-flight SQS messages are unaffected
   because `TransactionEvent` is untouched.
2. **Manual runbook step — performed by the user, never by code or the assistant.** Delete the stale
   items written under UTC bucketing, SK prefixes `MONTHLY_AGG#`, `MONTHLY_CAT_AGG#` and
   `PROCESSED_EVENT#` (`keyBuilders.ts` L28-37, L61-64), under `PK = USER#<sub>`. This is **optional**
   in this design: the dashboard no longer reads those items, so a stale aggregate is invisible.
   It only matters before a future past-month feature starts trusting them. Nothing in this change
   deletes data (D6).
3. Verify: `2026-08-31T23:59:56.667Z` and `2026-09-01T00:11:41.645Z` both appear in the August card.
4. Tripwire for §ADR-1's cost: if the dashboard latency becomes visible, the fix is a per-wallet
   `SK BETWEEN` range query (`TXN#<walletId>#<fromIso>` … `TXN#<walletId>#<toIso>`) instead of the
   partition-wide `begins_with('TXN#')` + filter. Not in this change.

## 9. Rollback

Four independent reverts, no data migration:

1. Revert `accountingMonth.ts` + its two call sites → read and write both return to UTC bucketing
   (they revert together, so they cannot disagree).
2. Restore the aggregate read in `GetMonthlyDashboard` + the container arg (one line each).
3. Revert `DatePickerField`.
4. Drop `APP_TIMEZONE` from `serverless.yml` and `env.ts`.

Aggregates written under the tz-aware rule would then be read by a UTC boundary — clear them with the
step-2 runbook prefixes. The event schema, DDB keys, and the HTTP contract never changed.

## 10. Open questions

- [ ] Vitest major version and lockfile pin — resolved at install time by the apply phase.
- [ ] Vite resolves the repo's `./x.js` import convention to `.ts` sources; if the test fails to
      resolve `./accountingMonth.js`, add `resolve.extensions` to `vitest.config.ts`.
- [ ] The DST expectations in ADR-6 cases 2-5 are derived from IANA rules, not executed; confirm the
      exact literals when the test is first run.
