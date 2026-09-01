# Spec: monthly-dashboard-timezone

> SDD phase: spec
> Project: smart-wallet
> Change: monthly-dashboard-timezone
> Date: 2026-08-31
> Engram topic_key: `sdd/monthly-dashboard-timezone/spec`

## Capability map

| Tag | Kind | Scope |
|---|---|---|
| `accounting-month` | NEW capability | R1–R8: one configured-timezone monthly boundary, shared by read and write |
| `dashboard-monthly` | MODIFIED behavior | R9: read path adopts the helper (was UTC) |
| `web-datepicker` | MODIFIED behavior | R10: picked day resolves in the local calendar |
| `domain-tests` | NEW tooling | R11: minimal Vitest runner for the helper |

Totals: **11 requirements / 22 scenarios**.

---

## ADDED Requirements — `accounting-month`

### Requirement: Single configured accounting timezone

The system MUST compute every monthly accounting boundary in one configured IANA timezone `APP_TIMEZONE`. It MUST NOT accept a per-request, per-user, or per-browser timezone for server-side month computation.

#### Scenario: Unset or blank falls back to America/Lima

- GIVEN `APP_TIMEZONE` is unset or an empty/whitespace string
- WHEN a monthly boundary is computed
- THEN the timezone `America/Lima` is used

#### Scenario: Invalid IANA value is a deploy-time error

- GIVEN `APP_TIMEZONE` is set to a value `Intl.DateTimeFormat` rejects
- WHEN the service resolves its configuration
- THEN it is treated as a deployment/configuration failure surfaced to the operator, NOT silently coerced to a per-request fallback

### Requirement: One shared month helper

The system MUST expose one pure helper defining `monthKeyInTimeZone(instant, tz) -> "YYYY-MM"` and `monthRangeInTimeZone(instant, tz) -> { from, to }`, with `monthRange` derived from `monthKey`. The dashboard read path and the DynamoDB aggregate write bucket MUST both use this helper with the configured timezone.

#### Scenario: Month key is zero-padded and sort-key safe

- GIVEN an instant that falls in March in the configured timezone
- WHEN `monthKeyInTimeZone` is called
- THEN it returns `"YYYY-03"` (four-digit year, two-digit zero-padded month) usable directly as a DynamoDB sort-key component

#### Scenario: Range is derived from the key

- GIVEN any instant and timezone
- WHEN `monthRangeInTimeZone` is computed
- THEN `from` is the first instant of that `monthKey`'s month in the timezone, and `monthKeyInTimeZone(from, tz)` equals `monthKeyInTimeZone(instant, tz)`

### Requirement: Month membership uses the configured-timezone wall clock

A transaction's month MUST be determined by the wall-clock date of its `occurredAt` in the configured timezone, never by its UTC date.

#### Scenario: Negative offset straddling UTC midnight

- GIVEN the configured timezone is `America/Lima` (UTC-5)
- WHEN one transaction occurs at `2026-08-31T23:59:56.667Z` and another at `2026-09-01T00:11:41.645Z`
- THEN both resolve to month key `2026-08`

#### Scenario: Positive offset ahead of UTC

- GIVEN the configured timezone is `Asia/Tokyo` (UTC+9)
- WHEN a transaction occurs at `2026-08-31T20:00:00Z`
- THEN it resolves to month key `2026-09` while the UTC month is `2026-08`

#### Scenario: DST transition mid-month

- GIVEN a timezone whose DST offset change occurs after the first day of the month
- WHEN `monthRangeInTimeZone` computes `from`
- THEN `from` uses the UTC offset in effect at the month start, not the offset in effect at `now`

### Requirement: "This month" is capped at now on both paths

"This month" MUST be the interval `[first instant of the month in tz, now]`. Transactions with `occurredAt` after `now` — including later today or later in the current calendar month — MUST be excluded from the current-month total on BOTH the aggregate-backed path and the fallback path.

#### Scenario: Future-dated same-month transaction excluded from aggregate path

- GIVEN the current month in the configured timezone and a transaction whose `occurredAt` is later today but after `now`
- WHEN the current-month total is computed from the aggregate
- THEN that transaction is not included

#### Scenario: Both paths apply the same upper bound

- GIVEN the same future-dated transaction
- WHEN the total is computed from the fallback `summarizeMonthlyByCurrency`
- THEN it is also excluded, and the fallback figure equals the aggregate figure

