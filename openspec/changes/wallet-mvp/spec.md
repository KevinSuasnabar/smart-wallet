# Spec: wallet-mvp

## 1. Glossary

| Term | Definition |
|------|------------|
| **Wallet** | An aggregate representing a named financial account owned by a single user, locked to one currency at creation, with a denormalized running balance updated atomically on every transaction write. |
| **Transaction** | An aggregate representing a single financial event (income or expense) that belongs to exactly one Wallet, has a strictly positive amount, and a sign derived from its `type` field. |
| **Category** | Either a predefined category (a stable enum value in code, identified by `"type:slug"`) or a custom category (a user-created entity stored in DynamoDB, identified by a UUID). Both types share the `type` dimension (`income` or `expense`). |
| **Predefined category** | A category whose identity is a `"type:slug"` string (e.g., `"expense:food"`, `"income:salary"`). Lives in code only; cannot be created, modified, or deleted via the API. |
| **Custom category** | A Category entity created by a user at runtime, stored as a DynamoDB item with a UUID `categoryId`, belonging to one user, subject to soft-delete. |
| **Money** | A value object `{ amount: number, currency: Currency }` where `amount` is an integer count of the smallest currency unit (cents for USD and PEN) and `currency` is `"USD" \| "PEN"`. Never floating-point internally; serialized as decimal strings at the API boundary (e.g., `1234` cents ↔ `"12.34"`). |
| **Currency** | A string literal union `"USD" \| "PEN"`. Locked to this set for MVP. |
| **UserId** | A Cognito `sub` claim (UUID string) extracted from the JWT by the auth middleware on every request. |
| **Balance** | The signed, denormalized integer-cents sum of all non-deleted transactions on a Wallet. Positive when total income exceeds total expense. Stored directly on the Wallet item and updated atomically with every transaction write. |
| **IdempotencyKey** | An opaque client-supplied string (≤128 chars) sent in the `Idempotency-Key` request header on `POST /wallets/{walletId}/transactions`. Used to guarantee at-most-once semantics for a 24-hour window. |
| **OccurredAt** | User-provided ISO8601 timestamp representing when a transaction happened in the real world. May differ from `createdAt`; used as the sort component in the DynamoDB SK and GSI1SK. |
| **CreatedAt** | Server-assigned ISO8601 timestamp (from `Clock.now()`) representing when the system recorded the entity. Immutable after creation. |
| **SoftDelete** | The practice of setting a `deletedAt` ISO8601 attribute on a DynamoDB item instead of physically removing it. Soft-deleted items are excluded from all default queries and appear as non-existent to the API. |

---

## 2. Requirements

### Wallet

- **REQ-WAL-01**: A user can create a Wallet by providing a non-empty, trimmed `name` (1–64 characters) and a `currency` from `{ "USD", "PEN" }`. The system assigns a unique `walletId` (UUID v4), sets `balance` to `0`, and records `createdAt` and `updatedAt` as the current server time.
- **REQ-WAL-02**: Wallet names are NOT required to be unique per user. A user may have multiple wallets with identical names.
- **REQ-WAL-03**: A Wallet's `currency` is immutable after creation. No endpoint exists to change it.
- **REQ-WAL-04**: `GET /wallets` returns a paginated list of all non-deleted wallets belonging to the authenticated user. Soft-deleted wallets are excluded.
- **REQ-WAL-05**: `GET /wallets/{walletId}` returns the Wallet (including current `balance` as a decimal string) if it belongs to the authenticated user and is not soft-deleted. Otherwise it returns 404.
- **REQ-WAL-06**: The `balance` field on a Wallet always reflects the sum of all non-deleted transactions: income transactions increase it, expense transactions decrease it. No additional read is required — balance is stored denormalized on the Wallet item.
- **REQ-WAL-07**: No DELETE or PATCH endpoint exists for Wallet in MVP. The `deletedAt` attribute exists in the schema but is not settable via any API call in this change.
- **REQ-WAL-08**: Paginated list endpoints (`GET /wallets`) accept optional `limit` (integer 1–100, default 50) and `cursor` (opaque pagination token) query parameters, and return `{ items, nextCursor? }`.

### Transaction

- **REQ-TXN-01**: A user can add a Transaction to a non-deleted Wallet they own. The request must include `type` (`"income"` or `"expense"`), `amount` (decimal string, > 0), `categoryId`, and `occurredAt` (ISO8601). `description` is optional (≤256 characters).
- **REQ-TXN-02**: `amount` on a Transaction is always stored as a strictly positive integer (cents). The sign is implicit in `type`: `income` increases the Wallet balance; `expense` decreases it.
- **REQ-TXN-03**: Writing a Transaction atomically updates the Wallet's `balance` counter in the same DynamoDB `TransactWriteItems` call. These two operations are all-or-nothing.
- **REQ-TXN-04**: The Transaction's `currency` is a snapshot of the Wallet's `currency` at creation time. Providing a `currency` field in the request that differs from the Wallet's currency returns 409 with `{ error: "currency_mismatch" }`.
- **REQ-TXN-05**: `occurredAt` must be within the range `[now − 5 years, now + 1 day]` (server time). Values outside this range return 400.
- **REQ-TXN-06**: `GET /wallets/{walletId}/transactions` returns a paginated list of non-deleted transactions on the specified wallet, optionally filtered by `from`, `to`, `type`, and `categoryId`. Soft-deleted transactions are excluded.
- **REQ-TXN-07**: `GET /transactions?categoryId={categoryId}` returns a paginated list of non-deleted transactions for the authenticated user filtered by category, across all wallets. This query uses GSI1.
- **REQ-TXN-08**: Attempting to add a Transaction to a non-existent or soft-deleted Wallet returns 404.
- **REQ-TXN-09**: No DELETE or PATCH endpoint exists for Transaction in MVP.
- **REQ-TXN-10**: Transactions are sorted by `occurredAt` ascending (lexicographic on the SK, which embeds `occurredAtISO`).

