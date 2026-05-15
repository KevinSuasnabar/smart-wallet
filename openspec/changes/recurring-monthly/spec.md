# Recurring monthly — Spec

## Capability groups

- **DOM** — Domain entity, value objects, errors (13 reqs)
- **REPO** — Repository interface (6 reqs)
- **CREATE** — `POST /recurring` (5 reqs)
- **LIST** — `GET /recurring` (3 reqs)
- **GET** — `GET /recurring/:id` (3 reqs)
- **UPDATE** — `PATCH /recurring/:id` (6 reqs)
- **DELETE** — `DELETE /recurring/:id` (3 reqs)
- **MAT** — `POST /recurring/materialize` (8 reqs)
- **WEB** — Frontend pages + components (9 reqs)
- **NAV** — Routing + nav items (3 reqs)
- **AUTO** — Dashboard auto-materialize trigger (4 reqs)
- **I18N** — Strings (2 reqs)

Total: **65 requirements / 18 scenarios**.

---

## DOM — Domain

### DOM-01
A new aggregate root `RecurringTransaction` MUST live at `packages/domain/src/recurring/RecurringTransaction.ts`, mirroring the `Transaction` aggregate pattern (private `_props`, getters, `static create`, `static rehydrate`, `applyEdits`).

### DOM-02
`RecurringTransactionId` value object MUST exist at `packages/domain/src/recurring/RecurringTransactionId.ts` with `static create(raw: string): Result<RecurringTransactionId, RecurringError>` that accepts only valid UUIDv4.

### DOM-03
`RecurringTransaction` MUST hold these props:
- `recurringId: RecurringTransactionId`
- `userId: UserId`
- `walletId: WalletId`
- `type: 'income' | 'expense'`
- `amount: Money`
- `categoryId: CategoryId`
- `description: string | null`
- `cadence: 'monthly'` (literal)
- `dayOfMonth: number` (integer 1..31)
- `nextOccurrenceAt: string` (ISO8601 UTC)
- `lastMaterializedAt: string | null` (ISO8601 UTC)
- `createdAt: string`, `updatedAt: string`

### DOM-04
`RecurringTransaction.create(props, clock)` MUST:
- Validate `dayOfMonth ∈ [1, 31]` → else `InvalidDayOfMonth`
- Validate `amount > 0` → reuses `Money.create` errors
- Validate `cadence === 'monthly'` (defensive, only allowed literal) — else `InvalidCadence`
- Compute `nextOccurrenceAt` via `nextDayOfMonthOnOrAfter(clock.now(), dayOfMonth)` — first calendar day ≥ today matching `dayOfMonth`, clamping to last day of month if `dayOfMonth > monthLength`
- Set `lastMaterializedAt = null`, `createdAt = updatedAt = clock.nowIso()`

### DOM-05
`RecurringTransaction.applyEdits(edits, clock)` MUST accept ONLY these editable fields:
- `amount?: Money`
- `categoryId?: CategoryId`
- `description?: string | null`
- `dayOfMonth?: number`

Returns `Result<void, RecurringError>`. Walls off `walletId`, `type`, `currency`, `cadence`. Uses snapshot-rollback (revert on partial validation failure).

### DOM-06
If `dayOfMonth` changes, `applyEdits` MUST recompute `nextOccurrenceAt` based on the LATER of the existing `nextOccurrenceAt` and `clock.now()`, applying the new day-of-month. Rationale: a user changing day-of-month does not want to retroactively materialize prior months.

### DOM-07
`RecurringTransaction.materialize(now: Date)` MUST return:
```ts
{
  transactionDraft: {
    walletId, type, amount, categoryId, description, currency,
    occurredAt: this.nextOccurrenceAt,
  },
  nextOccurrenceAt: nextDayOfMonthOnOrAfter(addOneMonth(this.nextOccurrenceAt), this.dayOfMonth),
  materializedAt: now.toISOString(),
}
```
without persisting. The repository consumes this output.

### DOM-08
A helper `nextDayOfMonthOnOrAfter(anchor: Date, dayOfMonth: number): Date` MUST live at `packages/domain/src/recurring/dateMath.ts`. Behavior:
- Same month if `anchor.day <= effectiveDay(anchor.month, dayOfMonth)` → returns that date 00:00:00.000 UTC
- Otherwise next calendar month at `effectiveDay(nextMonth, dayOfMonth)`
- `effectiveDay(month, day) = min(day, daysInMonth(month))` — clamps Feb 30 → 28/29.

