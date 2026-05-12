# Tasks: wallet-mvp

## Conventions

- [ ] = pending task
- [x] = completed task (sdd-apply ticks these as it goes)
- Each task includes:
  - **ID**: `T-{slice}-{nn}` (e.g., `T-04-03`)
  - **Slice**: which design slice it belongs to (0–14)
  - **Files**: which files are created/modified
  - **Deps**: prior task IDs that must complete first
  - **Acceptance**: spec REQ IDs it satisfies + verification step
  - **Est**: rough time estimate (S=15–30m, M=30–90m, L=90–180m)

---

## Workload forecast

| Metric | Estimate |
|---|---|
| Total tasks | 62 |
| Total estimated time | ~52–78 hours |
| Estimated changed lines (LOC) | ~3,200 |
| Files created | ~68 |
| Files modified | ~8 |
| **400-line budget risk** | **High** |
| **Chained PRs recommended** | **Yes** |
| **Decision needed before apply** | **Yes** |

> Suggested PR boundaries: PR-1 (Slices 0–5: deps + domain), PR-2 (Slices 6–9: api + middleware + handlers spike), PR-3 (Slices 10–13: idempotency + CDK + Serverless + local verify), PR-4 (Slice 14: cloud deploy).

---

## Slice 0 — Install runtime deps

- [x] **T-00-01** — Install shared-types runtime deps (zod) and api runtime deps (@aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb, aws-jwt-verify)
  - Slice: 0
  - Files: `packages/shared-types/package.json`, `packages/api/package.json`, `pnpm-lock.yaml`
  - Deps: —
  - Acceptance: Scaffolding only. `pnpm install` exits 0, no resolution errors.
  - Est: S

- [x] **T-00-02** — Install api devDependencies (@types/aws-lambda) and infra-cdk runtime deps (aws-cdk-lib, constructs) + devDependencies (aws-cdk)
  - Slice: 0
  - Files: `packages/api/package.json`, `packages/infra-cdk/package.json`, `pnpm-lock.yaml`
  - Deps: T-00-01
  - Acceptance: Scaffolding only. `pnpm install` exits 0. `pnpm typecheck` exits 0 (placeholder packages compile).
  - Est: S

- [x] **T-00-03** — Install infra-sls devDependencies (serverless, serverless-esbuild, serverless-offline) and add root-level `pnpm dev` / `pnpm ddb:up` / `pnpm ddb:down` scripts if not already present
  - Slice: 0
  - Files: `packages/infra-sls/package.json`, `package.json` (root), `pnpm-lock.yaml`
  - Deps: T-00-01
  - Acceptance: Scaffolding only. `pnpm install` exits 0. `serverless --version` resolves inside infra-sls workspace.
  - Est: S

---

## Slice 1 — Shared-types foundation

- [x] **T-01-01** — Create `packages/shared-types/src/currencies.ts` with `CURRENCIES`, `Currency` type, `currencyDecimals` record, and `zCurrency` Zod enum (USD | PEN only)
  - Slice: 1
  - Files: `packages/shared-types/src/currencies.ts`
  - Deps: T-00-01
  - Acceptance: REQ-MNY-01; `tsc --noEmit` green in shared-types; eslint clean.
  - Est: S

- [x] **T-01-02** — Create `packages/shared-types/src/categories.ts` with `PREDEFINED_INCOME_IDS`, `PREDEFINED_EXPENSE_IDS`, `PREDEFINED_CATEGORY_IDS`, `PredefinedCategoryId` union, `PREDEFINED_CATEGORIES` const (all 14 entries with name and type), and `isPredefinedCategoryId` helper
  - Slice: 1
  - Files: `packages/shared-types/src/categories.ts`
  - Deps: T-00-01
  - Acceptance: REQ-CAT-06, REQ-CAT-07; tsc green; eslint clean. Verify exactly 5 income + 9 expense entries.
  - Est: S

- [x] **T-01-03** — Create `packages/shared-types/src/schemas/common.ts` with `zUuid`, `zUserId`, `zWalletId`, `zTransactionId`, `zCategoryId` (UUID v4 regex) Zod helpers
  - Slice: 1
  - Files: `packages/shared-types/src/schemas/common.ts`
  - Deps: T-01-01
  - Acceptance: REQ-VAL-02; tsc green; eslint clean.
  - Est: S

- [x] **T-01-04** — Create `packages/shared-types/src/pagination.ts` with `zCursor`, `zLimit` (integer 1–100, default 50), and `zPaginatedResponse` generic factory; create `packages/shared-types/src/date.ts` with `zIso8601` (ISO8601 string validation, no range — range is applied in transaction schema)
  - Slice: 1
  - Files: `packages/shared-types/src/pagination.ts`, `packages/shared-types/src/date.ts`
  - Deps: T-01-01
  - Acceptance: REQ-WAL-08; tsc green; eslint clean.
  - Est: S

- [x] **T-01-05** — Create `packages/shared-types/src/schemas/wallet.ts` with `CreateWalletRequestSchema` (name 1–64 trimmed, currency from zCurrency), `WalletResponseSchema`, `ListWalletsResponseSchema`; create `packages/shared-types/src/schemas/category.ts` with `CreateCustomCategoryRequestSchema`, `CategoryResponseSchema`, `ListCategoriesResponseSchema`; create `packages/shared-types/src/schemas/transaction.ts` with `AddTransactionRequestSchema` (amount as plain decimal string — no cents transform here), `TransactionResponseSchema`, `ListTransactionsResponseSchema`, `ListTransactionsByWalletQuerySchema` (from/to/type/categoryId/limit/cursor), `ListTransactionsByCategoryQuerySchema` (categoryId required, from/to/limit/cursor)
  - Slice: 1
  - Files: `packages/shared-types/src/schemas/wallet.ts`, `packages/shared-types/src/schemas/category.ts`, `packages/shared-types/src/schemas/transaction.ts`
  - Deps: T-01-01, T-01-02, T-01-03, T-01-04
  - Acceptance: REQ-WAL-01, REQ-WAL-06, REQ-WAL-08, REQ-CAT-01, REQ-CAT-02, REQ-TXN-01, REQ-VAL-06, REQ-VAL-07; tsc green; eslint clean.
  - Est: M

- [x] **T-01-06** — Create `packages/shared-types/src/index.ts` barrel exporting all schemas, inferred DTO types, currencies, categories, pagination helpers, and date helpers; verify the package builds cleanly
  - Slice: 1
  - Files: `packages/shared-types/src/index.ts`
  - Deps: T-01-01, T-01-02, T-01-03, T-01-04, T-01-05
  - Acceptance: Scaffolding only. `pnpm --filter @smart-wallet/shared-types build` exits 0. tsc green. eslint clean.
  - Est: S

---

## Slice 2 — Domain shared base

- [x] **T-02-01** — Create `packages/domain/src/shared/Result.ts` with `Result<T, E>` discriminated union (`{ ok: true; value: T } | { ok: false; error: E }`), `ok()`, `err()`, `isOk()`, `isErr()`, `mapResult()`, `chainResult()` helper functions
  - Slice: 2
  - Files: `packages/domain/src/shared/Result.ts`
  - Deps: T-00-02
  - Acceptance: REQ-VAL-04 (domain has no Zod dep); tsc green; eslint clean.
  - Est: S

- [x] **T-02-02** — Create `packages/domain/src/shared/DomainError.ts` abstract base class with `tag: string` and `httpStatus: 400 | 404 | 409` abstract properties; create `packages/domain/src/shared/DomainEvent.ts` interface; create `packages/domain/src/shared/Clock.ts` interface (`now(): Date`); create `packages/domain/src/shared/IdGenerator.ts` interface (`uuid(): string`)
  - Slice: 2
  - Files: `packages/domain/src/shared/DomainError.ts`, `packages/domain/src/shared/DomainEvent.ts`, `packages/domain/src/shared/Clock.ts`, `packages/domain/src/shared/IdGenerator.ts`
  - Deps: T-02-01
  - Acceptance: NFR-ARCH-01 (zero runtime deps in domain); tsc green; eslint clean.
  - Est: S

