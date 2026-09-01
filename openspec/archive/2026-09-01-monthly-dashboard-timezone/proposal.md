# Proposal: Timezone-consistent monthly boundary for the dashboard

## Intent

The "Ingresos del mes" card under-counts monthly income because "current month" is computed
independently in two places, **both in UTC**: the domain read path
(`GetMonthlyDashboard.ts` `monthRange` L52-55 / `monthKey` L57-58) and the aggregate write path
(`DynamoDBMonthlyAggregateRepository.monthFromOccurredAt` L198-201). For a user at UTC-5 (Peru),
two incomes entered in the same local day but straddling 00:00 UTC land in different month buckets.
Confirmed repro: `2026-08-31T23:59:56.667Z` → `2026-08` and `2026-09-01T00:11:41.645Z` → `2026-09`;
both are 31 August in `America/Lima`. On 1 September the dashboard reads `2026-09` and shows one.

A second defect compounds it: `publishSafely` swallows SQS failures, and the read path only falls
back to a live scan when the aggregate is `undefined`/empty — so one dropped event makes the card
permanently and silently wrong.

## Goals

1. One accounting-month rule, applied identically on read and write.
2. The dashboard shows every transaction the user considers "this month" in their local calendar.
3. A dropped aggregate event can no longer produce a permanently stale card.

## Non-Goals

- Per-request/browser timezone (`X-Timezone` header, `?tz=` param, body field) — see D1.
- Persisting `accountingTimezone`/`accountingMonth` on `Transaction` (explore W1/W2).
- Changing the `TransactionEvent` schema, `transactionMutations.ts` signatures, or transaction
  write handlers for timezone purposes.
- A user-facing "Zona horaria" setting, a server-side user-settings store, or FX/multi-currency work.
- Deleting the aggregate + SQS pipeline (explore §5 last option) — kept, per D2.
- Any code that deletes user data (D6).

## Scope

### In Scope

1. **`APP_TIMEZONE`** — `env.appTimezone` in `packages/api/src/env.ts`
   (`process.env.APP_TIMEZONE ?? 'America/Lima'`) plus `provider.environment` in
   `infra-sls/serverless.yml`. Single source of the month boundary.
2. **New pure domain helper** `packages/domain/src/shared/accountingMonth.ts` —
   `monthKeyInTimeZone(instant, tz): 'YYYY-MM'` and `monthRangeInTimeZone(instant, tz): {from,to}`,
   built on `Intl.DateTimeFormat` (Node built-in; `nodejs22.x` ships full ICU — no `full-icu` layer).
   `monthRange` is **derived from `monthKey`** so the two cannot diverge, and the month-start uses
   the tz offset **at the target instant**, not at `now`. Exported from `src/index.ts`.
3. **Read path** — `GetMonthlyDashboard` takes the timezone as an explicit use-case input and uses
   the helper for both `monthKey` and `monthRange`; the handler sources it from `env.appTimezone`.
4. **Write path** — `DynamoDBMonthlyAggregateRepository.monthFromOccurredAt` buckets
   `snapshot.occurredAt` with the same helper and `env.appTimezone` (still per-snapshot, so an
   update that moves `occurredAt` across a boundary still emits `-1` old / `+1` new).
5. **Fallback path** — `summarizeMonthlyByCurrency` receives the tz-derived range, so the
   aggregate-empty path returns the same number as the aggregate path (explore §1 correction 2).
6. **Aggregate staleness fix (D3)** — the card must not stay wrong after a dropped event.
7. **Upper bound unified (D4)** — "this month" is capped at `now`; future-dated same-month entries
   are excluded on **both** paths (`listMonthlySummaries` currently has no upper bound).
8. **`DatePickerField` fix (D5)** — `packages/web/src/components/common/DatePickerField.tsx`
   stamps a picked day at noon UTC; a back-dated entry can land in the wrong local month.

### Out of Scope

Everything under Non-Goals, plus: `infra-cdk` changes beyond confirming Node ≥18/full ICU for any
CDK-defined Lambda, React Query `queryKey` changes (no per-request tz ⇒ the key is unchanged),
`httpApi.cors.allowedHeaders` (no new header), and `zIanaTimeZone` in `shared-types` (nothing
crosses the wire; validation of a static env value is a design-phase call).

