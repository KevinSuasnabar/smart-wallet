# Budgets Specification

## Purpose

Define a monthly spending limit (per category or currency-wide) and track real-time progress against it, with optional rollover of the previous month's surplus.

## Requirements

### Requirement: Budget Entity

The system MUST support a `Budget` aggregate with the following invariants:

- `type` MUST be `per_category` or `global`.
- `per_category` budgets MUST reference exactly one `categoryId`.
- `global` budgets MUST NOT reference a `categoryId`.
- `currency` MUST be provided and MUST be immutable after creation.
- `type` and `categoryId` MUST be immutable after creation.
- `limitCents` MUST be a positive integer (cents).
- `rollover` MUST be a boolean, defaulting to `false`.

#### Scenario: Create valid per-category budget

- GIVEN an authenticated user
- WHEN they POST `/budgets` with `type=per_category`, a valid `categoryId`, `currency`, and `limitCents > 0`
- THEN the budget is persisted and the response includes the new budget `id`

#### Scenario: Create valid global budget

- GIVEN an authenticated user
- WHEN they POST `/budgets` with `type=global`, a valid `currency`, and `limitCents > 0`
- THEN the budget is persisted without a `categoryId`

#### Scenario: Reject creation with missing required fields

- GIVEN an authenticated user
- WHEN they POST `/budgets` with `limitCents` missing or ≤ 0, or without `currency`
- THEN the response is 400 with a validation error

#### Scenario: Reject creation with categoryId on global budget

- GIVEN an authenticated user
- WHEN they POST `/budgets` with `type=global` and a non-null `categoryId`
- THEN the response is 400 with a domain error

---

### Requirement: Budget Listing with Spent Calculation

The system MUST return all budgets for the authenticated user enriched with `spentCents` and `effectiveLimitCents` computed for the current calendar month (UTC).

#### Scenario: List budgets — happy path

- GIVEN a user with two budgets (one per-category, one global)
- WHEN they GET `/budgets`
- THEN each item includes `id`, `type`, `limitCents`, `rollover`, `spentCents`, and `effectiveLimitCents`
- AND `spentCents` reflects only expense transactions for the current UTC month matching the budget's currency and optional categoryId

#### Scenario: List budgets — empty

- GIVEN a user with no budgets
- WHEN they GET `/budgets`
- THEN the response is 200 with an empty array

#### Scenario: Listing responds within time budget

- GIVEN a user with ≤15 budgets
- WHEN GET `/budgets` is called
- THEN the response completes in < 800ms at p95

---

### Requirement: Rollover Effective Limit

When `rollover` is `true`, the system MUST compute `effectiveLimitCents = limitCents + max(0, prevLimitCents - prevSpentCents)` at read time.

#### Scenario: Rollover adds previous surplus

- GIVEN a budget with `rollover=true`, `limitCents=10000`, and previous month spent = 6000
- WHEN GET `/budgets` is called
- THEN `effectiveLimitCents = 10000 + (10000 - 6000) = 14000`

#### Scenario: Rollover does not go below base limit

- GIVEN a budget with `rollover=true`, `limitCents=10000`, and previous month spent = 12000 (over limit)
- WHEN GET `/budgets` is called
- THEN `effectiveLimitCents = 10000` (surplus is clamped at 0)

#### Scenario: No rollover — effective limit equals base limit

- GIVEN a budget with `rollover=false`
- WHEN GET `/budgets` is called
- THEN `effectiveLimitCents = limitCents`

---

### Requirement: Budget Update

The system MUST allow updating `limitCents` and `rollover` only. `type`, `categoryId`, and `currency` MUST be rejected.

#### Scenario: Patch allowed fields

- GIVEN an existing budget owned by the user
- WHEN they PATCH `/budgets/:id` with `{ limitCents: 20000, rollover: true }`
- THEN the budget is updated and the response reflects the new values

#### Scenario: Reject immutable fields on patch

- GIVEN an existing budget
- WHEN they PATCH `/budgets/:id` with `currency` or `type` or `categoryId`
- THEN the response is 400 with a domain error

#### Scenario: Patch non-existent budget

- GIVEN no budget with the provided id
- WHEN they PATCH `/budgets/:id`
- THEN the response is 404

---

### Requirement: Budget Deletion

The system MUST allow deleting a budget. Deleting a budget MUST NOT affect any transactions.

#### Scenario: Delete existing budget

- GIVEN a budget owned by the user
- WHEN they DELETE `/budgets/:id`
- THEN the budget is removed and the response is 204
- AND all related transactions remain intact

#### Scenario: Delete non-existent budget

- GIVEN no budget with the provided id
- WHEN they DELETE `/budgets/:id`
- THEN the response is 404

---

### Requirement: Budget UI

The web MUST render a `/budgets` page with a card list showing each budget's progress bar, a create/edit form, and a delete confirmation dialog. Navigation MUST include a budgets entry in the sidebar and bottom tab bar. All user-visible strings MUST come from `t.budgets`.

#### Scenario: Progress bar reflects spending state

- GIVEN a budget at 45% spent
- WHEN the user views `/budgets`
- THEN the progress bar is green

- GIVEN a budget at 75% spent
- WHEN the user views `/budgets`
- THEN the progress bar is yellow/amber

- GIVEN a budget at 100%+ spent
- WHEN the user views `/budgets`
- THEN the progress bar is red

#### Scenario: No hardcoded strings

- GIVEN any budget UI component
- WHEN rendered in any locale
- THEN all visible text originates from `t.budgets` keys