### Category

- **REQ-CAT-01**: `GET /categories` returns `{ predefined: [...], custom: [...] }`. The predefined list is static (from code). The custom list is the authenticated user's non-deleted custom categories from DynamoDB.
- **REQ-CAT-02**: A user can create a custom Category by providing a non-empty, trimmed `name` (1–32 characters) and a `type` (`"income"` or `"expense"`). The system assigns a UUID `categoryId` and records `createdAt`.
- **REQ-CAT-03**: A user can soft-delete a custom Category via `DELETE /categories/{categoryId}`. The endpoint returns 204 on success.
- **REQ-CAT-04**: Attempting to delete a predefined category (whose `categoryId` has the form `"type:slug"` rather than a UUID) returns 400 with `{ error: "cannot_delete_predefined" }`. This is enforced at the validation layer: the path parameter `categoryId` must be a UUID, so `type:slug` strings fail validation before reaching the use case.
- **REQ-CAT-05**: A soft-deleted custom Category cannot be referenced by new Transactions. Historical transactions that already reference the deleted category retain their `categoryId` (frozen reference).
- **REQ-CAT-06**: Predefined categories are not stored in DynamoDB. They exist as a static enum in `packages/shared-types/src/categories.ts`.
- **REQ-CAT-07**: The MVP predefined category set is fixed:
  - Income: `income:salary`, `income:freelance`, `income:investment`, `income:gift`, `income:other`
  - Expense: `expense:food`, `expense:transport`, `expense:rent`, `expense:utilities`, `expense:entertainment`, `expense:health`, `expense:education`, `expense:shopping`, `expense:other`

### Auth & Ownership

- **REQ-AUTH-01**: Every API endpoint (except any future public endpoint) requires a valid Cognito JWT in the `Authorization: Bearer` header. API Gateway returns 401 without invoking the Lambda if the JWT is missing or invalid.
- **REQ-AUTH-02**: The authenticated user's identity (`userId`) is derived exclusively from the JWT `sub` claim. The handler never trusts a user-supplied `userId`.
- **REQ-AUTH-03**: Every repository query is scoped to `PK = USER#{userId}`. It is structurally impossible to read or write another user's data.
- **REQ-AUTH-04**: When a resource (Wallet, Category) is not found under the authenticated user's partition — whether it does not exist or belongs to another user — the handler returns 404, NOT 403. Existence of other users' resources is not leaked.
- **REQ-AUTH-05**: In local development (`IS_OFFLINE=true`), the auth middleware reads `userId` from the `X-Mock-User-Id` header instead of decoding a Cognito JWT.

### Idempotency

- **REQ-IDEM-01**: `POST /wallets/{walletId}/transactions` optionally accepts an `Idempotency-Key: <string ≤128 chars>` header.
- **REQ-IDEM-02**: When `Idempotency-Key` is present and the key has NOT been seen before (within TTL), the system writes the Transaction + updates the Wallet balance + creates an `IdempotencyRecord` atomically (3-item `TransactWriteItems`). Response: 201.
- **REQ-IDEM-03**: When `Idempotency-Key` is present and the key HAS been seen before (record still within TTL), the system returns the original Transaction. Response: 200.
- **REQ-IDEM-04**: `IdempotencyRecord` items expire after 24 hours (DynamoDB native TTL on `ttl` attribute). After expiry, a re-sent key creates a new Transaction (no replay protection).
- **REQ-IDEM-05**: When `Idempotency-Key` is absent, the system performs a standard 2-item `TransactWriteItems` (Transaction + balance update). No idempotency protection. Response: 201.
- **REQ-IDEM-06**: The `IdempotencyRecord` SK is derived by hashing `userId + walletId + idempotencyKey` (SHA-256, first 32 hex chars). This prevents cross-user key collisions and bounds key length.

### Money & Precision

- **REQ-MNY-01**: `amount` is represented internally as an integer count of the smallest currency unit (cents: 100 per major unit for both USD and PEN).
- **REQ-MNY-02**: The API boundary converts between decimal strings and integer cents using a fixed scale of 100. Conversion is lossless for amounts with at most 2 decimal places.
- **REQ-MNY-03**: `amount` as a decimal string in requests must represent a value strictly greater than 0. Zero or negative values return 400.
- **REQ-MNY-04**: `amount` in all responses is serialized as a decimal string with exactly 2 decimal places (e.g., `"12.34"`, `"5.00"`).
- **REQ-MNY-05**: No floating-point arithmetic is performed on amounts at any layer. All arithmetic uses integer cents.
- **REQ-MNY-06**: `balance` in Wallet responses is serialized as a signed decimal string (e.g., `"-3.50"` if expenses exceed income).

### Soft-delete

- **REQ-DEL-01**: Soft-deleted items retain their DynamoDB items with `deletedAt` set to the ISO8601 deletion timestamp. The items are not physically removed.
- **REQ-DEL-02**: All default list queries (`ListWallets`, `ListTransactionsByWallet`, `ListTransactionsByCategory`, `ListCategories`) exclude items where `deletedAt` is set.
- **REQ-DEL-03**: All single-item gets (`GetWallet`) treat a soft-deleted item as non-existent and return 404.
- **REQ-DEL-04**: Soft-deleted custom categories appear in neither the custom list nor as valid `categoryId` targets for new transactions.
- **REQ-DEL-05**: No restore (un-delete) endpoint exists in MVP. Data is recoverable directly from DynamoDB by authorized operators.

### Validation & Boundaries