### DOM-09
A helper `addOneMonth(iso: string): Date` MUST live in the same file. Adds exactly one calendar month, preserving the year if rollover.

### DOM-10
`RecurringError` union type at `packages/domain/src/recurring/RecurringError.ts` MUST include:
- `InvalidRecurringId` (tag `domain.recurring.invalid_id`, httpStatus 400)
- `InvalidDayOfMonth` (tag `domain.recurring.invalid_day_of_month`, httpStatus 400)
- `InvalidCadence` (tag `domain.recurring.invalid_cadence`, httpStatus 400)
- `RecurringNotFound` (tag `domain.recurring.not_found`, httpStatus 404)
- `RecurringWalletMismatch` (tag `domain.recurring.wallet_mismatch`, httpStatus 400) — wallet currency ≠ recurring currency
- `RecurringCategoryMismatch` (tag `domain.recurring.category_mismatch`, httpStatus 400) — category type ≠ recurring type
- `RecurringWalletNotFound` (tag `domain.recurring.wallet_not_found`, httpStatus 400) — wallet does not exist or was deleted
- `RecurringCategoryNotFound` (tag `domain.recurring.category_not_found`, httpStatus 400)

### DOM-11
Domain MUST NOT import from `shared-types`. Currency, type literals, and any shared enum MUST be mirrored locally if needed (per existing convention with `WalletColor`).

### DOM-12
Six use cases MUST live at `packages/domain/src/recurring/usecases/`:
- `MakeCreateRecurring(deps)` — validates wallet (exists, not deleted), category (exists, type match), constructs entity, persists via `repo.create`
- `MakeListRecurring(deps)` — `repo.listByUser`, returns descriptors
- `MakeGetRecurring(deps)` — `repo.findById`, errors `RecurringNotFound` if null
- `MakeUpdateRecurring(deps)` — loads, applies edits, validates new category if changed, persists
- `MakeDeleteRecurring(deps)` — loads (404 if missing), hard deletes
- `MakeMaterializeRecurrings(deps)` — loop algorithm from proposal §3, returns `{ materializedCount, materializedTransactionIds }`

### DOM-13
`MakeMaterializeRecurrings` MUST cap the loop at 50 outer iterations and 20 items per page. Beyond, log and return early with the current count (defensive against malformed data).

---

## REPO — Repository interface

### REPO-01
`packages/domain/src/recurring/RecurringTransactionRepository.ts` MUST expose:
```ts
interface RecurringTransactionRepository {
  create(input: CreateRecurringInput): Promise<void>;
  findById(userId: UserId, recurringId: RecurringTransactionId): Promise<RecurringTransaction | null>;
  listByUser(userId: UserId): Promise<RecurringTransaction[]>;
  listPending(userId: UserId, now: Date, limit: number): Promise<RecurringTransaction[]>;
  update(input: UpdateRecurringInput): Promise<void>;
  hardDelete(input: { userId: UserId; recurringId: RecurringTransactionId }): Promise<void>;
  materializeOne(input: MaterializeOneInput): Promise<{ transactionId: TransactionId }>;
}
```

### REPO-02
`listPending(userId, now, limit)` MUST return recurrings whose `nextOccurrenceAt <= now`, oldest-first, up to `limit` items. Implementation uses GSI1 with `KeyConditionExpression: GSI1PK = :pk AND GSI1SK <= :max`.

### REPO-03
`materializeOne(input)` MUST atomically (single TransactWriteItems):
1. Put Transaction (mapped via existing TransactionMapper)
2. Update Wallet balance by signed delta
3. Update Recurring (set new `nextOccurrenceAt`, `lastMaterializedAt`, bump `updatedAt`) with `ConditionExpression nextOccurrenceAt = :expected`

### REPO-04
On `ConditionalCheckFailedException` for the recurring's condition, `materializeOne` MUST throw a typed error `RecurringRaceLost` that the use case catches and skips (treat as "already materialized by concurrent request").

### REPO-05
On any other DDB error, `materializeOne` MUST propagate (caller fails the request).