- [x] **T-02-03** — Create `packages/domain/src/shared/Entity.ts` generic `Entity<TId>` with `readonly id: TId` and `equals(other: Entity<TId>): boolean`; create `packages/domain/src/shared/AggregateRoot.ts` extending `Entity<TId>` with `private events: DomainEvent[]`, `pullEvents(): DomainEvent[]` (returns and clears); create `packages/domain/src/shared/ValueObject.ts` generic with frozen `readonly props: TProps` and `equals(other)` via JSON comparison
  - Slice: 2
  - Files: `packages/domain/src/shared/Entity.ts`, `packages/domain/src/shared/AggregateRoot.ts`, `packages/domain/src/shared/ValueObject.ts`
  - Deps: T-02-02
  - Acceptance: NFR-ARCH-01; tsc green; eslint clean.
  - Est: M

- [x] **T-02-04** — Create `packages/domain/src/index.ts` barrel (initially re-exports shared/ only); verify domain package has zero runtime dependencies (check package.json has no `dependencies` other than workspace cross-references)
  - Slice: 2
  - Files: `packages/domain/src/index.ts`
  - Deps: T-02-01, T-02-02, T-02-03
  - Acceptance: NFR-ARCH-01; tsc green; eslint clean. Confirm `packages/domain/package.json` lists no runtime deps.
  - Est: S

---

## Slice 3 — Wallet aggregate

- [x] **T-03-01** — Create `packages/domain/src/user/UserId.ts` (VO wrapping Cognito sub string); create `packages/domain/src/wallet/WalletId.ts` (VO wrapping UUID string)
  - Slice: 3
  - Files: `packages/domain/src/user/UserId.ts`, `packages/domain/src/wallet/WalletId.ts`
  - Deps: T-02-03
  - Acceptance: REQ-AUTH-02; tsc green; eslint clean.
  - Est: S

- [x] **T-03-02** — Create `packages/domain/src/wallet/WalletError.ts` with `WalletError.InvalidName` (tag `wallet.invalid_name`, 400), `WalletError.NotFound` (tag `wallet.not_found`, 404); create `packages/domain/src/wallet/events/WalletCreated.ts` domain event
  - Slice: 3
  - Files: `packages/domain/src/wallet/WalletError.ts`, `packages/domain/src/wallet/events/WalletCreated.ts`
  - Deps: T-02-02, T-03-01
  - Acceptance: Scaffolding only; tsc green; eslint clean.
  - Est: S

- [x] **T-03-03** — Create `packages/domain/src/wallet/Wallet.ts` AggregateRoot: props interface (`name`, `currency` from `Currency` type, `balance: number`, `createdAt`, `updatedAt`, `deletedAt?`); static `Wallet.create()` returning `Result<Wallet, WalletError>` enforcing non-empty trimmed name ≤64 chars, valid currency, balance=0, equal createdAt/updatedAt; `applyBalanceChange(delta: number): void`; `isDeleted(): boolean` checking `deletedAt`; note: import `Currency` from `@smart-wallet/shared-types` as type-only import (`import type`)
  - Slice: 3
  - Files: `packages/domain/src/wallet/Wallet.ts`
  - Deps: T-02-03, T-03-01, T-03-02
  - Acceptance: REQ-WAL-01, REQ-WAL-02, REQ-WAL-03, REQ-WAL-06, REQ-VAL-06; tsc green; eslint clean.
  - Est: M

- [x] **T-03-04** — Create `packages/domain/src/wallet/WalletRepository.ts` port interface with `create(wallet: Wallet): Promise<void>`, `findById(userId: UserId, walletId: WalletId): Promise<Wallet | null>`, `listByUser(userId: UserId, page: { limit: number; cursor?: string }): Promise<{ items: Wallet[]; nextCursor?: string }>`
  - Slice: 3
  - Files: `packages/domain/src/wallet/WalletRepository.ts`
  - Deps: T-03-03
  - Acceptance: REQ-AUTH-03, REQ-WAL-04, REQ-WAL-05, REQ-WAL-08; tsc green; eslint clean.
  - Est: S

- [x] **T-03-05** — Create `packages/domain/src/wallet/usecases/CreateWallet.ts`: constructor takes `WalletRepository`, `Clock`, `IdGenerator`; `execute(userId: UserId, input: { name: string; currency: string }): Promise<Result<Wallet, WalletError>>` — validates via `Wallet.create()`, calls `repo.create()`, returns the wallet; create `packages/domain/src/wallet/usecases/GetWallet.ts`: `execute(userId, walletId)` calls `repo.findById`, returns `Result<Wallet, WalletError.NotFound>` (404 if null or deleted)
  - Slice: 3
  - Files: `packages/domain/src/wallet/usecases/CreateWallet.ts`, `packages/domain/src/wallet/usecases/GetWallet.ts`
  - Deps: T-03-03, T-03-04
  - Acceptance: REQ-WAL-01, REQ-WAL-05, REQ-DEL-03; tsc green; eslint clean.
  - Est: M

- [x] **T-03-06** — Create `packages/domain/src/wallet/usecases/ListWallets.ts`: `execute(userId, page)` delegates to `repo.listByUser()` and returns items + nextCursor; update `packages/domain/src/index.ts` barrel to re-export wallet aggregate, errors, repository port, use cases
  - Slice: 3
  - Files: `packages/domain/src/wallet/usecases/ListWallets.ts`, `packages/domain/src/index.ts`
  - Deps: T-03-04
  - Acceptance: REQ-WAL-04, REQ-WAL-08, REQ-DEL-02; tsc green; eslint clean.
  - Est: S

---

## Slice 4 — Money + Transaction aggregate

- [x] **T-04-01** — Create `packages/domain/src/transaction/Money.ts` VO: props `{ amount: number; currency: Currency }` (amount is strictly positive integer cents); `Money.create()` returning `Result<Money, TransactionError.AmountNotPositive>` if amount ≤ 0; `add(other: Money): Money`, `subtract(other: Money): Money`, `negate(): Money`; note: `import type { Currency }` from `@smart-wallet/shared-types`
  - Slice: 4
  - Files: `packages/domain/src/transaction/Money.ts`
  - Deps: T-02-03
  - Acceptance: REQ-MNY-01, REQ-MNY-02, REQ-MNY-05, REQ-TXN-02; tsc green; eslint clean.
  - Est: M

- [x] **T-04-02** — Create `packages/domain/src/transaction/TransactionId.ts` (VO wrapping UUID string); create `packages/domain/src/transaction/TransactionError.ts` with: `CurrencyMismatch` (tag `transaction.currency_mismatch`, 409), `AmountNotPositive` (tag `transaction.amount_not_positive`, 400), `InvalidOccurredAt` (tag `transaction.invalid_occurred_at`, 400), `UnknownCategory` (tag `transaction.unknown_category`, 409), `CategoryTypeMismatch` (tag `transaction.category_type_mismatch`, 409), `WalletNotFound` extending `WalletError.NotFound` or referencing it via tag; create `packages/domain/src/transaction/events/TransactionAdded.ts` domain event
  - Slice: 4
  - Files: `packages/domain/src/transaction/TransactionId.ts`, `packages/domain/src/transaction/TransactionError.ts`, `packages/domain/src/transaction/events/TransactionAdded.ts`
  - Deps: T-02-02, T-04-01
  - Acceptance: Scaffolding only; tsc green; eslint clean.
  - Est: S