- **REQ-VAL-01**: Every handler that accepts a request body validates it with the corresponding Zod schema before invoking the use case. Invalid bodies return 400 with `{ error: "validation_failed", details: <ZodError.format()> }`. The use case is never called on a validation failure.
- **REQ-VAL-02**: Path parameters (e.g., `walletId`, `categoryId`) are validated to be UUIDs where the contract specifies UUIDs. Non-UUID values return 400.
- **REQ-VAL-03**: Query parameters are validated before reaching the use case. Invalid query parameters return 400.
- **REQ-VAL-04**: The `domain` package enforces invariants in entity constructors via `Result<T, DomainError>`. These are hand-written rules; the domain package has zero dependency on Zod.
- **REQ-VAL-05**: The `categoryId` on a Transaction must be either (a) a predefined category ID matching the Transaction's `type`, OR (b) a UUID corresponding to a non-deleted custom category owned by the same user with matching `type`. Violations return 409.
- **REQ-VAL-06**: `Wallet.name` must be non-empty after trimming, maximum 64 characters. Violations return 400.
- **REQ-VAL-07**: `Category.name` (custom) must be non-empty after trimming, maximum 32 characters. Violations return 400.
- **REQ-VAL-08**: `Transaction.description` is optional; when present, maximum 256 characters. Violations return 400.

---

## 3. Scenarios (Given/When/Then)

### Scenario: createWallet — success
- **Covers**: REQ-WAL-01, REQ-MNY-01, REQ-MNY-04
- Given: an authenticated user with `userId` `"U1"` and no existing wallets
- When: `POST /wallets` with body `{ "name": "Cash", "currency": "USD" }`
- Then: response `201` with body matching `WalletResponseSchema`:
  ```json
  {
    "walletId": "<UUID>",
    "name": "Cash",
    "currency": "USD",
    "balance": "0.00",
    "createdAt": "<ISO8601>",
    "updatedAt": "<ISO8601>"
  }
  ```
- And: a Wallet item exists in DynamoDB with `PK=USER#U1`, `SK=WALLET#<walletId>`, `balance=0`, `entityType="Wallet"`, `deletedAt` attribute absent.
- And: `createdAt` and `updatedAt` are equal (set to the same server timestamp).

### Scenario: createWallet — PEN currency
- **Covers**: REQ-WAL-01, REQ-MNY-01
- Given: an authenticated user with `userId` `"U1"`
- When: `POST /wallets` with body `{ "name": "Billetera", "currency": "PEN" }`
- Then: response `201` with `currency: "PEN"` and `balance: "0.00"`.

### Scenario: createWallet — duplicate names allowed
- **Covers**: REQ-WAL-02
- Given: user `"U1"` already has a wallet named `"Cash"` with `walletId` `"W1"`
- When: `POST /wallets` with body `{ "name": "Cash", "currency": "USD" }`
- Then: response `201` with a new `walletId` `"W2"` (different from `"W1"`).
- And: both `"W1"` and `"W2"` appear in `GET /wallets`.

### Scenario: createWallet — invalid currency
- **Covers**: REQ-VAL-01
- Given: an authenticated user
- When: `POST /wallets` with body `{ "name": "X", "currency": "EUR" }`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.
- And: no Wallet item is created.

### Scenario: createWallet — empty name
- **Covers**: REQ-WAL-01, REQ-VAL-01, REQ-VAL-06
- Given: an authenticated user
- When: `POST /wallets` with body `{ "name": "", "currency": "USD" }`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: createWallet — name exceeds 64 characters
- **Covers**: REQ-VAL-06
- Given: an authenticated user
- When: `POST /wallets` with body `{ "name": "<65-char string>", "currency": "USD" }`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: getWallet — success
- **Covers**: REQ-WAL-05, REQ-WAL-06, REQ-MNY-04, REQ-MNY-06
- Given: user `"U1"` has wallet `"W1"` (USD) with two non-deleted transactions: income `"10.00"` and expense `"3.50"` (net balance = `"6.50"`)
- When: `GET /wallets/W1` (authenticated as `"U1"`)
- Then: response `200` with body matching `WalletResponseSchema` including `"balance": "6.50"`.

### Scenario: getWallet — owned by another user returns 404
- **Covers**: REQ-AUTH-04, REQ-WAL-05
- Given: wallet `"W1"` belongs to user `"U1"`
- When: `GET /wallets/W1` authenticated as user `"U2"`
- Then: response `404` with `{ "error": "not_found" }`.
- And: nothing reveals whether `"W1"` exists.

### Scenario: getWallet — soft-deleted returns 404
- **Covers**: REQ-DEL-03, REQ-WAL-05
- Given: wallet `"W1"` owned by `"U1"` has `deletedAt` set (soft-deleted)
- When: `GET /wallets/W1` authenticated as `"U1"`
- Then: response `404` with `{ "error": "not_found" }`.

### Scenario: listWallets — excludes soft-deleted
- **Covers**: REQ-WAL-04, REQ-DEL-02
- Given: user `"U1"` has wallet `"W1"` (active) and wallet `"W2"` (soft-deleted)
- When: `GET /wallets` authenticated as `"U1"`
- Then: response `200` with `items` containing only `"W1"`. `"W2"` is absent.

### Scenario: listWallets — pagination
- **Covers**: REQ-WAL-08
- Given: user `"U1"` has 5 wallets
- When: `GET /wallets?limit=2` authenticated as `"U1"`
- Then: response `200` with `items` containing 2 wallets and `nextCursor` present.
- When: `GET /wallets?limit=2&cursor=<nextCursor>`
- Then: response `200` with next 2 wallets and a new `nextCursor` (if more remain).

