# Proposal: wallet-mvp

## 1. Intent

Smart Wallet's first real change. The MVP delivers a working personal expense + budget tracking backend on AWS: users can create one or more wallets, record income/expense transactions with categories, and see an accurate balance — all behind a Cognito-authenticated HTTP API, persisted in a single DynamoDB table, deployable to `us-east-1` under the free-tier + $5/mo budget alarm.

The change exists because the repo is a blank slate (all `packages/*/src/index.ts` are `export {}` placeholders): there is no domain code, no API, no infrastructure stack, no Zod schemas. We need a foundational change that simultaneously (a) proves the architectural plumbing (Clean Arch + DDD + Hexagonal + SOLID, Result pattern, Zod-at-boundary, SSM-coordinated CDK ↔ Serverless, HTTP API JWT Authorizer), and (b) ships a usable backend the future web client can call. Success = the seven HTTP endpoints below respond correctly against DynamoDB Local during development AND against real AWS resources after the first deploy, with handlers verifying ownership on every call and balance maintained atomically via `TransactWriteItems`.

## 2. In Scope

- DDD domain model: `Wallet` aggregate, `Transaction` aggregate, `Category` entity, value objects (`WalletId`, `TransactionId`, `CategoryId`, `UserId`, `Money`), base classes (`Entity`, `AggregateRoot`, `ValueObject`), `Result<T, E>` discriminated union + helpers, `DomainError` hierarchy.
- Ports (interfaces in `domain/src/*/Repository.ts`): `WalletRepository`, `TransactionRepository`, `CategoryRepository`.
- Use cases (in `domain/src/wallet/usecases/`, `domain/src/transaction/usecases/`, `domain/src/category/usecases/`): `CreateWallet`, `ListWallets`, `GetWallet`, `AddTransaction`, `ListTransactionsByWallet`, `ListTransactionsByCategory`, `ListCategories`, `CreateCustomCategory`, `DeleteCustomCategory`.
- DynamoDB adapters (`packages/api/src/adapters/dynamodb/`): `DynamoDBWalletRepository`, `DynamoDBTransactionRepository`, `DynamoDBCategoryRepository`, shared `DynamoDBClient`. `TransactWriteItems` for atomic write+balance update.
- Lambda handlers (`packages/api/src/handlers/`) for the 8 endpoints listed in §5, with `withAuth` and `withValidation` middleware, composition root (`composition/container.ts`), and error mapper (`shared/errors.ts`).
- Zod schemas in `packages/shared-types/src/schemas/` for every request/response shape, exporting both schema and inferred DTO type. Predefined categories enum lives here.
- CDK stack (`packages/infra-cdk/`): one DynamoDB table (PK/SK + GSI1), one Cognito User Pool + App Client, SSM parameters for table name, table ARN, user pool ID, user pool client ID, issuer URL.
- Serverless Framework config (`packages/infra-sls/serverless.yml`): HTTP API with JWT Authorizer pointing at Cognito (via SSM), `serverless-esbuild` plugin with `format: esm` and Node 22 ARM64, `serverless-offline` for local dev, IAM least-privilege per handler.
- Local dev path: DynamoDB Local (already in `docker-compose.yml`) + serverless-offline + a local JWT verifier mock keyed by `IS_OFFLINE=true`.
- Idempotency support on `POST /wallets/{walletId}/transactions` via `Idempotency-Key` header.
- Soft-delete attribute (`deletedAt`) on `Wallet` and `Transaction` items (filtered out of default queries).

## 3. Out of Scope