### REPO-06
The repo MUST live at `packages/api/src/adapters/dynamodb/repositories/DynamoDBRecurringTransactionRepository.ts` and implement the interface using the existing client + key builders. A `RecurringMapper` MUST live at `packages/api/src/adapters/dynamodb/mappers/RecurringMapper.ts` exporting `recurringToItem` and `itemToRecurring(item): Result<RecurringTransaction, RecurringError>`.

---

## CREATE — `POST /recurring`

### CREATE-01
Endpoint `POST /recurring` MUST accept body validated by `CreateRecurringRequestSchema` (Zod) in `packages/shared-types/src/schemas/recurring.ts`:
```ts
{
  walletId: zUuid,
  type: 'income' | 'expense',
  amount: zDecimalAmount,
  categoryId: zCategoryId,
  description: z.string().trim().max(256).optional(),
  dayOfMonth: z.number().int().min(1).max(31),
}
```
`cadence` is NOT in the request body (server fixes it to `'monthly'`).

### CREATE-02
Handler MUST live at `packages/api/src/handlers/recurring/createRecurring.ts`, follow the standard middleware chain (`withErrorHandler(withAuth(...))`), parse the body via `validateBody`, convert amount to `Money` at the boundary, and call `container.createRecurring`.

### CREATE-03
On success, MUST return HTTP 201 with `RecurringResponseDTO` body.

### CREATE-04
Validation errors return 400 with `error.tag` shorthand (without the `domain.recurring.` prefix), matching the existing handler conventions.

### CREATE-05
A `RecurringResponseDTO` Zod schema MUST exist in shared-types with:
```ts
{
  recurringId: string,
  walletId: string,
  type, amount, currency, categoryId,
  description: string | null,
  cadence: 'monthly',
  dayOfMonth: number,
  nextOccurrenceAt: string,
  lastMaterializedAt: string | null,
  createdAt: string, updatedAt: string,
}
```

---

## LIST — `GET /recurring`

### LIST-01
Endpoint `GET /recurring` MUST return `ListRecurringResponseDTO = { items: RecurringResponseDTO[] }`. No pagination for MVP (recurrings are bounded — typical user has ≤20).

### LIST-02
Handler MUST live at `packages/api/src/handlers/recurring/listRecurring.ts`. Items are sorted by `nextOccurrenceAt` ASC.

### LIST-03
If the user has zero recurrings, response is `{ items: [] }` with 200.

---

## GET — `GET /recurring/:id`

### GET-01
Endpoint `GET /recurring/:id` MUST validate the path via `RecurringIdPathSchema` (UUID).

### GET-02
Returns 200 with `RecurringResponseDTO` if found.

### GET-03
Returns 404 with `error.tag` `not_found` if missing or not owned by user.

---

## UPDATE — `PATCH /recurring/:id`

### UPDATE-01
Endpoint `PATCH /recurring/:id` MUST validate body via `UpdateRecurringRequestSchema` (strict, at-least-one-field). Editable fields:
- `amount`
- `categoryId`
- `description` (`string | null`)
- `dayOfMonth`

### UPDATE-02
Rejects with 400 if the body contains `walletId`, `type`, `currency`, `cadence`, or any other unknown field (Zod strict).

### UPDATE-03
If `categoryId` changes, the use case MUST validate the new category exists and matches the recurring's `type` → otherwise `RecurringCategoryMismatch` (400).

### UPDATE-04
If `dayOfMonth` changes, the use case MUST recompute `nextOccurrenceAt` per DOM-06.

### UPDATE-05
Returns 200 with the updated `RecurringResponseDTO`.

### UPDATE-06
A request with no editable fields present returns 400 `validation_failed`.

---

## DELETE — `DELETE /recurring/:id`

### DELETE-01
Endpoint `DELETE /recurring/:id` MUST hard-delete the recurring after 404-guard.

### DELETE-02
Returns 204 No Content on success.

### DELETE-03
DELETE MUST NOT touch already-materialized transactions. They remain as ordinary user transactions.

---

## MAT — `POST /recurring/materialize`

### MAT-01
Endpoint `POST /recurring/materialize` MUST have no request body (or accept empty body). It is keyed entirely by `event.userId` from JWT.

### MAT-02
The handler MUST live at `packages/api/src/handlers/recurring/materializeRecurrings.ts`, follow standard middleware chain, and call `container.materializeRecurrings(userId, now)`.