### Scenario: addTransaction — first write, no idempotency key
- **Covers**: REQ-TXN-01, REQ-TXN-02, REQ-TXN-03, REQ-IDEM-05
- Given: user `"U1"` has wallet `"W1"` (USD, balance=`0`)
- When: `POST /wallets/W1/transactions` with body:
  ```json
  {
    "type": "income",
    "amount": "12.34",
    "categoryId": "income:salary",
    "occurredAt": "2026-05-10T09:00:00Z"
  }
  ```
  (no `Idempotency-Key` header)
- Then: response `201` with body matching `TransactionResponseSchema`:
  ```json
  {
    "transactionId": "<UUID>",
    "walletId": "W1",
    "type": "income",
    "amount": "12.34",
    "currency": "USD",
    "categoryId": "income:salary",
    "occurredAt": "2026-05-10T09:00:00Z",
    "createdAt": "<ISO8601>",
    "updatedAt": "<ISO8601>"
  }
  ```
- And: `GET /wallets/W1` returns `balance: "12.34"`.
- And: the DynamoDB Transaction item has `amount=1234` (integer cents).

### Scenario: addTransaction — expense decreases balance
- **Covers**: REQ-TXN-02, REQ-TXN-03, REQ-WAL-06
- Given: user `"U1"` has wallet `"W1"` (USD, balance=`1234` cents / `"12.34"`)
- When: `POST /wallets/W1/transactions` with `{ "type": "expense", "amount": "3.50", "categoryId": "expense:food", "occurredAt": "2026-05-10T12:00:00Z" }`
- Then: response `201`.
- And: `GET /wallets/W1` returns `balance: "8.84"`.

### Scenario: addTransaction — idempotent replay
- **Covers**: REQ-IDEM-01, REQ-IDEM-02, REQ-IDEM-03
- Given: user `"U1"` has wallet `"W1"` (USD)
- And: a prior `POST /wallets/W1/transactions` with `Idempotency-Key: "key-abc"` succeeded with response `201` and `transactionId: "T1"`
- When: the same request is re-sent with `Idempotency-Key: "key-abc"` within 24 hours
- Then: response `200` (NOT `201`) with the identical `TransactionResponseSchema` body as the first call (same `transactionId: "T1"`, same `amount`, same `occurredAt`).
- And: the Wallet balance is unchanged (no second write occurred).
- And: no new Transaction item exists in DynamoDB for the replay.

### Scenario: addTransaction — idempotency key first write
- **Covers**: REQ-IDEM-01, REQ-IDEM-02
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with `Idempotency-Key: "key-xyz"` and body `{ "type": "income", "amount": "5.00", "categoryId": "income:salary", "occurredAt": "2026-05-10T10:00:00Z" }`
- Then: response `201`.
- And: a `IdempotencyRecord` DynamoDB item exists with `PK=USER#U1`, `SK=IDEMPOTENCY#<hash>`, `transactionId="<UUID>"`, `ttl=<epoch + 86400s>`.

### Scenario: addTransaction — idempotency TTL expired, re-sent key creates new transaction
- **Covers**: REQ-IDEM-04
- Given: user `"U1"` has wallet `"W1"` (USD)
- And: `Idempotency-Key: "key-old"` was used >24 hours ago (TTL expired, DynamoDB has removed the record)
- When: `POST /wallets/W1/transactions` with `Idempotency-Key: "key-old"` and a valid body
- Then: response `201` with a new `transactionId`.
- And: the Wallet balance is updated (new transaction written).

### Scenario: addTransaction — currency mismatch
- **Covers**: REQ-TXN-04
- Given: user `"U1"` has wallet `"W1"` locked to `USD`
- When: `POST /wallets/W1/transactions` with body `{ "type": "income", "amount": "10.00", "categoryId": "income:salary", "occurredAt": "2026-05-10T10:00:00Z" }` AND a `currency: "PEN"` field in the body (if the schema allows) — OR any mechanism where the inferred transaction currency differs from the wallet's currency
- Then: response `409` with `{ "error": "currency_mismatch" }`.
- And: no Transaction item is written. Wallet balance is unchanged.

### Scenario: addTransaction — wallet not found
- **Covers**: REQ-TXN-08, REQ-AUTH-04
- Given: wallet `"W-NONEXISTENT"` does not exist under user `"U1"`
- When: `POST /wallets/W-NONEXISTENT/transactions` authenticated as `"U1"`
- Then: response `404` with `{ "error": "not_found" }`.

### Scenario: addTransaction — wallet soft-deleted returns 404
- **Covers**: REQ-TXN-08, REQ-DEL-03
- Given: user `"U1"` has wallet `"W1"` that is soft-deleted (`deletedAt` set)
- When: `POST /wallets/W1/transactions` authenticated as `"U1"`
- Then: response `404` with `{ "error": "not_found" }`.

### Scenario: addTransaction — amount zero returns 400
- **Covers**: REQ-MNY-03, REQ-VAL-01
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with body `{ "type": "expense", "amount": "0.00", "categoryId": "expense:food", "occurredAt": "2026-05-10T10:00:00Z" }`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: addTransaction — amount negative returns 400
- **Covers**: REQ-MNY-03, REQ-VAL-01
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with body `{ "type": "expense", "amount": "-5.00", "categoryId": "expense:food", "occurredAt": "2026-05-10T10:00:00Z" }`
- Then: response `400`.

### Scenario: addTransaction — invalid categoryId (unknown)
- **Covers**: REQ-VAL-05
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with `categoryId: "expense:nonexistent"`
- Then: response `409` with `{ "error": "invalid_category" }`.

### Scenario: addTransaction — category type mismatch
- **Covers**: REQ-VAL-05
- Given: user `"U1"` has wallet `"W1"` (USD), custom category `"C1"` with `type="expense"`
- When: `POST /wallets/W1/transactions` with `{ "type": "income", "amount": "5.00", "categoryId": "C1", "occurredAt": "2026-05-10T10:00:00Z" }`
- Then: response `409` with `{ "error": "category_type_mismatch" }`.
- And: no Transaction item is written.