### Requirement: Read and write agree for the current month

For the current month the aggregate-backed figure and the fallback figure MUST be equal for every currency.

#### Scenario: Aggregate and fallback parity

- GIVEN a set of persisted transactions for the current month
- WHEN the "Ingresos del mes" total is computed from the aggregate and independently from the fallback
- THEN the two totals are identical per currency

#### Scenario: Known repro pair lands in one card

- GIVEN configured timezone `America/Lima` and income transactions at `2026-08-31T23:59:56.667Z` and `2026-09-01T00:11:41.645Z`
- WHEN the August dashboard total is read
- THEN both transactions are included in the same "Ingresos del mes" total

### Requirement: Transaction lifecycle nets the aggregate to zero

Creating, updating (including moving `occurredAt` across a month boundary), and deleting a transaction MUST net that transaction's contribution to the monthly aggregate back to zero for every affected month.

#### Scenario: Create, cross-boundary update, delete

- GIVEN a transaction created with `occurredAt` in month A, raising the aggregate for A
- WHEN it is updated so `occurredAt` falls in month B and then deleted
- THEN the aggregates for month A and month B both return to their pre-transaction values

### Requirement: Dropped aggregate event does not permanently corrupt the card

A dropped or failed aggregate-update event MUST NOT leave the "Ingresos del mes" card permanently wrong. The card MUST eventually reflect every persisted transaction for the month. The recovery mechanism is chosen at design time; this requirement is mechanism-agnostic.

#### Scenario: Lost aggregate event still reconciles

- GIVEN a transaction is persisted but its aggregate-update event is never applied
- WHEN the user views the dashboard for that month after the recovery path has had a chance to run
- THEN the "Ingresos del mes" total reflects the persisted transaction

### Requirement: No data deletion by software

No requirement in this capability is satisfied by application code deleting stored data. Clearing stale aggregates from the previous UTC rule is an operator runbook step, out of scope for the software spec except as a rollout note.

#### Scenario: Rollout cleanup is operator-driven

- GIVEN the change is deployed and stale aggregates from the old UTC boundary exist
- WHEN those aggregates must be removed
- THEN they are cleared by a documented manual operator step, never by application code

---

## MODIFIED Requirements — `dashboard-monthly`

### Requirement: Monthly dashboard read boundary uses the accounting-month helper

The monthly dashboard read path MUST obtain both `monthKey` and `monthRange` from the shared accounting-month helper using the configured timezone, and MUST set the range upper bound to `now`.
(Previously: the read path computed month and range independently via `getUTCFullYear()` / `getUTCMonth()` on `clock.now()`, and the aggregate path had no upper bound.)

#### Scenario: Month-boundary read in configured timezone

- GIVEN configured timezone `America/Lima` and `now` is `2026-09-01T02:00:00Z`
- WHEN the dashboard resolves the current month
- THEN it reads month key `2026-08` and a range whose `to` equals `now`

#### Scenario: Fallback receives the timezone-derived range

- GIVEN the aggregate for the current month is empty or missing
- WHEN the dashboard falls back to `summarizeMonthlyByCurrency`
- THEN it passes the same timezone-derived `[from, now]` range and returns the timezone-correct total

---

## MODIFIED Requirements — `web-datepicker`

### Requirement: DatePickerField resolves the picked day in the local calendar

A day chosen in the web `DatePickerField` MUST produce an `occurredAt` that falls on the chosen calendar day in the local calendar, not shifted into an adjacent day or month.
(Previously: the picked day was stamped at 12:00 UTC, which can move far-from-UTC entries into the wrong local month.)

#### Scenario: Pick 31 August while the browser is at UTC-5

- GIVEN the browser timezone is UTC-5
- WHEN the user picks "31 August" in `DatePickerField`
- THEN the resulting `occurredAt` falls on 31 August in the local calendar, not 1 September

---

## ADDED Requirements — `domain-tests`

### Requirement: Minimal test runner for the accounting-month helper

The change MUST add a minimal Vitest runner to `packages/domain` with at least one test file covering `monthKeyInTimeZone` / `monthRangeInTimeZone`.

#### Scenario: Helper test suite executes required cases

- GIVEN the Vitest runner configured in `packages/domain`
- WHEN the domain test script runs
- THEN the accounting-month test file executes and asserts: UTC-5 on both sides of a month boundary, a UTC+ timezone (`Asia/Tokyo`), and a timezone whose DST change falls mid-month