### MAT-03
Response body MUST be:
```ts
{
  materializedCount: number,
  materializedTransactionIds: string[],
}
```
with HTTP 200.

### MAT-04
Per recurring materialized, the repo MUST perform exactly ONE TransactWriteItems call composed of: Put Transaction + Update Wallet balance + Update Recurring with ConditionExpression on `nextOccurrenceAt`.

### MAT-05
The use case MUST loop pages of `listPending` until empty (or safety caps DOM-13).

### MAT-06
Concurrent requests for the same user MUST NOT create duplicate transactions. Mechanism: the per-recurring `ConditionExpression` on `nextOccurrenceAt` means only one writer can advance a given recurring per period.

### MAT-07
If a per-recurring `ConditionalCheckFailedException` is raised, the use case MUST skip that recurring and continue with the next.

### MAT-08
A failed wallet `attribute_exists(PK) AND attribute_not_exists(deletedAt)` check (the wallet was deleted between create and now) MUST propagate as a domain error `RecurringWalletNotFound`. The handler returns 400 with `wallet_not_found`. In practice, deleting a wallet should cascade-delete its recurrings (see Out of scope §3 — added to follow-up if needed). For MVP, the materialize handler returns the error and stops; the user can delete the orphan recurring manually.

---

## WEB — Frontend pages + components

### WEB-01
A new `recurring` feature folder MUST live at `packages/web/src/features/recurring/` with:
- `recurringApi.ts`
- `queries.ts`
- `pages/RecurringListPage.tsx`
- `pages/CreateRecurringPage.tsx`
- `pages/EditRecurringPage.tsx`
- `components/RecurringForm.tsx`
- `components/RecurringListItem.tsx`
- `components/DeleteRecurringDialog.tsx`
- `components/RecurringListSkeleton.tsx`
- `components/EmptyRecurringState.tsx`

### WEB-02
`recurringApi.ts` MUST mirror `transactionsApi.ts`:
- `list()`
- `byId(recurringId)`
- `create(dto)` — no idempotency-key (per MVP scope)
- `update(recurringId, dto)`
- `remove(recurringId)`
- `materialize()` → POST `/recurring/materialize`

### WEB-03
`queries.ts` MUST expose:
- `useRecurringList()` (`useQuery`)
- `useRecurring(recurringId)` (`useQuery`, enabled)
- `useCreateRecurring()` (`useMutation`, invalidates `recurringKeys.all`)
- `useUpdateRecurring(recurringId)` (`useMutation`, invalidates recurringKeys + recurring detail)
- `useDeleteRecurring()` (`useMutation`, invalidates recurringKeys.all)
- `useMaterializeRecurrings()` (`useMutation`, invalidates `walletKeys.all` + `transactionKeys.all` + `recurringKeys.all`)

### WEB-04
`RecurringForm` MUST mirror the `TransactionForm` pattern (`mode: 'onChange'`, normalized amount via `normalizeAmount`, controlled WalletSelect outside `FormField`). Distinct fields:
- Type selector (income/expense, disabled in edit mode)
- WalletSelect (disabled in edit mode)
- Amount + currency (from wallet)
- Category (filtered by type)
- DayOfMonth (input number 1-31 with helper "Si el mes tiene menos días, se ajusta al último")
- Description (optional)

### WEB-05
`RecurringListPage` MUST list items sorted by `nextOccurrenceAt`, showing per row:
- Eyebrow: type icon + amount with sign + currency
- Title: description (or fallback `"Movimiento recurrente"`)
- Meta: wallet name, category dot+name, "Próximo: DD MMM"
- Trailing: Edit (Pencil) + Delete (Trash) buttons

### WEB-06
The list page MUST render `EmptyRecurringState` when there are no items, with CTA to `/recurring/new`.

### WEB-07
The list page MUST handle loading via `RecurringListSkeleton` and errors via the existing `ErrorState` component.

### WEB-08
`CreateRecurringPage` and `EditRecurringPage` MUST follow the existing add/edit transaction page composition (back button, eyebrow + title, `Card` containing the form). EditPage pre-populates via `useRecurring(id)` + handles the diff-and-PATCH pattern (only send changed fields). NO-CHANGE submit returns a toast (no API call).