## Capabilities

### New Capabilities

- `accounting-month`: the definition of a monthly accounting period in a configured timezone, and
  the invariant that the dashboard read boundary and the aggregate write bucket use one rule.

### Modified Capabilities

- None. `openspec/specs/` does not exist in this repo; prior specs live inside archived change
  folders, so there is no existing spec file to delta. The behavior of the archived
  `dashboard-monthly` change is superseded by `accounting-month`.

## Approach

| # | Decision | Rationale |
|---|---|---|
| D1 | Fixed `APP_TIMEZONE` (`America/Lima`), no per-request tz | The app is effectively single-user in Peru. Per-request tz forces persisting a resolved tz per transaction (explore W1/W2) so create/update/delete deltas net to zero — real complexity for a problem that does not exist yet. **This retires the CRITICAL delta-consistency risk from explore §7.** The door stays open: the timezone enters the use case as an explicit input, sourced today from `env.appTimezone`. |
| D2 | Keep aggregate + SQS; make both ends tz-aware via one shared pure helper | Smallest correct change; preserves the existing read performance and the `PROCESSED_EVENT#` idempotency design. One helper = one rule; two call sites cannot re-diverge. |
| D3 | Fix the staleness bug in this change | It produces the same visible symptom (a wrong income total) and would mask verification of the tz fix. Candidate mechanisms — rethrow from `publishSafely`; reconcile-on-read against a stored `lastEventAt`/count; treat the aggregate as a pure cache and always recompute the current month — are handed to `sdd-design`. |
| D4 | "This month" = `[month start in tz, now]` | Excludes future-dated entries; matches the current fallback and the user's mental model of a month-to-date card. |
| D5 | Fix `DatePickerField` | Same class of bug on the client; leaving it means the fix is incomplete for back-dated entries. |
| D6 | No deletion by code or assistant | Stale aggregates are cleared by a documented manual runbook step, never a task. |

Architecture: the helper is pure domain (`sw-hexagonal`: domain owns the accounting rule, `Intl`
is stdlib, no new port); `api` reads `env`, `web` only touches `DatePickerField`; no `shared-types`
change; the composition root is untouched.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/domain/src/shared/accountingMonth.ts` | New | Pure `monthKeyInTimeZone` / `monthRangeInTimeZone` |
| `packages/domain/src/index.ts` | Modified | Export the helper |
| `packages/domain/src/dashboard/GetMonthlyDashboard.ts` | Modified | tz input; tz-aware `monthKey`/`monthRange`; `to = now` |
| `packages/api/src/env.ts` | Modified | `appTimezone` |
| `packages/api/src/handlers/dashboard/getMonthlyDashboard.ts` | Modified | Pass `env.appTimezone` |
| `.../repositories/DynamoDBMonthlyAggregateRepository.ts` | Modified | tz-aware bucketing; upper bound on `listMonthlySummaries` |
| `packages/api/src/application/transactionMutations.ts` | Modified | D3 mechanism (mechanism TBD) |
| `packages/web/src/components/common/DatePickerField.tsx` | Modified | Local-midnight-correct stamping |
| `packages/infra-sls/serverless.yml` | Modified | `APP_TIMEZONE` env |

## Rollout / Migration

1. **Deploy** the code change (no schema migration; no new request field; in-flight SQS messages
   are unaffected because the event payload does not change).
2. **Manual runbook step — performed by the user, never by code or the assistant**: delete the stale
   `MONTHLY_AGG#`, `MONTHLY_CAT_AGG#` and `PROCESSED_EVENT#` items (exact SK prefixes per
   `keyBuilders.ts` L28-37, L61-64). With the aggregate empty, the corrected tz-aware fallback
   serves accurate numbers while aggregates repopulate from subsequent events. A full `TXN#` /
   wallet-balance wipe is optional and entirely the user's choice.