- [x] **T-04-03** — Create `packages/domain/src/transaction/Transaction.ts` AggregateRoot: props interface (`transactionId`, `walletId`, `userId`, `type: 'income' | 'expense'`, `amount: number` (positive cents), `currency`, `categoryId: string`, `description?: string`, `occurredAt: string`, `createdAt`, `updatedAt`, `deletedAt?`, `gsi1pk?: string`, `gsi1sk?: string`); static `Transaction.create()` enforcing: positive amount, valid ISO8601 occurredAt within range [now − 5 years, now + 1 day] (server time from Clock), categoryId format (either predefined format or UUID), currency matches wallet currency (passed in as arg); emits `TransactionAdded` domain event; `isDeleted(): boolean`
  - Slice: 4
  - Files: `packages/domain/src/transaction/Transaction.ts`
  - Deps: T-03-03, T-04-01, T-04-02
  - Acceptance: REQ-TXN-01, REQ-TXN-02, REQ-TXN-04, REQ-TXN-05, REQ-MNY-03, REQ-MNY-05, REQ-VAL-08; tsc green; eslint clean.
  - Est: L

- [x] **T-04-04** — Create `packages/domain/src/transaction/TransactionRepository.ts` port interface: `add(input: { transaction: Transaction; walletBalanceDelta: number; idempotencyRecord?: { pk: string; sk: string; ttlEpochSeconds: number } }): Promise<void>`; `findById(userId: UserId, transactionId: TransactionId): Promise<Transaction | null>`; `listByWallet(userId: UserId, walletId: WalletId, filter: ListByWalletFilter): Promise<{ items: Transaction[]; nextCursor?: string }>`; `listByCategory(userId: UserId, categoryId: string, filter: ListByCategoryFilter): Promise<{ items: Transaction[]; nextCursor?: string }>`; `findIdempotentTransactionId(userId: UserId, idempotencyRecordSk: string): Promise<TransactionId | null>`; define `ListByWalletFilter` and `ListByCategoryFilter` inline interfaces (from/to/type/categoryId/limit/cursor)
  - Slice: 4
  - Files: `packages/domain/src/transaction/TransactionRepository.ts`
  - Deps: T-04-03
  - Acceptance: REQ-TXN-03, REQ-TXN-06, REQ-TXN-07, REQ-IDEM-01; tsc green; eslint clean.
  - Est: M

- [x] **T-04-05** — Create `packages/domain/src/transaction/usecases/AddTransaction.ts`: constructor takes `WalletRepository`, `TransactionRepository`, `CategoryRepository`, `Clock`, `IdGenerator`; `execute(userId, walletId, input)` — loads wallet (404 if null/deleted), validates currency, validates category (see category slice note below — AddTransaction depends on CategoryRepository port, which is created in Slice 5; for now stub the interface import and add a TODO comment), creates `Transaction`, calls `repo.add()` with 2-op path (no idempotency yet — extended in Slice 10), returns `Result<Transaction, DomainError>`
  - Slice: 4
  - Files: `packages/domain/src/transaction/usecases/AddTransaction.ts`
  - Deps: T-04-03, T-04-04, T-03-04
  - Acceptance: REQ-TXN-01, REQ-TXN-03, REQ-TXN-08, REQ-TXN-04, REQ-MNY-03; tsc green; eslint clean. Note: category validation is wired after Slice 5.
  - Est: M

- [x] **T-04-06** — Create `packages/domain/src/transaction/usecases/ListTransactionsByWallet.ts` and `packages/domain/src/transaction/usecases/ListTransactionsByCategory.ts`; update `packages/domain/src/index.ts` barrel to re-export transaction aggregate, errors, repository port, use cases
  - Slice: 4
  - Files: `packages/domain/src/transaction/usecases/ListTransactionsByWallet.ts`, `packages/domain/src/transaction/usecases/ListTransactionsByCategory.ts`, `packages/domain/src/index.ts`
  - Deps: T-04-04
  - Acceptance: REQ-TXN-06, REQ-TXN-07, REQ-TXN-10, REQ-DEL-02; tsc green; eslint clean.
  - Est: M

---

## Slice 5 — Category aggregate

- [x] **T-05-01** — Create `packages/domain/src/category/CategoryType.ts` (`type CategoryType = 'income' | 'expense'`); create `packages/domain/src/category/CategoryId.ts` with helpers `isPredefinedCategoryId(id: string): boolean` (delegates via `import type` to shared-types) and `isUuidCategoryId(id: string): boolean`; create `packages/domain/src/category/CategoryError.ts` with: `InvalidName` (tag `category.invalid_name`, 400), `NotFound` (tag `category.not_found`, 404), `PredefinedCannotBeDeleted` (tag `category.predefined_immutable`, 400)
  - Slice: 5
  - Files: `packages/domain/src/category/CategoryType.ts`, `packages/domain/src/category/CategoryId.ts`, `packages/domain/src/category/CategoryError.ts`
  - Deps: T-02-02, T-01-02
  - Acceptance: REQ-CAT-04, REQ-VAL-02; tsc green; eslint clean.
  - Est: S

- [x] **T-05-02** — Create `packages/domain/src/category/Category.ts` entity: props (`categoryId: string` UUID, `userId: string`, `name: string`, `type: CategoryType`, `createdAt: string`, `updatedAt?: string`, `deletedAt?: string`); static `Category.create()` validating non-empty trimmed name ≤32 chars, returning `Result<Category, CategoryError.InvalidName>`; `isDeleted(): boolean`
  - Slice: 5
  - Files: `packages/domain/src/category/Category.ts`
  - Deps: T-02-01, T-05-01
  - Acceptance: REQ-CAT-02, REQ-VAL-07; tsc green; eslint clean.
  - Est: M

- [x] **T-05-03** — Create `packages/domain/src/category/CategoryRepository.ts` port interface: `create(category: Category): Promise<void>`, `findById(userId: UserId, categoryId: string): Promise<Category | null>`, `listCustomByUser(userId: UserId): Promise<Category[]>`, `softDelete(userId: UserId, categoryId: string, at: Date): Promise<void>`
  - Slice: 5
  - Files: `packages/domain/src/category/CategoryRepository.ts`
  - Deps: T-05-02
  - Acceptance: REQ-CAT-03, REQ-CAT-05, REQ-DEL-01; tsc green; eslint clean.
  - Est: S

- [x] **T-05-04** — Create `packages/domain/src/category/usecases/ListCategories.ts`: merges `PREDEFINED_CATEGORIES` (from shared-types, type-only import) with `repo.listCustomByUser()` result; returns `{ predefined: PredefinedCategory[]; custom: Category[] }`; create `packages/domain/src/category/usecases/CreateCustomCategory.ts`: validates name, creates Category, calls `repo.create()`; create `packages/domain/src/category/usecases/DeleteCustomCategory.ts`: loads by id (404 if not found), calls `repo.softDelete()`, returns `Result<void, CategoryError.NotFound>`
  - Slice: 5
  - Files: `packages/domain/src/category/usecases/ListCategories.ts`, `packages/domain/src/category/usecases/CreateCustomCategory.ts`, `packages/domain/src/category/usecases/DeleteCustomCategory.ts`
  - Deps: T-05-02, T-05-03
  - Acceptance: REQ-CAT-01, REQ-CAT-02, REQ-CAT-03, REQ-CAT-05, REQ-DEL-01, REQ-DEL-02, REQ-DEL-04; tsc green; eslint clean.
  - Est: M

- [x] **T-05-05** — Wire category validation into `AddTransaction.ts`: replace TODO stub with real category check — load category via `CategoryRepository.findById`; if null or deleted → `UnknownCategory`; if type doesn't match transaction type → `CategoryTypeMismatch`; handle predefined category IDs (no DB lookup needed, just validate against `PREDEFINED_CATEGORY_IDS`); update `packages/domain/src/index.ts` to re-export category aggregate, errors, repository port, use cases
  - Slice: 5
  - Files: `packages/domain/src/transaction/usecases/AddTransaction.ts`, `packages/domain/src/index.ts`
  - Deps: T-04-05, T-05-03
  - Acceptance: REQ-VAL-05, REQ-CAT-05, REQ-DEL-04; tsc green; eslint clean.
  - Est: M