### Scenario: addTransaction — soft-deleted custom category returns 409
- **Covers**: REQ-CAT-05, REQ-VAL-05
- Given: user `"U1"` has wallet `"W1"` (USD), custom category `"C1"` is soft-deleted
- When: `POST /wallets/W1/transactions` with `categoryId: "C1"`
- Then: response `409` with `{ "error": "invalid_category" }`.

### Scenario: addTransaction — occurredAt too far in the future
- **Covers**: REQ-TXN-05
- Given: server `now` is `"2026-05-12T10:00:00Z"`
- When: `POST /wallets/W1/transactions` with `occurredAt: "2026-05-14T00:00:00Z"` (>1 day in future)
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: addTransaction — occurredAt too far in the past
- **Covers**: REQ-TXN-05
- Given: server `now` is `"2026-05-12T10:00:00Z"`
- When: `POST /wallets/W1/transactions` with `occurredAt: "2020-05-11T00:00:00Z"` (>5 years ago)
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: addTransaction — occurredAt at boundary (exactly now + 1 day) is accepted
- **Covers**: REQ-TXN-05
- Given: server `now` is `"2026-05-12T10:00:00Z"`
- When: `POST /wallets/W1/transactions` with `occurredAt: "2026-05-13T10:00:00Z"` (exactly 1 day in future)
- Then: response `201` (boundary is inclusive).

### Scenario: listTransactionsByWallet — date range filter
- **Covers**: REQ-TXN-06
- Given: user `"U1"` has wallet `"W1"` with transactions on `2026-04-01`, `2026-05-01`, and `2026-06-01`
- When: `GET /wallets/W1/transactions?from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z`
- Then: response `200` with `items` containing only the `2026-05-01` transaction.

### Scenario: listTransactionsByWallet — excludes soft-deleted transactions
- **Covers**: REQ-TXN-06, REQ-DEL-02
- Given: user `"U1"` has wallet `"W1"` with two transactions: `"T1"` (active), `"T2"` (soft-deleted)
- When: `GET /wallets/W1/transactions` authenticated as `"U1"`
- Then: response `200` with `items` containing only `"T1"`.

### Scenario: listTransactionsByWallet — wallet owned by another user returns 404
- **Covers**: REQ-AUTH-04, REQ-TXN-06
- Given: wallet `"W1"` belongs to user `"U1"`
- When: `GET /wallets/W1/transactions` authenticated as user `"U2"`
- Then: response `404` with `{ "error": "not_found" }`.

### Scenario: listTransactionsByCategory — uses GSI1
- **Covers**: REQ-TXN-07
- Given: user `"U1"` has transactions across wallets `"W1"` and `"W2"`, some with `categoryId: "expense:food"`, others with different categories
- When: `GET /transactions?categoryId=expense:food` authenticated as `"U1"`
- Then: response `200` with `items` containing only transactions with `categoryId: "expense:food"`, across all wallets of `"U1"`.

### Scenario: listTransactionsByCategory — date range filter
- **Covers**: REQ-TXN-07
- Given: user `"U1"` has 3 transactions with `categoryId: "expense:food"` on dates `2026-03-01`, `2026-04-01`, `2026-05-01`
- When: `GET /transactions?categoryId=expense:food&from=2026-04-01T00:00:00Z&to=2026-04-30T23:59:59Z`
- Then: response `200` with `items` containing only the `2026-04-01` transaction.

### Scenario: listCategories — merged predefined and custom
- **Covers**: REQ-CAT-01, REQ-CAT-06, REQ-CAT-07
- Given: user `"U1"` has one custom category `"C1"` (name=`"Gym"`, type=`"expense"`) and no deleted custom categories
- When: `GET /categories` authenticated as `"U1"`
- Then: response `200` with:
  ```json
  {
    "predefined": [
      { "categoryId": "income:salary", "name": "Salary", "type": "income" },
      "...(14 predefined total)..."
    ],
    "custom": [
      { "categoryId": "C1", "name": "Gym", "type": "expense", "createdAt": "<ISO8601>" }
    ]
  }
  ```
- And: `predefined` always contains exactly 14 entries (5 income + 9 expense).

### Scenario: listCategories — excludes soft-deleted custom categories
- **Covers**: REQ-CAT-01, REQ-DEL-02, REQ-DEL-04
- Given: user `"U1"` has custom category `"C1"` (active) and `"C2"` (soft-deleted)
- When: `GET /categories` authenticated as `"U1"`
- Then: response `200` with `custom` containing only `"C1"`. `"C2"` is absent.

### Scenario: createCustomCategory — success
- **Covers**: REQ-CAT-02
- Given: an authenticated user `"U1"`
- When: `POST /categories` with body `{ "name": "Gym", "type": "expense" }`
- Then: response `201` with body matching `CategoryResponseSchema`:
  ```json
  {
    "categoryId": "<UUID>",
    "name": "Gym",
    "type": "expense",
    "createdAt": "<ISO8601>"
  }
  ```
- And: a DynamoDB item exists with `PK=USER#U1`, `SK=CATEGORY#<categoryId>`, `deletedAt` absent.

### Scenario: createCustomCategory — name too long
- **Covers**: REQ-VAL-07
- Given: an authenticated user
- When: `POST /categories` with body `{ "name": "<33-char string>", "type": "expense" }`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: deleteCustomCategory — success (soft-delete)
- **Covers**: REQ-CAT-03, REQ-DEL-01
- Given: user `"U1"` has custom category `"C1"` (active, UUID format `categoryId`)
- When: `DELETE /categories/C1` authenticated as `"U1"`
- Then: response `204` (no body).
- And: the DynamoDB item for `"C1"` still exists but now has `deletedAt` set to a valid ISO8601 timestamp.
- And: `GET /categories` no longer returns `"C1"` in `custom`.