### WEB-09
`DeleteRecurringDialog` MUST confirm with body text: "Esta acción no se puede deshacer. Las transacciones ya creadas no se verán afectadas."

---

## NAV — Routing + nav items

### NAV-01
`routes.ts` MUST add:
- `recurring: '/recurring'`
- `recurringNew: '/recurring/new'`
- `recurringEdit: (recurringId: string) => `/recurring/${recurringId}/edit``

### NAV-02
`AppRouter.tsx` MUST register the three new protected routes.

### NAV-03
`Sidebar.tsx` and `BottomTabBar.tsx` MUST add a "Recurrentes" item with the `Repeat` icon from lucide-react. Insert order in Sidebar: after Billeteras, before Categorías. BottomTabBar already has 5 elements (Resumen, Billeteras, FAB, Categorías, Ajustes); we accept widening to 6 items only if it fits 320px — otherwise demote Categorías to icon-only on smallest viewport.

---

## AUTO — Dashboard auto-materialize

### AUTO-01
`DashboardPage` MUST call `useMaterializeRecurrings().mutate()` on first mount via `useEffect` + `useRef` guard. The mutation does not block the page render (fire-and-forget).

### AUTO-02
On `onSuccess` with `materializedCount > 0`, the dashboard MUST invalidate `walletKeys.all` and `transactionKeys.all` so the cards refresh with the new transactions.

### AUTO-03
On error, the dashboard MUST silently swallow and log to `console.error`. NO toast. The dashboard still renders normally with whatever data the user already had. Rationale: materialization is a background side effect; failures should not block the primary view.

### AUTO-04
The trigger MUST run AT MOST once per page mount. React StrictMode double-mount in dev MUST NOT cause a double POST (use a `useRef` flag).

---

## I18N — Strings

### I18N-01
A new `t.recurring` section MUST exist in `packages/web/src/lib/i18n.ts`:
- `title: 'Recurrentes'`
- `createTitle: 'Nuevo recurrente'`
- `createSubmit: 'Crear'`
- `editTitle: 'Editar recurrente'`
- `editSubmit: 'Guardar cambios'`
- `editNoChanges: 'No hay cambios'`
- `editSuccess: 'Recurrente actualizado'`
- `createSuccess: 'Recurrente creado'`
- `deleteSuccess: 'Recurrente eliminado'`
- `dayOfMonthLabel: 'Día del mes'`
- `dayOfMonthHelper: 'Si el mes tiene menos días, se ajusta al último'`
- `nextOccurrenceLabel: 'Próximo'`
- `emptyState: 'Todavía no tienes movimientos recurrentes'`
- `emptyCta: 'Crear el primero'`
- `deleteDialogTitle: 'Eliminar recurrente'`
- `deleteDialogBody: 'Esta acción no se puede deshacer. Las transacciones ya creadas no se verán afectadas.'`
- `notFound: 'Este recurrente ya no existe'`
- `descriptionFallback: 'Movimiento recurrente'`
- `sidebarLabel: 'Recurrentes'`

### I18N-02
All strings MUST be Spanish latinoamericano neutro (no voseo).

---

## Scenarios

### S-01 — create happy path (mensual, day 5)
**Given** a USD wallet exists and category `expense:rent` is valid
**When** the user posts `{ walletId, type: 'expense', amount: '1200.00', categoryId: 'expense:rent', dayOfMonth: 5 }` on May 15, 2026
**Then** the API returns 201 with `nextOccurrenceAt: '2026-06-05T00:00:00.000Z'` (day 5 already passed in May) and `lastMaterializedAt: null`.

### S-02 — create with future day this month
**Given** the same wallet, day 28, on May 15, 2026
**Then** the response has `nextOccurrenceAt: '2026-05-28T00:00:00.000Z'`.

### S-03 — create with day 31 in February
**Given** the same wallet, `dayOfMonth: 31`, on Feb 10, 2027
**Then** `nextOccurrenceAt: '2027-02-28T00:00:00.000Z'` (clamped, Feb is 28 days).

### S-04 — list returns sorted
**Given** the user has 3 recurrings with nextOccurrenceAt `2026-06-05`, `2026-05-28`, `2026-05-30`
**When** GET /recurring is called
**Then** the response items are sorted ASC: `2026-05-28`, `2026-05-30`, `2026-06-05`.