---

## Slice 6 — Zod transforms + boundary validation

- [x] **T-06-01** — Create `packages/shared-types/src/money.ts` with `decimalStringToCents(value: string, currency: Currency): number` (throws on >2 decimal places, negative, zero); `centsToDecimalString(cents: number, currency: Currency): string` (always 2 decimal places, signed); `zDecimalString` Zod schema (regex validates decimal format, strictly positive, ≤2 decimal places)
  - Slice: 6
  - Files: `packages/shared-types/src/money.ts`
  - Deps: T-01-01
  - Acceptance: REQ-MNY-01, REQ-MNY-02, REQ-MNY-03, REQ-MNY-04, REQ-MNY-05; tsc green; eslint clean. Manual check: `decimalStringToCents("12.34", "USD") === 1234`, `centsToDecimalString(1234, "USD") === "12.34"`, `centsToDecimalString(-200, "USD") === "-2.00"`, `centsToDecimalString(500, "PEN") === "5.00"`.
  - Est: M

- [x] **T-06-02** — Update `packages/shared-types/src/schemas/transaction.ts`: replace plain `amount: z.string()` with `zDecimalString` (positive, ≤2 decimal places) in `AddTransactionRequestSchema`; add `zOccurredAt` (ISO8601 string only — range validation done in domain); update `packages/shared-types/src/schemas/common.ts`: add `zCategoryId` that accepts either a predefined category ID string OR a UUID v4 (use `.refine()` or a union); update `packages/shared-types/src/index.ts` barrel to export money helpers
  - Slice: 6
  - Files: `packages/shared-types/src/schemas/transaction.ts`, `packages/shared-types/src/schemas/common.ts`, `packages/shared-types/src/index.ts`
  - Deps: T-06-01, T-01-05, T-01-06
  - Acceptance: REQ-MNY-03, REQ-TXN-05, REQ-VAL-01, REQ-VAL-05; tsc green; eslint clean.
  - Est: M

---

## Slice 7 — DynamoDB adapters + key builders

- [x] **T-07-01** — Create `packages/api/src/shared/env.ts`: typed reader for `TABLE_NAME`, `GSI1_NAME`, `AWS_REGION`, `IS_OFFLINE` (boolean from string), `LOCAL_USER_ID?`; throws at module load if required vars are absent; create `packages/api/src/adapters/dynamodb/DynamoDBClient.ts`: module-scope `DynamoDBClient` + `DynamoDBDocumentClient` singletons with `marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false, convertClassInstanceToMap: false }` and offline endpoint branch
  - Slice: 7
  - Files: `packages/api/src/shared/env.ts`, `packages/api/src/adapters/dynamodb/DynamoDBClient.ts`
  - Deps: T-00-01, T-00-02
  - Acceptance: Scaffolding only; tsc green; eslint clean. Verify `removeUndefinedValues: true` is present (critical for `attribute_not_exists` filters).
  - Est: S

- [x] **T-07-02** — Create `packages/api/src/adapters/dynamodb/keyBuilders.ts` with `keyForWallet`, `keyForTransaction`, `keyForTransactionGsi1`, `keyForCategory`, `keyForIdempotency` pure functions matching the DDB schema in proposal §4.2; create `packages/api/src/adapters/dynamodb/cursorCodec.ts` with `encodeCursor(lastKey: Record<string, unknown>): string` (base64 JSON) and `decodeCursor(cursor: string): Record<string, unknown>` (base64 JSON; returns undefined on invalid input)
  - Slice: 7
  - Files: `packages/api/src/adapters/dynamodb/keyBuilders.ts`, `packages/api/src/adapters/dynamodb/cursorCodec.ts`
  - Deps: T-07-01
  - Acceptance: Scaffolding only; tsc green; eslint clean. Keys must match exactly: `USER#{userId}`, `WALLET#{walletId}`, `TXN#{walletId}#{occurredAtISO}#{transactionId}`, `CATEGORY#{categoryId}`, `IDEMPOTENCY#{hash32}`, `CAT#{categoryId}#{occurredAtISO}#{transactionId}` (GSI1SK).
  - Est: S

- [x] **T-07-03** — Create `packages/api/src/adapters/dynamodb/mappers/WalletMapper.ts` with `toItem(wallet: Wallet): Record<string, unknown>` (adds `entityType: "Wallet"`, omits `deletedAt` when not set via conditional spread) and `fromItem(item: Record<string, unknown>): Result<Wallet, DomainError>` (narrows `entityType`, reconstructs entity); create `packages/api/src/adapters/dynamodb/mappers/CategoryMapper.ts` similarly for `Category`
  - Slice: 7
  - Files: `packages/api/src/adapters/dynamodb/mappers/WalletMapper.ts`, `packages/api/src/adapters/dynamodb/mappers/CategoryMapper.ts`
  - Deps: T-07-02, T-03-03, T-05-02
  - Acceptance: REQ-DEL-01; tsc green; eslint clean. Confirm `exactOptionalPropertyTypes` pattern: conditional spread for `deletedAt`, `updatedAt`, `description`.
  - Est: M

- [x] **T-07-04** — Create `packages/api/src/adapters/dynamodb/mappers/TransactionMapper.ts` with `toItem(txn: Transaction)` (sets `GSI1PK`, `GSI1SK` attributes) and `fromItem(item)` — handles `entityType: "Transaction"`, reconstructs from DDB attributes including GSI keys
  - Slice: 7
  - Files: `packages/api/src/adapters/dynamodb/mappers/TransactionMapper.ts`
  - Deps: T-07-02, T-04-03
  - Acceptance: REQ-TXN-02, REQ-TXN-10; tsc green; eslint clean. Verify `GSI1PK` and `GSI1SK` are set correctly so `listByCategory` query works.
  - Est: M

- [x] **T-07-05** — Create `packages/api/src/adapters/dynamodb/DynamoDBWalletRepository.ts` implementing `WalletRepository` port: `create()` uses `PutItemCommand`; `findById()` uses `GetItemCommand`, checks `deletedAt` attribute; `listByUser()` uses `QueryCommand` with `begins_with(SK, "WALLET#")` and `FilterExpression: "attribute_not_exists(deletedAt)"`, pagination via `ExclusiveStartKey`/`LastEvaluatedKey` encoded with `cursorCodec`
  - Slice: 7
  - Files: `packages/api/src/adapters/dynamodb/DynamoDBWalletRepository.ts`
  - Deps: T-07-03, T-07-01
  - Acceptance: REQ-WAL-04, REQ-WAL-05, REQ-DEL-02, REQ-DEL-03, REQ-AUTH-03; tsc green; eslint clean.
  - Est: M

- [x] **T-07-06** — Create `packages/api/src/adapters/dynamodb/DynamoDBCategoryRepository.ts` implementing `CategoryRepository` port: `create()` uses `PutItemCommand`; `findById()` uses `GetItemCommand`; `listCustomByUser()` uses `QueryCommand` with `begins_with(SK, "CATEGORY#")` and excludes `deletedAt`; `softDelete()` uses `UpdateItemCommand` setting `deletedAt`
  - Slice: 7
  - Files: `packages/api/src/adapters/dynamodb/DynamoDBCategoryRepository.ts`
  - Deps: T-07-03, T-07-01
  - Acceptance: REQ-CAT-01, REQ-CAT-03, REQ-DEL-01, REQ-DEL-02; tsc green; eslint clean.
  - Est: M