### Scenario: deleteCustomCategory — predefined category rejected
- **Covers**: REQ-CAT-04, REQ-VAL-02
- Given: an authenticated user
- When: `DELETE /categories/expense:food`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }` (path param fails UUID validation).

### Scenario: deleteCustomCategory — not found returns 404
- **Covers**: REQ-AUTH-04, REQ-CAT-03
- Given: category `"C-NONEXISTENT"` (valid UUID) does not exist under user `"U1"`
- When: `DELETE /categories/C-NONEXISTENT` authenticated as `"U1"`
- Then: response `404` with `{ "error": "not_found" }`.

### Scenario: soft-deleted wallet is invisible to list and get
- **Covers**: REQ-WAL-04, REQ-WAL-05, REQ-DEL-02, REQ-DEL-03
- Given: user `"U1"` has wallets `"W1"` (active) and `"W2"` (soft-deleted)
- When: `GET /wallets`
- Then: `items` contains only `"W1"`.
- When: `GET /wallets/W2`
- Then: response `404`.

### Scenario: Money precision — USD round-trip "12.34" ↔ 1234 cents
- **Covers**: REQ-MNY-01, REQ-MNY-02, REQ-MNY-04
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with `amount: "12.34"`
- Then: the DynamoDB Transaction item stores `amount=1234` (integer).
- And: `GET /wallets/W1/transactions` returns the transaction with `amount: "12.34"` (string, exactly 2 decimal places).

### Scenario: Money precision — PEN round-trip "5.00" ↔ 500 cents
- **Covers**: REQ-MNY-01, REQ-MNY-02, REQ-MNY-04
- Given: user `"U1"` has wallet `"W1"` (PEN)
- When: `POST /wallets/W1/transactions` with `amount: "5.00"`
- Then: the DynamoDB Transaction item stores `amount=500` (integer).
- And: `GET /wallets/W1/transactions` returns the transaction with `amount: "5.00"`.

### Scenario: balance reflects signed net — expense exceeds income
- **Covers**: REQ-WAL-06, REQ-MNY-06
- Given: user `"U1"` has wallet `"W1"` (USD, starting balance `"0.00"`)
- When: transaction 1 — income `"3.00"`; transaction 2 — expense `"5.00"`
- Then: `GET /wallets/W1` returns `balance: "-2.00"`.

### Scenario: occurredAt validation — boundary dates
- **Covers**: REQ-TXN-05
- Given: server `now` is `"2026-05-12T10:00:00Z"`
- When: `occurredAt: "2021-05-12T10:00:00Z"` (exactly 5 years ago)
- Then: response `201` (boundary is inclusive).
- When: `occurredAt: "2021-05-12T09:59:59Z"` (1 second before 5-year boundary)
- Then: response `400`.

### Scenario: idempotency key TTL — expired key creates new transaction
- **Covers**: REQ-IDEM-04
- Given: `Idempotency-Key: "key-old"` TTL has expired (>24 hours, DynamoDB removed the record)
- When: same key is re-sent with a new transaction body
- Then: response `201` with a new `transactionId` (not a replay).

### Scenario: handler ownership check — partition scoping
- **Covers**: REQ-AUTH-03, REQ-AUTH-04
- Given: wallet `"W1"` belongs to user `"U1"` under `PK=USER#U1`
- When: `GET /wallets/W1` authenticated as user `"U2"` (different JWT `sub`)
- Then: response `404`. The query for `PK=USER#U2, SK=WALLET#W1` returns no item.
- And: no item from user `"U1"`'s partition is touched.

### Scenario: validation error — invalid body returns 400 without invoking use case
- **Covers**: REQ-VAL-01
- Given: an authenticated user
- When: `POST /wallets` with body `{ "currency": "USD" }` (missing required `name` field)
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.
- And: no DynamoDB write occurs.

### Scenario: missing JWT returns 401
- **Covers**: REQ-AUTH-01
- Given: no `Authorization` header is set
- When: any protected endpoint is called (e.g., `GET /wallets`)
- Then: response `401` (returned by API Gateway, Lambda is not invoked).

### Scenario: local dev — mock JWT via X-Mock-User-Id
- **Covers**: REQ-AUTH-05
- Given: server is running with `IS_OFFLINE=true` (serverless-offline)
- When: `GET /wallets` with header `X-Mock-User-Id: U1` (no `Authorization` header)
- Then: response `200` — the handler uses `"U1"` as `userId` without JWT verification.

### Scenario: description is optional
- **Covers**: REQ-TXN-01, REQ-VAL-08
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with body omitting `description`
- Then: response `201`. The `TransactionResponseSchema` response has no `description` field (or `description: null`).

### Scenario: description exceeds 256 characters returns 400
- **Covers**: REQ-VAL-08
- Given: user `"U1"` has wallet `"W1"` (USD)
- When: `POST /wallets/W1/transactions` with `description: "<257-char string>"`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

### Scenario: walletId path parameter must be UUID
- **Covers**: REQ-VAL-02
- Given: an authenticated user
- When: `GET /wallets/not-a-uuid`
- Then: response `400` with `{ "error": "validation_failed", "details": { ... } }`.

---

## 4. Non-functional Requirements