- **Tests** — no unit/integration/e2e tests in this change. Test runners are not installed; `sdd-init` recorded `strict_tdd: false`. Architecture MUST stay testable (ports + composition root) so a future change can add Vitest/Jest without refactor.
- **Web frontend** — `packages/web` stays a placeholder. UI is deferred to a follow-up change.
- **Delete wallet / delete transaction endpoints** — no DELETE for wallets or transactions in MVP. Only custom categories are deletable.
- **Update wallet / update transaction** — no PATCH/PUT for wallets or transactions in MVP. Mistakes require deleting (future) and re-creating.
- **Multi-currency conversion** — `Money` VO carries `currency`, but each wallet is locked to one currency at creation; no FX, no per-transaction currency override.
- **Budgets / recurring transactions / attachments / tags / split transactions** — deferred. Domain is designed to add these without breaking changes.
- **Multi-environment (dev/staging)** — single `prod` environment only.
- **Custom Lambda Authorizer / RBAC / groups** — JWT authorizer + handler-level ownership check is the entire authorization story.
- **A second GSI** — only `GSI1` is created. Future access patterns may require adding `GSI2`; documented as a known limitation.
- **Outbox / domain event publication to SNS/EventBridge** — `AggregateRoot` base class will support domain events in-memory (for future use cases like "emit `TransactionAdded`"), but no infrastructure-level outbox is wired in MVP.
- **CI/CD via GitHub Actions OIDC** — covered by a separate change (task #5). Deploys are manual (`pnpm --filter infra-cdk deploy && pnpm --filter infra-sls deploy`) until then.

## 4. Architectural Decisions

### 4.1 DDD Aggregates

**Locked**: `Wallet` and `Transaction` are SEPARATE aggregates, linked by the `WalletId` value object. A third small aggregate, `Category`, exists only for user-created custom categories.

Rationale: DynamoDB item size limit is 400 KB. Embedding `Transaction[]` inside `Wallet` (Option A in exploration) breaks at ~500 transactions and forces an anti-pattern. Putting everything under `User` (Option C) is catastrophic. Separate aggregates is the only design that scales to millions of transactions and matches financial domain modeling (transactions are first-class citizens).

Cross-aggregate consistency for `addTransaction` is achieved with `TransactWriteItems`: one `Put` for the `Transaction` item AND one `Update` to the `Wallet` balance counter, atomic at the DDB level. Cost: 2× WCU per addTransaction — negligible at MVP scale.

**Invariants**:
- A `Transaction` belongs to exactly one `Wallet` (by `WalletId`). The repository never persists a `Transaction` whose `walletId` doesn't reference an existing, non-deleted `Wallet` owned by the same `userId`.
- A `Wallet`'s `balance` is a denormalized counter, always updated atomically with the transaction that changed it. It is signed: positive transactions increase it, negative transactions decrease it.
- A `Wallet`'s `currency` is immutable after creation. All transactions on that wallet MUST share its currency (enforced in `Transaction.create()` by passing the wallet's currency into the factory).
- `Transaction.amount` is strictly positive at the `Money` VO level; sign is derived from `Transaction.type` (`income` → +, `expense` → −). This avoids ambiguity.
- A `Wallet` MUST have a non-empty trimmed `name` (max 64 chars).
- A `Transaction` MUST have a non-empty trimmed `description` is allowed but `description` is optional (max 256 chars when present), `categoryId` is required, `occurredAt` is required.
- A `Category` (custom only) MUST have a non-empty trimmed `name` (max 32 chars) and a type (`income` or `expense`) matching the transactions that can reference it.
- Soft-deleted items (`deletedAt != null`) are invisible to default queries but still occupy keyspace. They MUST NOT be referenced by new transactions.

### 4.2 DDB Schema (single-table)

**Table name (SSM)**: `/smart-wallet/prod/dynamo/table-name` (e.g., `smart-wallet-prod`).

**Base table keys**: `PK` (string), `SK` (string).

| Entity | PK | SK | Notes |
|--------|----|----|-------|
| Wallet | `USER#{userId}` | `WALLET#{walletId}` | One item per wallet |
| Transaction | `USER#{userId}` | `TXN#{walletId}#{occurredAtISO}#{transactionId}` | One item per transaction |
| Category (custom) | `USER#{userId}` | `CATEGORY#{categoryId}` | Only user-created; predefined live in code |
| IdempotencyRecord | `USER#{userId}` | `IDEMPOTENCY#{idempotencyKey}` | Holds the resulting `transactionId` for replay; TTL attribute |

**Wallet item attributes**: `PK`, `SK`, `entityType: "Wallet"`, `walletId`, `userId`, `name`, `currency` (`"USD" | "PEN"`), `balance` (integer cents), `createdAt`, `updatedAt`, `deletedAt?`.

**Transaction item attributes**: `PK`, `SK`, `entityType: "Transaction"`, `transactionId`, `walletId`, `userId`, `type` (`"income" | "expense"`), `amount` (integer cents, always positive — the sign is implicit in `type`), `currency` (snapshot from wallet at creation), `categoryId` (string — `"income:salary"` form for predefined, UUID for custom), `description?`, `occurredAt` (ISO8601), `createdAt`, `updatedAt`, `deletedAt?`, `GSI1PK`, `GSI1SK`.

**Category (custom) item attributes**: `PK`, `SK`, `entityType: "Category"`, `categoryId` (UUID), `userId`, `name`, `type` (`"income" | "expense"`), `createdAt`, `updatedAt`, `deletedAt?`.

**IdempotencyRecord item attributes**: `PK`, `SK`, `entityType: "IdempotencyRecord"`, `transactionId` (the result that was committed), `createdAt`, `ttl` (epoch seconds, 24h from creation).

**GSI1** (sparse — only on `Transaction` items):

| Attribute | Value |
|-----------|-------|
| `GSI1PK` | `USER#{userId}` |
| `GSI1SK` | `CAT#{categoryId}#{occurredAtISO}#{transactionId}` |

Projection: **ALL** (list views need `amount`, `description`, `walletId`, `type`).