- [x] **T-07-07** — Create `packages/api/src/adapters/dynamodb/DynamoDBTransactionRepository.ts` implementing `TransactionRepository` port: `add()` with 2-op `TransactWriteItems` (Transaction `Put` + Wallet balance `Update` with `ADD balance :delta`); `listByWallet()` with `QueryCommand`, `begins_with(SK, "TXN#{walletId}#")`, optional `from`/`to` range on SK via `BETWEEN`, excludes `deletedAt`; `listByCategory()` with `QueryCommand` on GSI1, `begins_with(GSI1SK, "CAT#{categoryId}#")`; `findIdempotentTransactionId()` placeholder returning `null` (extended in Slice 10); `findById()` placeholder
  - Slice: 7
  - Files: `packages/api/src/adapters/dynamodb/DynamoDBTransactionRepository.ts`
  - Deps: T-07-04, T-07-01
  - Acceptance: REQ-TXN-03, REQ-TXN-06, REQ-TXN-07, REQ-TXN-10, REQ-DEL-02; tsc green; eslint clean.
  - Est: L

- [x] **T-07-08** — Create `packages/api/src/adapters/system/SystemClock.ts` implementing `Clock` (`now(): Date { return new Date(); }`); create `packages/api/src/adapters/system/UuidIdGenerator.ts` implementing `IdGenerator` using `crypto.randomUUID()` from Node 22 built-in (no uuid package dependency — confirm during Slice 9 spike that this works with ESM bundler)
  - Slice: 7
  - Files: `packages/api/src/adapters/system/SystemClock.ts`, `packages/api/src/adapters/system/UuidIdGenerator.ts`
  - Deps: T-02-02
  - Acceptance: NFR-ESM-01; tsc green; eslint clean.
  - Est: S

---

## Slice 8 — API middleware + composition root

- [ ] **T-08-01** — Create `packages/api/src/middleware/compose.ts`: `compose(...middlewares)(handler)` applies middleware outside-in; define the `HandlerContext` generic type that middlewares augment (`userId`, `body`, `query`, `path`); create `packages/api/src/shared/response.ts` with `ok()`, `created()`, `noContent()`, `formatJson()` helpers returning `APIGatewayProxyResultV2`
  - Slice: 8
  - Files: `packages/api/src/middleware/compose.ts`, `packages/api/src/shared/response.ts`
  - Deps: T-00-02
  - Acceptance: Scaffolding only; tsc green; eslint clean.
  - Est: M

- [ ] **T-08-02** — Create `packages/api/src/middleware/withAuth.ts`: when `IS_OFFLINE=true`, reads `X-Mock-User-Id` header (falls back to `LOCAL_USER_ID` env); otherwise reads `event.requestContext.authorizer.jwt.claims.sub`; constructs `UserId` VO; adds `ctx.userId`; creates a synthetic claims shape in offline mode so downstream code sees uniform structure; create `packages/api/src/adapters/cognito/extractUserId.ts` helper (used by withAuth)
  - Slice: 8
  - Files: `packages/api/src/middleware/withAuth.ts`, `packages/api/src/adapters/cognito/extractUserId.ts`
  - Deps: T-08-01, T-03-01
  - Acceptance: REQ-AUTH-01, REQ-AUTH-02, REQ-AUTH-05; tsc green; eslint clean.
  - Est: M

- [ ] **T-08-03** — Create `packages/api/src/middleware/withValidation.ts`: takes `{ body?, query?, path? }` Zod schema config; `JSON.parse` with try/catch for malformed body (returns 400 `invalid_json`); runs Zod parse, on failure returns 400 with `{ error: "validation_failed", details: ZodError.flatten() }`; on success augments `ctx.body`, `ctx.query`, `ctx.path`; create `packages/api/src/middleware/withErrorHandler.ts`: wraps entire handler in try/catch; `DomainError` instances → `error.httpStatus` + `{ error: error.tag, message: error.message }`; unknown → 500 + `{ error: "internal_error", message: "An unexpected error occurred." }` + full error logged via logger
  - Slice: 8
  - Files: `packages/api/src/middleware/withValidation.ts`, `packages/api/src/middleware/withErrorHandler.ts`
  - Deps: T-08-01
  - Acceptance: REQ-VAL-01, REQ-VAL-02, REQ-VAL-03; tsc green; eslint clean.
  - Est: M

- [ ] **T-08-04** — Create `packages/api/src/shared/errors.ts`: `mapDomainError(error: DomainError): APIGatewayProxyResultV2` mapping `error.httpStatus` → HTTP status + JSON body `{ error: error.tag, message: error.message }`; create `packages/api/src/shared/idempotency.ts`: `computeIdempotencyHash(userId: string, walletId: string, key: string): string` — SHA-256 via `node:crypto`, first 32 hex chars; create `packages/api/src/shared/logger.ts`: `log.info(msg, fields)` / `log.error(msg, err, fields)` using `console.log(JSON.stringify(...))` with `{ level, msg, ts, ...fields }`
  - Slice: 8
  - Files: `packages/api/src/shared/errors.ts`, `packages/api/src/shared/idempotency.ts`, `packages/api/src/shared/logger.ts`
  - Deps: T-02-02
  - Acceptance: REQ-IDEM-06; tsc green; eslint clean. Manual check: `computeIdempotencyHash("U1", "W1", "key-abc")` returns a 32-char hex string.
  - Est: M

- [ ] **T-08-05** — Create `packages/api/src/composition/container.ts` with module-scope DDB singletons and one factory function per use case (9 factories: `makeCreateWallet`, `makeListWallets`, `makeGetWallet`, `makeAddTransaction`, `makeListTransactionsByWallet`, `makeListTransactionsByCategory`, `makeListCategories`, `makeCreateCustomCategory`, `makeDeleteCustomCategory`); create `packages/api/src/index.ts` as a minimal barrel (optional, for future tooling)
  - Slice: 8
  - Files: `packages/api/src/composition/container.ts`, `packages/api/src/index.ts`
  - Deps: T-07-05, T-07-06, T-07-07, T-07-08, T-03-05, T-03-06, T-04-05, T-04-06, T-05-04
  - Acceptance: Scaffolding only; tsc green; eslint clean. Confirm container.ts is the ONLY file that imports DynamoDB adapters — domain use cases only see ports.
  - Est: M

---

## Slice 9 — Lambda handlers (SPIKE gate included)

- [ ] **T-09-01** — **[SPIKE GATE]** Create `packages/api/src/handlers/wallet/createWallet.ts`: wire `withErrorHandler → withAuth → withValidation({ body: CreateWalletRequestSchema }) → handler`; extract `userId` + `body`; call `makeCreateWallet().execute()`; serialize response using `centsToDecimalString` for balance; return `created(toWalletResponse(wallet))`; add the `createWallet` function entry to `packages/infra-sls/serverless.yml` (basic skeleton — full Serverless config is Slice 12, but ONE function must exist for the spike); start `pnpm ddb:up` + `sls offline start`; smoke-test with `curl -X POST http://localhost:3000/wallets -H "X-Mock-User-Id: 11111111-1111-1111-1111-111111111111" -H "Content-Type: application/json" -d '{"name":"Cash","currency":"USD"}'`; expected: 201 + JSON body with `walletId`, `balance: "0.00"`. **ON GREEN: proceed to T-09-02. ON FAIL: investigate esbuild ESM issue — if needed, add `format: cjs` as fallback for all functions and document as a follow-up task.**
  - Slice: 9
  - Files: `packages/api/src/handlers/wallet/createWallet.ts`, `packages/infra-sls/serverless.yml` (partial skeleton)
  - Deps: T-08-05, T-08-01, T-08-02, T-08-03, T-08-04
  - Acceptance: REQ-WAL-01, REQ-MNY-04, NFR-ESM-01, NFR-DEV-01; manual curl → 201 with correct JSON shape; tsc green.
  - Est: L