- **NFR-PERF-01**: p95 latency < 500 ms for all API calls measured from API Gateway. Cold-start latency up to 1.5 s is tolerated for the first invocation per concurrent execution.
- **NFR-COST-01**: All AWS resources fit within the free tier. A budget alarm at $5/month is configured. DynamoDB billing mode is `PAY_PER_REQUEST`.
- **NFR-CODE-01**: `tsc --noEmit` and `eslint` pass across all packages (`pnpm lint` and `pnpm typecheck` exit 0).
- **NFR-ARCH-01**: The `domain` package has zero runtime dependencies. It must not list `zod`, `@aws-sdk/*`, or any other runtime library in its `package.json` dependencies.
- **NFR-AUTH-01**: No API endpoint is accessible without a valid Cognito JWT in production. API Gateway's JWT Authorizer enforces this before routing to Lambda.
- **NFR-DEV-01**: The full API surface runs locally via `pnpm ddb:up` + `serverless-offline` + `X-Mock-User-Id` header, with zero cloud calls.
- **NFR-ESM-01**: All packages use `"type": "module"`. The Serverless bundling output must use `format: esm` targeting Node 22.
- **NFR-TEST-01**: Every use case can be instantiated with in-memory port implementations (no real AWS call required). Architecture is verifiable without test runners.

---

## 5. Edge Cases & Error Matrix

| Condition | Endpoint(s) | Status | Body shape |
|-----------|-------------|--------|------------|
| Missing or invalid JWT | All protected endpoints | 401 | API Gateway default (no JSON body guaranteed) |
| Invalid body (missing required field or wrong type) | `POST /wallets`, `POST /wallets/{id}/transactions`, `POST /categories` | 400 | `{ "error": "validation_failed", "details": <ZodError.format()> }` |
| Invalid path param (not a UUID where UUID expected) | `GET /wallets/{id}`, `GET /wallets/{id}/transactions`, `DELETE /categories/{id}`, `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| Predefined category ID passed to `DELETE /categories/{id}` (fails UUID check) | `DELETE /categories/{id}` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| Wallet not found or belongs to another user | `GET /wallets/{id}`, `GET /wallets/{id}/transactions`, `POST /wallets/{id}/transactions` | 404 | `{ "error": "not_found" }` |
| Wallet is soft-deleted | `GET /wallets/{id}`, `POST /wallets/{id}/transactions` | 404 | `{ "error": "not_found" }` |
| Custom category not found under user | `DELETE /categories/{id}` | 404 | `{ "error": "not_found" }` |
| Unknown `categoryId` on transaction | `POST /wallets/{id}/transactions` | 409 | `{ "error": "invalid_category" }` |
| Soft-deleted custom category referenced on transaction | `POST /wallets/{id}/transactions` | 409 | `{ "error": "invalid_category" }` |
| Category type mismatch (`income` tx + `expense` category or vice versa) | `POST /wallets/{id}/transactions` | 409 | `{ "error": "category_type_mismatch" }` |
| Currency mismatch (transaction currency ≠ wallet currency) | `POST /wallets/{id}/transactions` | 409 | `{ "error": "currency_mismatch" }` |
| Idempotent replay (valid key, within 24h TTL) | `POST /wallets/{id}/transactions` | 200 | `TransactionResponseSchema` (original transaction, identical to first 201 body) |
| `amount` ≤ 0 | `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `amount` with >2 decimal places | `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `occurredAt` > now + 1 day | `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `occurredAt` < now − 5 years | `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `occurredAt` invalid ISO8601 format | `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `name` empty or whitespace-only | `POST /wallets`, `POST /categories` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `name` exceeds max length | `POST /wallets` (>64), `POST /categories` (>32) | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| `description` exceeds 256 chars | `POST /wallets/{id}/transactions` | 400 | `{ "error": "validation_failed", "details": { ... } }` |
| Unhandled infrastructure exception (DDB throttle, network error) | All | 500 | `{ "error": "internal_error" }` |
| `403 Forbidden` | — | — | NEVER returned in MVP. Ownership mismatches return 404. |

---

## 6. Out of Scope (Reaffirmed)

The following items have no spec scenario in this change. Any attempt to verify them against this spec must be treated as out of scope.

- **`DELETE /wallets/{walletId}`** — No delete-wallet endpoint exists. The `deletedAt` attribute is in the schema but no use case sets it on Wallet.
- **`DELETE /wallets/{walletId}/transactions/{transactionId}`** — No delete-transaction endpoint exists.
- **`PATCH /wallets/{walletId}`** — No update-wallet endpoint exists.
- **`PATCH /wallets/{walletId}/transactions/{transactionId}`** — No update-transaction endpoint exists.
- **`GET /wallets/{walletId}/transactions/{transactionId}`** — No single-transaction GET endpoint exists.
- **Multi-currency conversion** — No FX or cross-currency transfer logic. Each wallet is locked to one currency forever.
- **Currencies other than USD and PEN** — EUR, GBP, JPY, and all other currencies are rejected at the Zod validation layer.
- **Budgets, recurring transactions, attachments, tags, split transactions** — Fully deferred.
- **Unit and integration tests** — `strict_tdd: false`. No test files in this change. Architecture testability is verified by code review.
- **Web frontend (`packages/web`)** — Stays a placeholder.
- **CI/CD via GitHub Actions OIDC** — Manual deploy only in this change.
- **Multi-environment (dev/staging)** — Only `prod` and local dev.
- **Second GSI** — Only `GSI1` is created in this change.
- **Outbox / domain event publication to SNS/EventBridge** — `AggregateRoot` supports in-memory events but no infrastructure-level outbox is wired.
- **Restore (un-delete)** — No endpoint or use case for un-deleting soft-deleted items.

---

## 7. Coverage Map