`Wallet`, `Category`, `IdempotencyRecord` items DO NOT set `GSI1PK`/`GSI1SK` (sparse index — they don't appear in GSI1 queries).

**Sparse indexing strategy**: Soft-deleted items (`deletedAt != null`) keep their base-table keys but are filtered out at query time via `FilterExpression: "attribute_not_exists(deletedAt)"`. We deliberately do NOT remove them from GSI1 on soft-delete in MVP (acceptable trade-off — by-category listings filter on `deletedAt` server-side; future change can flip this if scan reads become expensive).

**TTL**: Configured on attribute `ttl`. Only `IdempotencyRecord` items populate it.

**Billing mode**: `PAY_PER_REQUEST` (on-demand). Free tier covers the expected MVP traffic comfortably and removes the need to tune RCU/WCU.

### 4.3 Domain folder structure

**Resolution of Q1**: Use-cases live **nested per aggregate** (`domain/src/wallet/usecases/`, etc.), NOT in a top-level `domain/src/usecases/`. Justification:

- Screaming architecture is stronger when the aggregate folder fully owns its capabilities. Opening `domain/src/wallet/` should reveal everything Wallet can do.
- Adding a future aggregate (Budget, Project) is purely additive: drop a `domain/src/budget/` folder with its own `usecases/` subfolder. No edits to a shared top-level `usecases/`.
- Use cases naturally depend only on their own aggregate's repository port plus shared `Result`/`DomainError`. They have no reason to sit next to use cases of unrelated aggregates.
- Composition root imports are still ergonomic: `import { CreateWallet } from '@smart-wallet/domain/wallet/usecases/CreateWallet'` (via barrel `index.ts`).

The only counter-argument from the exploration was "top-level `usecases/` is slightly cleaner for the composition root to import" — we reject this because barrel re-exports from `domain/src/index.ts` make import paths identical regardless of physical layout, and screaming wins.

**Final tree** (`packages/domain/src/`):

```
domain/src/
  wallet/
    Wallet.ts
    WalletId.ts
    WalletRepository.ts
    events/
      WalletCreated.ts
    usecases/
      CreateWallet.ts
      ListWallets.ts
      GetWallet.ts
  transaction/
    Transaction.ts
    TransactionId.ts
    Money.ts
    TransactionRepository.ts
    events/
      TransactionAdded.ts
    usecases/
      AddTransaction.ts
      ListTransactionsByWallet.ts
      ListTransactionsByCategory.ts
  category/
    Category.ts
    CategoryId.ts
    CategoryType.ts        # "income" | "expense"
    CategoryRepository.ts
    usecases/
      ListCategories.ts
      CreateCustomCategory.ts
      DeleteCustomCategory.ts
  user/
    UserId.ts
  shared/
    Result.ts
    DomainError.ts
    Entity.ts
    AggregateRoot.ts
    ValueObject.ts
    Clock.ts               # port (interface) for "now"
    IdGenerator.ts         # port (interface) for UUID generation
  index.ts                 # barrel — exports only public API
```

`Money` lives under `transaction/` because that is its primary use site. If a future aggregate (Budget) needs it, we promote it to `shared/` then — no refactor cost.

`Clock` and `IdGenerator` are ports so use cases stay deterministic and testable. Adapters live in `packages/api/src/adapters/system/`.

### 4.4 Categories

**Resolution of Q2**:

- **Predefined categories are enum values, NOT first-class domain entities.** A `Category` VO/entity is materialised only when the user creates a custom one. Predefined categories are referenced by stable string IDs of the form `"income:{name}"` or `"expense:{name}"` (e.g., `"income:salary"`, `"expense:food"`).
- **Predefined catalog** lives in `packages/shared-types/src/categories.ts` (single source of truth for both frontend and backend Zod validation). MVP set:
  - Income: `income:salary`, `income:freelance`, `income:investment`, `income:gift`, `income:other`
  - Expense: `expense:food`, `expense:transport`, `expense:rent`, `expense:utilities`, `expense:entertainment`, `expense:health`, `expense:education`, `expense:shopping`, `expense:other`
- **Users CANNOT disable or delete predefined categories.** They can only add their own custom ones. UX: client renders both lists; users pick freely.
- **Custom categories** are stored as DDB items (`SK=CATEGORY#{categoryId}`) with `categoryId = UUID v4`. The `"system:"` prefix is reserved and validated against — custom names can never collide with predefined IDs because predefined IDs follow `"{type}:{slug}"` while custom IDs follow UUID format.
- **`GET /categories`** returns the merged list: `{ predefined: [...], custom: [...] }`. The handler statically returns the predefined list from `shared-types` and dynamically queries DDB for custom ones.
- **Validation**: `categoryId` on a transaction MUST be either (a) one of the predefined IDs OR (b) a UUID that corresponds to a non-deleted custom category owned by the same user with matching `type`. Enforced in `AddTransaction` use case.

Rationale: Predefined-as-entities is over-engineering. Most personal-finance apps treat them as a fixed enum. Custom-as-entities is necessary because users invent them at runtime. The two ID schemas (`"type:slug"` vs UUID) are unambiguous and avoid namespace collisions without needing a global registry.

### 4.5 Money representation

**Resolution of Q3**:

- **`Money` value object**: `{ amount: number, currency: Currency }` where `amount` is **integer cents** (e.g., 12.34 USD → `1234`) and `Currency` is a union literal `"USD" | "PEN"` (locked to MVP scope; extensible in a future change without schema migration).
- **No floating-point arithmetic ever.** All operations (`add`, `subtract`, `negate`) operate on the integer cents field. JSON serialization at the API boundary converts to/from decimal strings (e.g., `"12.34"`) via the Zod schema's transform — internally we never see a float.
- **Single currency per wallet, locked at creation.** The `Wallet`'s `currency` is immutable. `Transaction.create()` requires the wallet's currency as input and rejects any `Money` whose currency doesn't match. The system tolerates multiple wallets with different currencies for the same user, but no cross-currency transfers in MVP.
- **Decimal precision**: Both supported currencies (USD, PEN) use 2 decimal places. The Zod boundary transform converts decimal strings ↔ integer cents using a fixed scale of 100. A `currencyDecimals: Record<Currency, number>` table is still introduced for forward-compatibility with currencies of other precisions added later (e.g., JPY at 0 decimals).

Rationale: Integer cents is the industry-standard, mathematically correct choice for money. Decimal strings would require importing a decimal library (e.g., `decimal.js`) — extra dep, extra footprint, no benefit for two-decimal currencies. Numbers with rounding is the bug factory we explicitly avoid. Single-currency-per-wallet keeps the MVP simple while leaving multi-currency conversion as a clean future addition.

### 4.6 Transaction date semantics

**Resolution of Q4**: Two distinct ISO8601 timestamps on every `Transaction`:

- `occurredAt` — when the user says the transaction happened. User-provided, can be backdated, can be future-dated. Used in the DDB SK (`TXN#{walletId}#{occurredAtISO}#{transactionId}`) so lexicographic sort matches chronological sort. Used in GSI1SK for the same reason.
- `createdAt` — when the system recorded the transaction. Server-side (`Clock.now()`), immutable after creation. Audit field.

Rationale: Users WILL backdate transactions (forgot to log lunch yesterday). If the SK used `createdAt`, the natural query "give me May transactions" would miss anything entered late. Using `occurredAt` means the SK reflects the real-world order, which is what the user expects. Audit needs are preserved via the separate `createdAt` attribute.

`updatedAt` is also stored for both wallets and transactions to support future change-tracking, though no UPDATE endpoints exist in MVP.

Validation: `occurredAt` MUST be within `[now - 5 years, now + 1 day]`. Future-dating beyond tomorrow is rejected (prevents typo'd 9999 years); 5-year backstop limits historical noise.

### 4.7 Idempotency

**Resolution of Q5**: `POST /wallets/{walletId}/transactions` SUPPORTS but does not require an `Idempotency-Key: <opaque-client-string>` header. Implementation:

1. Client generates a UUID v4 (or any opaque string ≤128 chars) per logical "add this transaction" attempt and re-sends the same key on retries.
2. The handler hashes the key with `userId` + `walletId` to produce a deterministic `IdempotencyRecord` SK: `IDEMPOTENCY#{sha256(userId + walletId + idempotencyKey).hex.slice(0, 32)}`.
3. Inside `AddTransaction` use case, the `TransactWriteItems` call is expanded to **three** operations atomically:
   - `Put` the `Transaction` item (new `transactionId` = `IdGenerator.uuid()`).
   - `Update` the `Wallet` balance.
   - `Put` the `IdempotencyRecord` item with `ConditionExpression: attribute_not_exists(PK)`.
4. If the `Put` on `IdempotencyRecord` fails the condition (record already exists), the entire `TransactWriteItems` rolls back. The handler then GETs the `IdempotencyRecord`, reads its `transactionId`, GETs the corresponding `Transaction` item, and returns it with HTTP 200 (NOT 201) — replay semantics.
5. If no `Idempotency-Key` header is sent, the handler skips steps 2–4 and performs the standard 2-item `TransactWriteItems`. Clients without idempotency support get at-least-once semantics (accept double-create risk).
6. TTL on `IdempotencyRecord`: 24 hours (`ttl` attribute, DDB native TTL). Keys outside this window have no replay protection — acceptable for personal-finance retry windows.

Rationale: Conditional-put on a deterministic key is the standard AWS pattern for at-most-once semantics. It costs 1 extra WCU per write that uses idempotency (3× total vs 2× without) — trivially affordable. The 24h TTL prevents the idempotency partition from growing without bound. Hashing the key with `userId` + `walletId` prevents cross-user collisions and bounds key length.

### 4.8 Wallet name uniqueness

**Resolution of Q6**: Wallet names are **NOT unique per user.** A user can have two wallets called "Cash" without error.

Rationale:
- Uniqueness enforcement would require either (a) an extra GSI keyed by `(userId, lowercase(name))` (cost: doubles write capacity, adds another sparse index), or (b) a conditional-put with a sentinel item (cost: extra item per wallet, more complex deletion). Neither is justified by the UX win.
- Real users sometimes intentionally have duplicates (e.g., "Cash - Home", "Cash - Office" — then they shorten both to "Cash"). Forcing uniqueness creates friction.
- The frontend can choose to warn ("you already have a wallet called Cash") without the backend enforcing it.

`walletId` is always unique (UUID v4 from `IdGenerator`) and is the only identifier the system relies on for retrieval. Display name is purely human-facing.

### 4.9 Soft-delete strategy

**Resolution of Q7**: Soft-delete for `Wallet`, `Transaction`, and custom `Category`. Hard delete is not exposed in MVP API (only custom-category `DELETE` is exposed, and even that is soft).

Implementation:
- Add optional `deletedAt: string` (ISO8601) attribute on every item.
- Default queries (`ListWallets`, `ListTransactionsByWallet`, `ListTransactionsByCategory`, `ListCategories`) include `FilterExpression: "attribute_not_exists(deletedAt)"`. Items remain on the table but are invisible.
- `GetWallet` / `GetTransaction` return 404 when `deletedAt` is set (same effect as not existing, from the API consumer's view).
- Adding a transaction to a soft-deleted wallet returns 404 (wallet doesn't appear to exist).
- A soft-deleted custom category cannot be assigned to new transactions but historical transactions still reference it (frozen `categoryId`).

Rationale:
- Future reporting features ("show me my spending history including deleted wallets") become trivial without a separate audit table.
- Accidental deletion is recoverable from the table directly during MVP (no UI for restore yet, but the data is there).
- Soft-delete costs one extra attribute per item — negligible storage impact.
- The DDB FilterExpression is applied AFTER the page is read, so heavy soft-deletion would eventually waste RCU. Acceptable for MVP scale; future change can compact via a periodic cleanup if needed.

No DELETE endpoint for `Wallet` or `Transaction` in MVP — `deletedAt` exists in the schema and is settable by the repository, but no use case toggles it yet. This locks the schema shape early so a future "delete wallet" change is purely additive (new use case, new handler, no migration).

### 4.10 Result pattern

**Locked**: Custom `Result<T, E>` discriminated union (zero deps).

```typescript
// domain/src/shared/Result.ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// helpers (same file)
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;
export const mapResult = <T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;
export const chainResult = <T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> =>
  r.ok ? f(r.value) : r;
```

All domain entity constructors return `Result<Entity, DomainError>`. All use cases return `Promise<Result<Output, DomainError>>`. Adapters either return `Result` or throw (handler middleware catches and maps unknown throws to `500`). Domain code NEVER throws domain errors — it always returns `Result`. Infrastructure exceptions (DDB throttling, network) ARE allowed to throw (treated as transient at the handler boundary).

### 4.11 Validation strategy

**Locked**: Zod at the API boundary; domain invariants in entity constructors via `Result`.

Three layers:

1. **API boundary** (`packages/api/src/middleware/withValidation.ts`): every Lambda handler that accepts a body or query string calls `Schema.safeParse(input)`. On failure, the handler returns HTTP 400 with `{ error: "validation_failed", details: ZodError.format() }` immediately — the use case is NEVER invoked. Path parameters are also validated (e.g., `walletId` must be a UUID).
2. **Use case input** (`packages/domain/src/*/usecases/*.ts`): the use case signature accepts the Zod-inferred DTO type directly (`type CreateWalletInput = z.infer<typeof CreateWalletSchema>`). No re-validation — TypeScript guarantees the shape. The use case constructs domain VOs/entities from the DTO.
3. **Domain entity constructor** (`packages/domain/src/wallet/Wallet.ts`, etc.): static `Wallet.create(input)` returns `Result<Wallet, WalletError>`. Enforces invariants like "name is non-empty and trimmed", "currency is in the allowed set", "balance starts at 0". These are NOT Zod calls — they're hand-written domain rules. The domain package has **zero** dependency on Zod (`packages/domain/package.json` does NOT list `zod`).

Boundary definitions:
- **`shared-types`** owns Zod schemas. Depends on `zod`. Used by `api` (parse incoming) and `web` (build forms, parse outgoing).
- **`domain`** owns invariants and types. Depends on nothing runtime (only types).
- **`api`** depends on both `shared-types` (parse) and `domain` (call use cases).

### 4.12 Auth

**Locked**: API Gateway HTTP API JWT Authorizer pointing at the Cognito User Pool issuer; handler-level ownership check on every request.

Authorizer config (in `serverless.yml`):
```yaml
httpApi:
  authorizers:
    cognitoJwt:
      type: jwt
      identitySource: $request.header.Authorization
      issuerUrl: ${ssm:/smart-wallet/prod/cognito/issuer-url}
      audience:
        - ${ssm:/smart-wallet/prod/cognito/user-pool-client-id}
```

Every protected route declares `authorizer: cognitoJwt`. API Gateway validates the JWT signature and expiration before routing to Lambda; failed validations get HTTP 401 without the handler being invoked.

**Ownership check pattern** (`packages/api/src/middleware/withAuth.ts`):
1. Extract `event.requestContext.authorizer.jwt.claims.sub` → `userId` (Cognito sub UUID).
2. Pass `userId` into the use case as the **first argument** on every call (e.g., `addTransaction.execute(userId, walletId, dto)`).
3. The use case's repository call ALWAYS scopes by `PK = USER#{userId}`. There is no DDB query in the system that doesn't include the user as the partition key — cross-user reads are structurally impossible.
4. For resources accessed by ID (e.g., `GET /wallets/{walletId}`), the repository's `getById(userId, walletId)` returns `null` if the wallet doesn't exist under that user's partition. The handler returns 404 (NOT 403) — we don't leak existence of resources owned by other users.

**Local dev**: `IS_OFFLINE=true` switches the auth middleware to a mock that reads `userId` from a header (`X-Mock-User-Id`) instead of decoding a real JWT. Serverless-offline ignores the JWT authorizer config in offline mode.

### 4.13 CDK + Serverless coordination

**Locked**: SSM Parameter Store. CDK writes parameters at deploy time; Serverless reads them at deploy time via `${ssm:...}`; Lambda reads them at runtime from environment variables (NOT from SSM at invocation time — SSM has 40 TPS limit).

**SSM parameter inventory** (all under `/smart-wallet/prod/`):

| Parameter | Producer | Consumer |
|-----------|----------|----------|
| `/smart-wallet/prod/dynamo/table-name` | CDK | Serverless env → Lambda |
| `/smart-wallet/prod/dynamo/table-arn` | CDK | Serverless IAM policy |
| `/smart-wallet/prod/dynamo/gsi1-name` | CDK | Serverless env → Lambda (default `GSI1`) |
| `/smart-wallet/prod/cognito/user-pool-id` | CDK | Serverless env → Lambda |
| `/smart-wallet/prod/cognito/user-pool-arn` | CDK | Serverless IAM policy (future) |
| `/smart-wallet/prod/cognito/user-pool-client-id` | CDK | Serverless JWT authorizer audience |
| `/smart-wallet/prod/cognito/issuer-url` | CDK | Serverless JWT authorizer issuerUrl |
| `/smart-wallet/prod/region` | CDK | Serverless env → Lambda (default `us-east-1`) |

**Deployment order** (manual until CI is up): `pnpm --filter @smart-wallet/infra-cdk deploy` → `pnpm --filter @smart-wallet/infra-sls deploy`.

## 5. API contract (REST, JSON over HTTPS)

All endpoints are under the API Gateway HTTP API base URL (e.g., `https://api.smart-wallet.example.com`). All responses are JSON. All authenticated endpoints require `Authorization: Bearer <Cognito ID token>`. Idempotency-Key is supported only where noted.

Common error responses (all endpoints): `400 validation_failed`, `401 unauthorized` (missing/bad JWT — handled by API Gateway), `403 forbidden` (reserved; not used in MVP since ownership mismatches return 404), `404 not_found`, `500 internal_error`.

Zod schema names are in `packages/shared-types/src/schemas/`.

### POST /wallets — createWallet
- Auth: JWT
- Request: `CreateWalletRequestSchema` → `{ name: string (1..64), currency: Currency }`
- Response 201: `WalletResponseSchema` → `{ walletId, name, currency, balance: "0.00", createdAt, updatedAt }`
- Status codes: 201, 400, 401, 500

### GET /wallets — listWallets
- Auth: JWT
- Request: query `{ limit?: number (1..100, default 50), cursor?: string }`
- Response 200: `ListWalletsResponseSchema` → `{ items: Wallet[], nextCursor?: string }`
- Status codes: 200, 400, 401, 500

### GET /wallets/{walletId} — getWallet
- Auth: JWT
- Path: `walletId` (UUID)
- Response 200: `WalletResponseSchema` (includes current `balance` as decimal string)
- Status codes: 200, 400, 401, 404, 500

### POST /wallets/{walletId}/transactions — addTransaction
- Auth: JWT
- Path: `walletId` (UUID)
- Headers: `Idempotency-Key: <string ≤128 chars>` (OPTIONAL)
- Request: `AddTransactionRequestSchema` → `{ type: "income" | "expense", amount: string (decimal, e.g., "12.34"), categoryId: string, description?: string (≤256), occurredAt: ISO8601 }`
- Response 201 (new) or 200 (idempotent replay): `TransactionResponseSchema` → `{ transactionId, walletId, type, amount, currency, categoryId, description?, occurredAt, createdAt, updatedAt }`
- Status codes: 200, 201, 400, 401, 404 (wallet/category not found), 409 (currency mismatch or invalid category type), 500

### GET /wallets/{walletId}/transactions — listTransactionsByWallet
- Auth: JWT
- Path: `walletId` (UUID)
- Query: `{ from?: ISO8601, to?: ISO8601, type?: "income" | "expense", categoryId?: string, limit?: number (1..100, default 50), cursor?: string }`
- Response 200: `ListTransactionsResponseSchema` → `{ items: Transaction[], nextCursor?: string }`
- Note: `categoryId` filter on this endpoint is a `FilterExpression` (post-query); the GSI1 path is used by the next endpoint.
- Status codes: 200, 400, 401, 404, 500

### GET /transactions?categoryId={categoryId} — listTransactionsByCategory
- Auth: JWT
- Query: `{ categoryId: string (required), from?: ISO8601, to?: ISO8601, limit?: number, cursor?: string }`
- Uses GSI1.
- Response 200: `ListTransactionsResponseSchema`
- Status codes: 200, 400, 401, 500

### GET /categories — listCategories
- Auth: JWT
- Response 200: `ListCategoriesResponseSchema` → `{ predefined: PredefinedCategory[], custom: CustomCategory[] }`
- Status codes: 200, 401, 500

### POST /categories — createCustomCategory
- Auth: JWT
- Request: `CreateCustomCategoryRequestSchema` → `{ name: string (1..32), type: "income" | "expense" }`
- Response 201: `CategoryResponseSchema` → `{ categoryId (UUID), name, type, createdAt }`
- Status codes: 201, 400, 401, 500

### DELETE /categories/{categoryId} — deleteCustomCategory
- Auth: JWT
- Path: `categoryId` (UUID — predefined IDs of form `type:slug` are rejected at validation as 400)
- Response 204
- Status codes: 204, 400, 401, 404, 500

Out of scope (deliberately not provided): `DELETE /wallets/{walletId}`, `DELETE /wallets/{walletId}/transactions/{transactionId}`, `PATCH /wallets/{walletId}`, `PATCH /wallets/{walletId}/transactions/{transactionId}`, `GET /wallets/{walletId}/transactions/{transactionId}` (the single-transaction GET can be added trivially later if needed).

## 6. Constraints / Non-functional

- **Cost**: AWS Free Tier + monthly budget alarm at $5. PAY_PER_REQUEST DDB billing, on-demand Lambda, Cognito MAU well within free tier.
- **Performance**: p95 latency < 500 ms for all API calls measured from API Gateway (cold-start tolerated up to 1.5 s for the first call per concurrent execution; with Node 22 ARM64 + esbuild, cold start is typically 200–400 ms).
- **Lighthouse mobile ≥ 90** (system-level constraint; not exercised by this proposal since web is out of scope, but the API contract is mobile-friendly: pagination cursors, minimal response payloads, no over-fetching).
- **Region**: `us-east-1` only. No multi-region.
- **Single environment**: only `prod`. Local dev is the substitute for staging.
- **No tests**: `strict_tdd: false` per `sdd-init`. Architecture MUST remain testable — all I/O is behind ports. A future change can add Vitest unit tests in `packages/domain` and `packages/api` without refactor.
- **TypeScript strictness**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` — all enforced. Code MUST satisfy `tsc --noEmit` and `eslint` with the existing flat config.
- **ESM everywhere**: All packages are `"type": "module"`. Serverless bundling MUST output ESM (`format: esm` in `serverless-esbuild`).
- **Cold-start budget**: each Lambda handler imports only what it needs. DynamoDB client + DocumentClient are constructed once at module scope. No top-level `await` against AWS APIs.

## 7. Risks

1. **Serverless Framework + ESM bundling**: `serverless-esbuild` must be configured to output ESM with `format: esm`, `target: node22`, and `platform: node`. The `import.meta.url` shim and `__dirname` polyfill may be needed depending on dependencies. Mitigation: validate the bundling pipeline early in `sdd-apply`, before writing all handlers — do one handler end-to-end first.
2. **`verbatimModuleSyntax` + AWS SDK**: `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` are CJS-published with types. With `verbatimModuleSyntax`, the team MUST use `import type { ... }` for type-only imports and regular `import { ... }` for value imports. ESLint's `consistent-type-imports` rule catches most cases. Mitigation: lint runs on every commit (Husky).
3. **`TransactWriteItems` cost & throttling**: Each addTransaction costs 2× WCU (3× with idempotency). For 1000 transactions/month, this is 3000 WCU — well under free tier. Risk only emerges at scale not relevant to MVP.
4. **GSI1 projection cost**: ALL projection doubles the write cost for transactions (item written to base + replicated to GSI). With 1000 transactions/month this is trivial. Documented; no mitigation needed for MVP.
5. **Idempotency key TTL**: Without TTL, the `IDEMPOTENCY#` partition would grow unbounded. Mitigation: native DDB TTL on `ttl` attribute set to 24h; covered in §4.7.
6. **Single GSI constraint**: New access patterns (e.g., "list ALL of a user's transactions across wallets, paginated by date") would require either a second GSI or post-query filtering. Mitigation: explicitly OUT OF SCOPE; documented for future change.
7. **Soft-delete RCU waste**: `FilterExpression` is applied after the page is read. A user who soft-deletes thousands of items will eventually pay slightly higher RCU on default queries. MVP risk is negligible; future change can run a periodic cleanup job (out of scope).
8. **CDK + Serverless deploy order**: If Serverless deploys before CDK has populated SSM, the `${ssm:...}` lookups fail. Mitigation: scripted deploy order in package.json (`pnpm deploy:all`), explicit error message if SSM lookup misses.
9. **Cognito issuer URL format**: CDK's `UserPool.userPoolProviderUrl` returns the correct issuer URL for JWT authorizer. Verify the value written to SSM at first deploy matches what Serverless expects.
10. **Money precision at API boundary**: The string-decimal ↔ integer-cents conversion in Zod transforms is a common bug site. Mitigation: write the conversion helpers once in `shared-types/src/money.ts`, use them in every schema; `sdd-design` should produce a spec scenario covering decimal precision round-trip for USD and PEN (both 2-decimal).

## 8. Dependencies

- **Task #5 (CI/CD via GitHub Actions OIDC)** — orthogonal. Local dev does not require it. First deploy will be manual until #5 lands. Can run in parallel with this change.
- **Task #6 (CDK base infra)** — partially absorbed by this change. The CDK stack written here IS the base infra for the wallet domain. There is no separate "base infra" change; this change owns the DynamoDB table, Cognito User Pool, SSM parameters, and IAM groundwork. The S3 + CloudFront stack for the web app is deferred until a web-frontend change.
- **AWS account**: same account as Life Tracker MVP. `us-east-1`. CDK bootstrap already complete in that region (re-used). Budget alarm at $5/month already configured in the account; we add no new alarms.
- **Cognito**: User Pool is created by this change's CDK stack. No external IdP federation. Email-based sign-up + password.
- **DynamoDB Local**: docker-compose already in repo (`amazon/dynamodb-local:2.5.4` + `dynamodb-admin`). No new deps.
- **New runtime deps to install in `sdd-apply`** (not in this proposal): `zod` (shared-types), `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (api), `aws-jwt-verify` (api, for offline mode), `aws-cdk-lib` + `constructs` (infra-cdk), `serverless` + `serverless-esbuild` + `serverless-offline` (infra-sls), `uuid` (api or shared utility).
- **Linear project**: Smart Wallet MVP (id `3998fe2e-be82-4a4f-9b0e-c5f927f15160`). PR descriptions reference this project.

## 9. Acceptance criteria (high level)

`sdd-spec` will turn these into scenario-by-scenario specs; here are the ones the proposal commits to:

1. All eight endpoints in §5 respond with the documented status codes and Zod-validated payloads.
2. Every authenticated handler:
   - Rejects calls without a valid JWT (API Gateway returns 401 before the handler).
   - Reads `userId` from `event.requestContext.authorizer.jwt.claims.sub`.
   - Returns 404 (NOT 403) for resources owned by another user, since cross-user queries are structurally impossible.
3. `POST /wallets/{walletId}/transactions`:
   - Atomically writes the Transaction item AND updates the Wallet balance via `TransactWriteItems`.
   - When `Idempotency-Key` is present, replays return the original transaction with HTTP 200 (vs 201 for first write).
   - Rejects amounts ≤ 0 with HTTP 400.
   - Rejects currency mismatch (wallet vs transaction money) with HTTP 409.
   - Rejects unknown `categoryId` or type-mismatched category (`type=income` transaction against an `expense` category) with HTTP 409.
4. `GET /wallets/{walletId}`:
   - Returns the wallet WITH its current `balance` reflecting all non-deleted transactions, with no additional read cost (balance is denormalized).
5. Local dev path (`pnpm ddb:up` + `serverless-offline` + mock JWT) executes the full API surface end-to-end against DDB Local with zero cloud calls.
6. CDK stack deploys cleanly to a fresh account in `us-east-1`, populates all SSM parameters in §4.13, and Serverless deploys cleanly afterward.
7. Architecture is testable: every use case can be instantiated with in-memory port implementations (no `await` on real AWS). A future change can add Vitest tests in `packages/domain` and `packages/api` with zero refactor.
8. `tsc --noEmit` and `eslint` pass across all packages (`pnpm lint` + `pnpm typecheck` green).
9. The `sdd-init` decision `strict_tdd: false` is respected: no test files are added in this change. The architecture's testability is verified by code review, not by tests.