3. **Verify** with the known repro pair (`2026-08-31T23:59:56.667Z` + `2026-09-01T00:11:41.645Z`):
   both must appear in the same card.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Aggregate delta consistency across a transaction lifetime | ~~CRITICAL~~ Retired | D1 fixes the timezone for every write; create/update/delete always resolve to the same bucket |
| Fallback `summarizeMonthlyByCurrency` shares the UTC bug | HIGH | Item 5 — both paths move together in this change |
| Silent publish failure + empty-only fallback ⇒ permanently stale card | HIGH | D3, in scope; mechanism chosen at design |
| `monthRangeInTimeZone` offset taken at `now` instead of the target instant | MEDIUM | Derive range from key; DST-mid-month test case |
| Read tz (`env.appTimezone`) wrong for a future non-Peru user | MEDIUM | Accepted trade-off of D1; migration path is W1/W2, unblocked by the explicit use-case input |
| `DatePickerField` noon-UTC stamping | MEDIUM → in scope | D5 |
| Zero test infrastructure ⇒ DST/boundary edge cases unverified | MEDIUM | **Open question Q3** |
| Non-`serverless.yml` runtimes (CDK Lambdas, `serverless-offline`) lacking full ICU | LOW | Confirm Node ≥18 during design |

## Open Questions (for spec / design)

1. **D3 mechanism** — rethrow from `publishSafely` (couples the write to SQS; client idempotency
   keys make retry safe) vs. reconcile-on-read via a stored `lastEventAt`/count vs. aggregate-as-
   pure-cache (always recompute the current month). → `sdd-design`.
2. **Read-side shape** — timezone as a plain `GetMonthlyDashboardInput` field (explore option A,
   leaning) vs. an `AccountingCalendar` port or folding tz into `Clock` (option B) vs. computing the
   range at the api boundary (option C). → `sdd-design`.
3. **Test-runner scope** — stand up a minimal unit-test runner for `accountingMonth`
   (recommended: real DST/boundary edge cases, pure function, cheap) or explicitly defer.
   The repo has **zero** test infrastructure today (`test` scripts are `echo 'no tests yet'`).
   → **needs a user decision**, see below.

## Proposal question round

Interactive mode: the executor could not prompt directly. These need user confirmation before spec:

1. **Test runner (Q3)** — Should this change add a minimal test runner (e.g. Vitest in
   `packages/domain`) covering `monthKeyInTimeZone`/`monthRangeInTimeZone` for: UTC-5 on both
   sides of the boundary, a UTC+ timezone (`Asia/Tokyo`), and a DST-mid-month timezone? It is the
   only part of this change with genuinely subtle correctness, and there is nothing to regress
   against today. Assumed answer if unanswered: **yes, domain-only, one test file**.
2. **Verification without tests** — If the answer is no, the acceptance evidence becomes a manual
   check against the known repro pair after the manual wipe. Acceptable?
3. **Aggregate staleness (D3)** — Any preference among the three mechanisms in Q1, or is
   `sdd-design` free to choose on cost/reversibility grounds?

## Rollback Plan

Four independent reverts, no data migration: revert the `accountingMonth` helper + its two call
sites (read and write return to UTC bucketing); revert the D3 change; revert `DatePickerField`;
drop `APP_TIMEZONE` from `serverless.yml` and `env.ts`. Aggregates written under the tz-aware rule
would then be read by a UTC boundary — clear them with the same manual runbook step. The event
schema, DynamoDB keys, and the HTTP contract are unchanged, so nothing else is affected.

## Success Criteria

- [ ] Both repro incomes (`2026-08-31T23:59:56.667Z`, `2026-09-01T00:11:41.645Z`) appear in the
      same "Ingresos del mes" total for August in `America/Lima`.
- [ ] The aggregate path and the fallback path return identical figures for the current month.
- [ ] A transaction created, then updated across a month boundary, then deleted leaves the
      aggregate at zero for both months.
- [ ] A future-dated transaction in the current calendar month is excluded from both paths.
- [ ] A dropped/failed aggregate event no longer leaves the card permanently wrong.
- [ ] A day picked in `DatePickerField` lands in the correct `America/Lima` month.
- [ ] `pnpm typecheck` and `pnpm lint` pass across the workspace.