| REQ | Scenarios |
|-----|-----------|
| REQ-WAL-01 | createWallet — success, createWallet — PEN currency, createWallet — empty name, createWallet — name exceeds 64 characters |
| REQ-WAL-02 | createWallet — duplicate names allowed |
| REQ-WAL-03 | (structural — no endpoint to change currency; enforced by absence of PATCH endpoint) |
| REQ-WAL-04 | listWallets — excludes soft-deleted, listWallets — pagination, soft-deleted wallet is invisible to list and get |
| REQ-WAL-05 | getWallet — success, getWallet — owned by another user returns 404, getWallet — soft-deleted returns 404, soft-deleted wallet is invisible to list and get |
| REQ-WAL-06 | addTransaction — expense decreases balance, balance reflects signed net — expense exceeds income, getWallet — success |
| REQ-WAL-07 | (structural — absence of DELETE/PATCH wallet endpoints; confirmed in §6) |
| REQ-WAL-08 | listWallets — pagination |
| REQ-TXN-01 | addTransaction — first write no idempotency key, description is optional |
| REQ-TXN-02 | addTransaction — first write no idempotency key, addTransaction — expense decreases balance, Money precision — USD round-trip |
| REQ-TXN-03 | addTransaction — first write no idempotency key, addTransaction — expense decreases balance |
| REQ-TXN-04 | addTransaction — currency mismatch |
| REQ-TXN-05 | addTransaction — occurredAt too far in the future, addTransaction — occurredAt too far in the past, addTransaction — occurredAt at boundary, occurredAt validation — boundary dates |
| REQ-TXN-06 | listTransactionsByWallet — date range filter, listTransactionsByWallet — excludes soft-deleted transactions, listTransactionsByWallet — wallet owned by another user returns 404 |
| REQ-TXN-07 | listTransactionsByCategory — uses GSI1, listTransactionsByCategory — date range filter |
| REQ-TXN-08 | addTransaction — wallet not found, addTransaction — wallet soft-deleted returns 404 |
| REQ-TXN-09 | (structural — confirmed in §6) |
| REQ-TXN-10 | (structural — embedded in SK design; confirmed by listTransactionsByWallet — date range filter) |
| REQ-CAT-01 | listCategories — merged predefined and custom, listCategories — excludes soft-deleted custom categories |
| REQ-CAT-02 | createCustomCategory — success |
| REQ-CAT-03 | deleteCustomCategory — success (soft-delete), deleteCustomCategory — not found returns 404 |
| REQ-CAT-04 | deleteCustomCategory — predefined category rejected |
| REQ-CAT-05 | addTransaction — soft-deleted custom category returns 409 |
| REQ-CAT-06 | listCategories — merged predefined and custom |
| REQ-CAT-07 | listCategories — merged predefined and custom |
| REQ-AUTH-01 | missing JWT returns 401 |
| REQ-AUTH-02 | (structural — no user-supplied userId accepted; confirmed by handler ownership check scenario) |
| REQ-AUTH-03 | handler ownership check — partition scoping |
| REQ-AUTH-04 | getWallet — owned by another user returns 404, listTransactionsByWallet — wallet owned by another user returns 404, deleteCustomCategory — not found returns 404, addTransaction — wallet not found |
| REQ-AUTH-05 | local dev — mock JWT via X-Mock-User-Id |
| REQ-IDEM-01 | addTransaction — idempotency key first write, addTransaction — idempotent replay |
| REQ-IDEM-02 | addTransaction — idempotency key first write, addTransaction — idempotent replay |
| REQ-IDEM-03 | addTransaction — idempotent replay |
| REQ-IDEM-04 | addTransaction — idempotency TTL expired creates new transaction, idempotency key TTL — expired key creates new transaction |
| REQ-IDEM-05 | addTransaction — first write no idempotency key |
| REQ-IDEM-06 | (structural — hash derivation logic; verified by idempotency key first write scenario) |
| REQ-MNY-01 | Money precision — USD round-trip "12.34" ↔ 1234 cents, Money precision — PEN round-trip "5.00" ↔ 500 cents |
| REQ-MNY-02 | Money precision — USD round-trip, Money precision — PEN round-trip |
| REQ-MNY-03 | addTransaction — amount zero returns 400, addTransaction — amount negative returns 400 |
| REQ-MNY-04 | addTransaction — first write no idempotency key, Money precision — USD round-trip, Money precision — PEN round-trip |
| REQ-MNY-05 | (structural — no floating-point path in implementation; design-enforced) |
| REQ-MNY-06 | balance reflects signed net — expense exceeds income, getWallet — success |
| REQ-DEL-01 | deleteCustomCategory — success (soft-delete) |
| REQ-DEL-02 | listWallets — excludes soft-deleted, listTransactionsByWallet — excludes soft-deleted transactions, listCategories — excludes soft-deleted custom categories, soft-deleted wallet is invisible to list and get |
| REQ-DEL-03 | getWallet — soft-deleted returns 404, addTransaction — wallet soft-deleted returns 404, soft-deleted wallet is invisible to list and get |
| REQ-DEL-04 | listCategories — excludes soft-deleted custom categories, addTransaction — soft-deleted custom category returns 409 |
| REQ-DEL-05 | (structural — confirmed in §6) |
| REQ-VAL-01 | createWallet — invalid currency, createWallet — empty name, addTransaction — amount zero returns 400, addTransaction — amount negative returns 400, validation error — invalid body returns 400 |
| REQ-VAL-02 | deleteCustomCategory — predefined category rejected, walletId path parameter must be UUID |
| REQ-VAL-03 | (implied by §5 error matrix — invalid query params → 400) |
| REQ-VAL-04 | (structural — domain package has no Zod dep; enforced by NFR-ARCH-01) |
| REQ-VAL-05 | addTransaction — invalid categoryId, addTransaction — category type mismatch, addTransaction — soft-deleted custom category returns 409 |
| REQ-VAL-06 | createWallet — empty name, createWallet — name exceeds 64 characters |
| REQ-VAL-07 | createCustomCategory — name too long |
| REQ-VAL-08 | description is optional, description exceeds 256 characters returns 400 |