- [ ] **T-09-02** — Create `packages/api/src/handlers/wallet/listWallets.ts`: validate `ListWalletsQuerySchema` (limit, cursor); call `makeListWallets().execute()`; serialize each wallet; return paginated response; create `packages/api/src/handlers/wallet/getWallet.ts`: validate path `{ walletId: zUuid }`; call `makeGetWallet().execute()`; serialize balance with `centsToDecimalString`; return 200 or `mapDomainError()`
  - Slice: 9
  - Files: `packages/api/src/handlers/wallet/listWallets.ts`, `packages/api/src/handlers/wallet/getWallet.ts`
  - Deps: T-09-01
  - Acceptance: REQ-WAL-04, REQ-WAL-05, REQ-WAL-08, REQ-MNY-06, REQ-DEL-02, REQ-DEL-03, REQ-VAL-02; tsc green; eslint clean; manual curl smoke-test both endpoints.
  - Est: M

- [ ] **T-09-03** — Create `packages/api/src/handlers/transaction/addTransaction.ts`: validate path `{ walletId: zUuid }` + body `AddTransactionRequestSchema`; extract optional `Idempotency-Key` header; convert `amount` string to cents via `decimalStringToCents` using wallet currency (loaded in use case); call `makeAddTransaction().execute()`; return 201 or 200 (replay) or `mapDomainError()`; NOTE: idempotency replay branch returns 200 vs 201 — wire this after Slice 10 extends AddTransaction; for now, always return 201; create `packages/api/src/handlers/transaction/listTransactionsByWallet.ts`: validate path + `ListTransactionsByWalletQuerySchema`; call use case; serialize amounts; return paginated response
  - Slice: 9
  - Files: `packages/api/src/handlers/transaction/addTransaction.ts`, `packages/api/src/handlers/transaction/listTransactionsByWallet.ts`
  - Deps: T-09-01, T-06-01
  - Acceptance: REQ-TXN-01, REQ-TXN-02, REQ-TXN-03, REQ-TXN-06, REQ-MNY-03, REQ-MNY-04, REQ-VAL-01, REQ-VAL-02; tsc green; eslint clean; manual curl smoke-test.
  - Est: M

- [ ] **T-09-04** — Create `packages/api/src/handlers/transaction/listTransactionsByCategory.ts`: validate `ListTransactionsByCategoryQuerySchema` (categoryId required, from/to/limit/cursor optional); call use case; serialize; return paginated response; create `packages/api/src/handlers/category/listCategories.ts`: no input validation needed (authenticated user only); call `makeListCategories().execute()`; return `{ predefined: [...], custom: [...] }` with `createdAt` on custom items; create `packages/api/src/handlers/category/createCustomCategory.ts`: validate body `CreateCustomCategoryRequestSchema`; call use case; return 201; create `packages/api/src/handlers/category/deleteCustomCategory.ts`: validate path `{ categoryId: zUuid }` (non-UUID returns 400, satisfying REQ-CAT-04); call `makeDeleteCustomCategory().execute()`; return 204 or `mapDomainError()`
  - Slice: 9
  - Files: `packages/api/src/handlers/transaction/listTransactionsByCategory.ts`, `packages/api/src/handlers/category/listCategories.ts`, `packages/api/src/handlers/category/createCustomCategory.ts`, `packages/api/src/handlers/category/deleteCustomCategory.ts`
  - Deps: T-09-01
  - Acceptance: REQ-TXN-07, REQ-CAT-01, REQ-CAT-02, REQ-CAT-03, REQ-CAT-04, REQ-CAT-06, REQ-CAT-07, REQ-DEL-01, REQ-VAL-02; tsc green; eslint clean; manual curl smoke-test each endpoint.
  - Est: M

---

## Slice 10 — Idempotency in AddTransaction

- [ ] **T-10-01** — Extend `packages/domain/src/transaction/usecases/AddTransaction.ts`: add optional `idempotencyRecord?: { hash32: string; ttlEpochSeconds: number }` to the use-case input; when present, pass the `idempotencyRecord` payload to `TransactionRepository.add()` as the 3-op TransactWrite; define `IdempotencyConflict` as a typed adapter-level error class (NOT a DomainError — lives in `packages/api/src/adapters/dynamodb/`) and import it as a type in AddTransaction; when `add()` throws `IdempotencyConflict`, the use case calls `transactionRepo.findIdempotentTransactionId()` → then `transactionRepo.findById()` → returns `Result.ok({ transaction, replayed: true })`. Update the return type signature accordingly.
  - Slice: 10
  - Files: `packages/domain/src/transaction/usecases/AddTransaction.ts`, `packages/api/src/adapters/dynamodb/IdempotencyConflict.ts` (new error class)
  - Deps: T-04-05, T-07-07
  - Acceptance: REQ-IDEM-01, REQ-IDEM-02, REQ-IDEM-03; tsc green; eslint clean.
  - Est: M

- [ ] **T-10-02** — Extend `packages/api/src/adapters/dynamodb/DynamoDBTransactionRepository.ts`: implement the 3-op `TransactWriteItems` path in `add()` when `idempotencyRecord` is present — the third `Put` uses `ConditionExpression: "attribute_not_exists(PK)"`; on `TransactionCanceledException` with reason `ConditionalCheckFailed` at item index 2 → throw `IdempotencyConflict`; implement `findIdempotentTransactionId()` with `GetItemCommand` on `IDEMPOTENCY#{hash32}` SK, returning the stored `transactionId`; implement `findById()` with `GetItemCommand` on transaction PK/SK (need to reconstruct SK from stored attributes); TTL set to `Math.floor(Date.now() / 1000) + 86400`
  - Slice: 10
  - Files: `packages/api/src/adapters/dynamodb/DynamoDBTransactionRepository.ts`
  - Deps: T-10-01
  - Acceptance: REQ-IDEM-02, REQ-IDEM-04, REQ-IDEM-05, REQ-IDEM-06; tsc green; eslint clean.
  - Est: L

- [ ] **T-10-03** — Update `packages/api/src/handlers/transaction/addTransaction.ts`: extract `Idempotency-Key` header; compute hash via `computeIdempotencyHash(userId, walletId, key)`; pass `idempotencyRecord` to `makeAddTransaction().execute()`; return 200 when `result.value.replayed === true`, 201 otherwise; manual smoke-test: first call → 201; second call with same key within window → 200 with identical body
  - Slice: 10
  - Files: `packages/api/src/handlers/transaction/addTransaction.ts`
  - Deps: T-10-01, T-10-02, T-08-04
  - Acceptance: REQ-IDEM-01, REQ-IDEM-02, REQ-IDEM-03, REQ-IDEM-05; tsc green; manual smoke-test idempotent replay.
  - Est: M

---

## Slice 11 — CDK stack

- [ ] **T-11-01** — Create `packages/infra-cdk/src/constructs/SingleTable.ts` L3 construct wrapping `dynamodb.TableV2` (or `dynamodb.Table`): PK/SK string keys, GSI1 with `GSI1PK`/`GSI1SK`, `PAY_PER_REQUEST` billing, TTL attribute `ttl`, deletion protection enabled, PITR disabled (cost constraint, add code comment); create `packages/infra-cdk/src/constructs/UserPool.ts` L3 construct: Cognito UserPool (email sign-in, password policy, auto-verify email), UserPoolClient (`generateSecret: false`, `USER_PASSWORD_AUTH` + `USER_SRP_AUTH`), UserPoolDomain prefix `smart-wallet-prod`
  - Slice: 11
  - Files: `packages/infra-cdk/src/constructs/SingleTable.ts`, `packages/infra-cdk/src/constructs/UserPool.ts`
  - Deps: T-00-02
  - Acceptance: NFR-COST-01; `pnpm --filter @smart-wallet/infra-cdk synth` clean; tsc green; eslint clean.
  - Est: M