### S-05 — get not-found
**Given** a UUID that does not belong to the user
**When** GET /recurring/:id is called
**Then** 404 with `error.tag = 'not_found'`.

### S-06 — patch amount only
**Given** a recurring with amount `1200.00`
**When** PATCH with `{ amount: '1300.00' }`
**Then** the response shows the updated amount and `nextOccurrenceAt` unchanged.

### S-07 — patch dayOfMonth recomputes nextOccurrenceAt
**Given** recurring with `dayOfMonth: 5`, `nextOccurrenceAt: 2026-06-05`
**When** PATCH with `{ dayOfMonth: 28 }` on May 20, 2026
**Then** new `nextOccurrenceAt: 2026-05-28T00:00:00.000Z` (the next 28th from today, May 20).

### S-08 — patch dayOfMonth past current month
**Given** the same recurring, on May 30, 2026
**When** PATCH with `{ dayOfMonth: 1 }`
**Then** `nextOccurrenceAt: 2026-06-01T00:00:00.000Z` (next 1st is June).

### S-09 — patch invalid category type
**Given** an income recurring
**When** PATCH with `{ categoryId: 'expense:food' }`
**Then** 400 with `error.tag = 'category_mismatch'`.

### S-10 — delete
**Given** an existing recurring with 5 materialized transactions
**When** DELETE /recurring/:id is called
**Then** 204; the recurring is gone but the 5 transactions still exist.

### S-11 — materialize happy path
**Given** 3 recurrings due today and the user has 1 USD wallet with balance `500.00`
**When** POST /recurring/materialize is called
**Then** 200 with `materializedCount: 3`, the wallet balance reflects all 3 signed deltas, and 3 transactions are visible in `GET /wallets/:id/transactions`.

### S-12 — materialize race (two tabs)
**Given** 1 recurring due, two simultaneous POSTs
**Then** exactly ONE transaction is created. The second request's TransactWriteItems fails the ConditionExpression for the recurring; the use case skips it and returns `materializedCount: 0`.

### S-13 — materialize spans multiple months
**Given** a recurring with `nextOccurrenceAt = 2026-02-01` and today is 2026-05-15
**When** POST /recurring/materialize is called
**Then** 4 transactions are created (Feb 1, Mar 1, Apr 1, May 1), and the recurring's `nextOccurrenceAt` is `2026-06-01`.

### S-14 — materialize with deleted wallet
**Given** a recurring whose wallet was deleted yesterday
**When** POST /recurring/materialize is called
**Then** the TransactWriteItems for that recurring fails the wallet condition; the use case throws `RecurringWalletNotFound`; the handler returns 400 with `wallet_not_found`. The user is expected to delete the orphan recurring manually.

### S-15 — dashboard auto-materialize success
**Given** the user has 1 due recurring
**When** the user opens `/dashboard`
**Then** within ~1 second, the dashboard cards refresh and the new transaction appears in the MTD totals (because the success handler invalidates wallets + transactions caches).

### S-16 — dashboard auto-materialize error silent
**Given** the materialize endpoint returns 500
**When** the user opens `/dashboard`
**Then** the dashboard renders normally with pre-materialize data, NO toast appears, and an error is logged to console only.

### S-17 — StrictMode double-mount
**Given** dev mode with `<React.StrictMode>`
**When** DashboardPage mounts (causing useEffect to fire twice)
**Then** exactly ONE `POST /recurring/materialize` is made (guarded by `useRef`).

### S-18 — Empty state
**Given** a user with zero recurrings
**When** the user navigates to `/recurring`
**Then** `EmptyRecurringState` renders with CTA to `/recurring/new`. The dashboard's auto-materialize call still fires but returns `materializedCount: 0` immediately.

---

## Glossary

- **Materialize**: convert a `RecurringTransaction` into one or more real `Transaction` records and advance the recurring's `nextOccurrenceAt`.
- **Clamp (day-of-month)**: if `dayOfMonth > daysInMonth(month)`, use `daysInMonth(month)` for that month's occurrence. Feb 30 → Feb 28/29 depending on leap year.
- **Race lost**: the optimistic ConditionExpression on `nextOccurrenceAt` rejected the update because another concurrent request already advanced it; treated as success-equivalent (the work was done).