- [ ] **T-11-02** — Create `packages/infra-cdk/src/constructs/SsmParameters.ts` L3 construct: publishes all 8 SSM parameters listed in design §5 (`table-name`, `table-arn`, `gsi1-name`, `user-pool-id`, `user-pool-arn`, `user-pool-client-id`, `issuer-url`, `region`); create `packages/infra-cdk/src/stacks/SmartWalletStack.ts` assembling all three constructs; create `packages/infra-cdk/src/bin/smart-wallet.ts` CDK app entrypoint; run `cdk synth` and verify CloudFormation template is produced without errors
  - Slice: 11
  - Files: `packages/infra-cdk/src/constructs/SsmParameters.ts`, `packages/infra-cdk/src/stacks/SmartWalletStack.ts`, `packages/infra-cdk/src/bin/smart-wallet.ts`
  - Deps: T-11-01
  - Acceptance: NFR-COST-01, NFR-AUTH-01; `pnpm --filter @smart-wallet/infra-cdk synth` exits 0 and produces valid CloudFormation JSON; tsc green; eslint clean.
  - Est: M

---

## Slice 12 — Serverless config

- [ ] **T-12-01** — Complete `packages/infra-sls/serverless.yml`: provider block (nodejs22.x, arm64, us-east-1 from SSM, memorySize 256, timeout 10, logRetentionInDays 14, NODE_OPTIONS, TABLE_NAME, GSI1_NAME env vars from SSM); httpApi block with CORS and `cognitoJwt` JWT authorizer (issuerUrl + audience from SSM); plugins `serverless-esbuild` + `serverless-offline`; custom esbuild block (`bundle: true`, `minify: true`, `sourcemap: true`, `target: node22`, `platform: node`, `format: esm`, `banner` with createRequire shim, `external: ['@aws-sdk/*']`); serverless-offline block (httpPort 3000, noPrependStageInUrl, useChildProcesses); `package.individually: true`
  - Slice: 12
  - Files: `packages/infra-sls/serverless.yml`
  - Deps: T-09-01
  - Acceptance: Scaffolding only. `sls package --noDeploy` exits 0 locally. tsc green.
  - Est: M

- [ ] **T-12-02** — Add all 9 function entries to `packages/infra-sls/serverless.yml`: `createWallet`, `listWallets`, `getWallet`, `addTransaction`, `listTransactionsByWallet`, `listTransactionsByCategory`, `listCategories`, `createCustomCategory`, `deleteCustomCategory`; each with handler path, httpApi event (path + method + authorizer), `iamRoleStatements` (least privilege: `PutItem` for creates, `Query` for lists, `GetItem` for gets, `UpdateItem` for deletes/soft-deletes, `TransactWriteItems` + `GetItem` for addTransaction, `Query` on `TABLE_ARN/index/GSI1` for listByCategory)
  - Slice: 12
  - Files: `packages/infra-sls/serverless.yml`
  - Deps: T-12-01, T-09-04
  - Acceptance: REQ-AUTH-01, NFR-ESM-01; `sls package --noDeploy` exits 0; all 9 function entries present; IAM resources reference SSM ARNs; tsc green.
  - Est: M

- [ ] **T-12-03** — Create `packages/infra-sls/scripts/init-local-table.ts`: uses `@aws-sdk/client-dynamodb` to `CreateTable` with the same schema (PK/SK, GSI1, TTL on `ttl`) in DDB Local at `http://localhost:8000`; idempotent (catches `ResourceInUseException`); create `packages/infra-sls/.env.local.example` with `IS_OFFLINE=true`, `TABLE_NAME=smart-wallet-local`, `GSI1_NAME=GSI1`, `AWS_REGION=us-east-1`; add `init:local` script to `packages/infra-sls/package.json`
  - Slice: 12
  - Files: `packages/infra-sls/scripts/init-local-table.ts`, `packages/infra-sls/.env.local.example`, `packages/infra-sls/package.json`
  - Deps: T-12-01
  - Acceptance: NFR-DEV-01; `pnpm init:local` (with DDB Local running) creates the table without error; tsc green.
  - Est: M

---

## Slice 13 — Local dev verification

- [ ] **T-13-01** — Run full local dev stack: `pnpm ddb:up` → `pnpm init:local` → `sls offline start` (or `pnpm dev`). Exercise all 9 endpoints via Bruno collection or curl. Document smoke-test results. Fix any wiring bugs discovered (adapter method signatures, middleware composition order, `exactOptionalPropertyTypes` edge cases in mappers, ESM `.js` import extension issues).
  - Slice: 13
  - Files: Any files requiring bug fixes from smoke-testing (expected: mappers, container.ts, serverless.yml)
  - Deps: T-12-03, T-10-03, T-09-04
  - Acceptance: REQ-AUTH-05, NFR-DEV-01, NFR-CODE-01; all 9 endpoints return expected status codes as per spec §3 scenarios; `pnpm typecheck && pnpm lint` exits 0 across all packages.
  - Est: L

- [ ] **T-13-02** — Create `packages/infra-sls/bruno/` Bruno collection with 9 request files (one per endpoint) pre-filled with example request bodies using USD and PEN currencies, predefined category IDs (`income:salary`, `expense:food`), and `X-Mock-User-Id` header; create `packages/infra-sls/LOCAL_DEV.md` documenting local dev startup sequence, mock user header, example curl commands for each endpoint
  - Slice: 13
  - Files: `packages/infra-sls/bruno/*.bru` (9 files), `packages/infra-sls/LOCAL_DEV.md`
  - Deps: T-13-01
  - Acceptance: Scaffolding only. Bruno collection opens cleanly. LOCAL_DEV.md contains startup commands and at minimum one curl example per endpoint.
  - Est: M

---

## Slice 14 — First cloud deploy

- [ ] **T-14-01** — Deploy CDK stack: `pnpm --filter @smart-wallet/infra-cdk deploy`; verify SSM parameters are populated via `aws ssm get-parameters-by-path --path /smart-wallet/prod/ --recursive`; confirm DynamoDB table and Cognito User Pool are created in us-east-1; add code comment in `SmartWalletStack.ts` confirming PITR is disabled by design (MVP cost constraint)
  - Slice: 14
  - Files: (no source files changed; infrastructure resources created in AWS)
  - Deps: T-11-02
  - Acceptance: NFR-COST-01, NFR-AUTH-01; `cdk deploy` exits 0; all 8 SSM parameters present in AWS SSM; DynamoDB table and Cognito resources visible in AWS Console.
  - Est: M

- [ ] **T-14-02** — Deploy Serverless stack: `pnpm --filter @smart-wallet/infra-sls deploy`; verify API Gateway HTTP API is created with JWT Authorizer; verify all 9 Lambda functions are deployed; capture the API base URL from deployment output; add `deploy:all` root-level script to `package.json` that runs `infra-cdk deploy` then `infra-sls deploy` in order
  - Slice: 14
  - Files: `package.json` (root — add `deploy:all` script)
  - Deps: T-14-01, T-12-02
  - Acceptance: NFR-AUTH-01, NFR-ESM-01; `sls deploy` exits 0; API URL is accessible; 401 returned on any unauthenticated request.
  - Est: M

- [ ] **T-14-03** — Create a Cognito user via CLI for smoke-testing: `aws cognito-idp admin-create-user ...`; obtain a JWT token via `aws cognito-idp initiate-auth`; run smoke-test curl against the deployed API URL hitting at minimum `POST /wallets`, `GET /wallets`, `POST /wallets/{id}/transactions`, `GET /wallets/{id}` with real JWT; document any bugs as follow-up tasks
  - Slice: 14
  - Files: (no source files — manual verification + bug log)
  - Deps: T-14-02
  - Acceptance: REQ-AUTH-01, REQ-WAL-01, REQ-WAL-04, REQ-WAL-05, REQ-TXN-01, REQ-TXN-03; deployed API returns 201 on `POST /wallets`, 200 on `GET /wallets/{id}` with real JWT. Any failures documented as follow-up issues.
  - Est: M

---

## Spec → Task coverage map

| REQ ID | Tasks covering it |
|---|---|
| REQ-WAL-01 | T-03-03, T-03-05, T-09-01 |
| REQ-WAL-02 | T-03-03 (no uniqueness constraint) |
| REQ-WAL-03 | T-03-03 (immutable currency — no setter) |
| REQ-WAL-04 | T-03-06, T-07-05, T-09-02 |
| REQ-WAL-05 | T-03-05, T-07-05, T-09-02 |
| REQ-WAL-06 | T-04-03, T-07-07, T-09-02 |
| REQ-WAL-07 | T-03-03 (no delete/patch — structural) |
| REQ-WAL-08 | T-01-04, T-03-06, T-07-05, T-09-02 |
| REQ-TXN-01 | T-04-03, T-09-03 |
| REQ-TXN-02 | T-04-01, T-04-03, T-07-07 |
| REQ-TXN-03 | T-04-04, T-07-07, T-09-03 |
| REQ-TXN-04 | T-04-03, T-09-03 |
| REQ-TXN-05 | T-04-03, T-09-03 |
| REQ-TXN-06 | T-04-06, T-07-07, T-09-03 |
| REQ-TXN-07 | T-04-06, T-07-07, T-09-04 |
| REQ-TXN-08 | T-04-05, T-07-07, T-09-03 |
| REQ-TXN-09 | T-04-03 (structural — no delete/patch) |
| REQ-TXN-10 | T-04-03, T-07-04 (SK embeds occurredAtISO) |
| REQ-CAT-01 | T-05-04, T-09-04 |
| REQ-CAT-02 | T-05-02, T-05-04, T-09-04 |
| REQ-CAT-03 | T-05-04, T-07-06, T-09-04 |
| REQ-CAT-04 | T-05-01, T-09-04 (zUuid on path param rejects type:slug) |
| REQ-CAT-05 | T-05-05, T-07-06 |
| REQ-CAT-06 | T-01-02, T-05-04 |
| REQ-CAT-07 | T-01-02 |
| REQ-AUTH-01 | T-12-01, T-12-02, T-14-02 |
| REQ-AUTH-02 | T-08-02 |
| REQ-AUTH-03 | T-07-05, T-07-06, T-07-07 (PK scoping) |
| REQ-AUTH-04 | T-03-05, T-05-04, T-07-05, T-07-06 (null returns 404) |
| REQ-AUTH-05 | T-08-02 |
| REQ-IDEM-01 | T-10-01, T-10-03 |
| REQ-IDEM-02 | T-10-01, T-10-02 |
| REQ-IDEM-03 | T-10-01, T-10-02, T-10-03 |
| REQ-IDEM-04 | T-10-02 (TTL attribute set) |
| REQ-IDEM-05 | T-04-05, T-07-07 (2-op path without idempotency) |
| REQ-IDEM-06 | T-08-04 (SHA-256 hash function) |
| REQ-MNY-01 | T-04-01, T-06-01 |
| REQ-MNY-02 | T-06-01, T-09-02, T-09-03 |
| REQ-MNY-03 | T-04-01, T-06-01, T-06-02 |
| REQ-MNY-04 | T-06-01, T-09-01, T-09-02, T-09-03 |
| REQ-MNY-05 | T-04-01 (integer-only arithmetic — structural) |
| REQ-MNY-06 | T-06-01, T-09-02 |
| REQ-DEL-01 | T-07-06, T-09-04 |
| REQ-DEL-02 | T-07-05, T-07-06, T-07-07 (FilterExpression) |
| REQ-DEL-03 | T-03-05, T-07-05 (isDeleted() → 404) |
| REQ-DEL-04 | T-05-05, T-07-06 |
| REQ-DEL-05 | T-05-04 (structural — no restore use case) |
| REQ-VAL-01 | T-01-05, T-08-03 |
| REQ-VAL-02 | T-01-03, T-08-03, T-09-04 |
| REQ-VAL-03 | T-08-03 (withValidation handles query params) |
| REQ-VAL-04 | T-02-04 (domain zero runtime deps) |
| REQ-VAL-05 | T-05-05, T-09-03 |
| REQ-VAL-06 | T-03-03, T-01-05 |
| REQ-VAL-07 | T-05-02, T-01-05 |
| REQ-VAL-08 | T-04-03, T-01-05 |

---

## Slice → Task index

| Slice | Title | Tasks | LOC estimate |
|---|---|---|---|
| 0 | Install runtime deps | 3 | ~50 |
| 1 | Shared-types foundation | 6 | ~350 |
| 2 | Domain shared base | 4 | ~200 |
| 3 | Wallet aggregate | 6 | ~280 |
| 4 | Money + Transaction aggregate | 6 | ~450 |
| 5 | Category aggregate | 5 | ~300 |
| 6 | Zod transforms + boundary validation | 2 | ~150 |
| 7 | DynamoDB adapters + key builders | 8 | ~500 |
| 8 | API middleware + composition root | 5 | ~350 |
| 9 | Lambda handlers (+ SPIKE gate) | 4 | ~350 |
| 10 | Idempotency in AddTransaction | 3 | ~150 |
| 11 | CDK stack | 2 | ~200 |
| 12 | Serverless config | 3 | ~200 |
| 13 | Local dev verification | 2 | ~100 |
| 14 | First cloud deploy | 3 | ~50 |
| **Total** | | **62** | **~3,680** |

---

## Notes for sdd-apply

### Task splitting
Any task with `Est: L` must be mentally reviewed before starting. If complexity is discovered mid-task, split it and create a follow-up sub-task. The implementer does NOT need orchestrator approval to split an L task.

### Parallelism within a slice
Tasks WITHIN a slice may sometimes run in parallel for a solo dev (e.g., T-01-01 and T-01-02 are independent). Slices are strictly sequential — never start Slice N+1 until `pnpm typecheck && pnpm lint` passes for Slice N.

### Health check cadence
After EVERY slice completes: `pnpm typecheck && pnpm lint` across all packages MUST exit 0 before starting the next slice.

### The Slice 9 SPIKE gate is mandatory
T-09-01 is a go/no-go gate. If `sls offline` fails to invoke the handler after bundling, STOP at T-09-01. Diagnose the ESM issue, apply the `format: cjs` fallback if needed, and document it. Do NOT write the remaining 7 handlers until the first one is proven to work end-to-end.

### ESM import discipline
ALL relative imports inside `packages/api`, `packages/domain`, `packages/shared-types`, and `packages/infra-cdk` MUST carry explicit `.js` extensions in source `.ts` files. Example: `import { compose } from '../../middleware/compose.js'` even though the file is `compose.ts`. ESLint's `import/extensions` rule enforces this.

### `exactOptionalPropertyTypes` discipline
Never set optional props to `undefined` explicitly. Use conditional spreads: `...(item.deletedAt !== undefined ? { deletedAt: item.deletedAt } : {})`. Applies to every mapper and entity constructor call.

### Currency examples
All test data, Bruno collection requests, and curl examples in LOCAL_DEV.md must use only `USD` or `PEN`. No EUR, GBP, JPY, or other currencies appear anywhere in the implementation.

### Domain zero-dep invariant
`packages/domain/package.json` must never list `zod`, `@aws-sdk/*`, or any other runtime library in `dependencies`. Cross-package imports from `shared-types` must be type-only (`import type { Currency }`). `sdd-verify` will check this.

### Idempotency SK format
The `IdempotencyRecord` DDB SK is `IDEMPOTENCY#{hash32}` where `hash32 = SHA-256(userId + walletId + idempotencyKey).hex.slice(0, 32)`. This is the format from REQ-IDEM-06. The `keyForIdempotency` builder in `keyBuilders.ts` takes `hash32` already computed — computation happens in the handler before calling the use case.
