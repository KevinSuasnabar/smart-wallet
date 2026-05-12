# Design: wallet-mvp

> Companion to `proposal.md`. The proposal locks the WHAT and high-level HOW; this document expands the HOW into concrete file paths, code-level contracts, data flow, and an implementation order suitable for `sdd-tasks`.
>
> Currency set for MVP: **`USD | PEN`** only. Any earlier draft mentioning `EUR / GBP / JPY` is superseded by the proposal file and this design.

---

## 1. Approach overview

Requests flow `Client → API Gateway HTTP API → JWT Authorizer → Lambda (per-route) → middleware chain → use case → repository port → DynamoDB`. Every Lambda is a thin transport-layer adapter; all business logic lives in `packages/domain`. Cross-aggregate consistency for `addTransaction` is achieved with a single `TransactWriteItems` call (2 items normally, 3 items when an `Idempotency-Key` is present). Reads use `Query` against the base table (by wallet) or against `GSI1` (by category). Ownership is enforced **structurally**: every DDB key starts with `USER#{userId}` and the `userId` is extracted server-side from the verified JWT claim — handlers never trust a client-supplied user id.

Each package has one job. `packages/shared-types` owns Zod schemas and inferred DTOs; it is the only place a `zod` import lives. `packages/domain` owns entities, value objects, repository ports, and use cases; it has **zero** runtime dependencies (not even `zod`). `packages/api` owns Lambda handlers, DynamoDB / Cognito / system adapters, middleware, and the composition root. `packages/infra-cdk` owns the DynamoDB table, Cognito User Pool, and SSM parameter publication. `packages/infra-sls` owns the Serverless Framework config that wires Lambdas behind the JWT authorizer and reads the SSM parameters CDK published.

Local dev runs the same code path with two swaps: (a) `IS_OFFLINE=true` flips `withAuth` to read `X-Mock-User-Id` instead of decoding a JWT, and (b) the DynamoDBClient points at `http://localhost:8000` (DynamoDB Local from docker-compose). `serverless-offline` reproduces API Gateway HTTP API event shapes locally. No real AWS calls are made during normal development — Bruno / curl drive the full surface from `pnpm dev` to `pnpm ddb:up`.

---

## 2. Package design

### 2.1 `packages/shared-types`

Owns Zod schemas at the API boundary. Public DTO types are inferred from those schemas (`z.infer<...>`). Frontend and backend import the same schemas.

**Files to create** (`packages/shared-types/src/`):

```
src/
  index.ts                         # barrel — exports schemas + DTO types + categories + currencies
  currencies.ts                    # Currency type + currencyDecimals table
  categories.ts                    # PredefinedCategoryId union + PREDEFINED_CATEGORIES const
  money.ts                         # decimalStringToCents / centsToDecimalString helpers + zMoneyAmount schema
  date.ts                          # zIso8601, zOccurredAt (range-validated)
  pagination.ts                    # zCursor, zLimit, zPaginatedResponse<T>
  schemas/
    wallet.ts                      # CreateWalletRequestSchema, WalletResponseSchema, ListWalletsResponseSchema
    transaction.ts                 # AddTransactionRequestSchema, TransactionResponseSchema, ListTransactionsResponseSchema, ListTransactionsByWalletQuerySchema, ListTransactionsByCategoryQuerySchema
    category.ts                    # CreateCustomCategoryRequestSchema, CategoryResponseSchema, ListCategoriesResponseSchema
    common.ts                      # zUuid, zUserId, zWalletId, zTransactionId, zCategoryId
```

**Public exports** (from `src/index.ts`):

- Every schema (`CreateWalletRequestSchema`, …)
- Every inferred DTO type (`type CreateWalletRequest = z.infer<typeof CreateWalletRequestSchema>`, …)
- `Currency` type, `CURRENCIES` const, `currencyDecimals` record
- `PREDEFINED_CATEGORIES` const, `PredefinedCategoryId` type
- `centsToDecimalString(cents: number, currency: Currency): string`
- `decimalStringToCents(value: string, currency: Currency): number` (throws if malformed — Zod wraps it)

**Currency definitions** (`src/currencies.ts`):

```ts
export const CURRENCIES = ['USD', 'PEN'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const currencyDecimals: Record<Currency, number> = {
  USD: 2,
  PEN: 2,
};

export const zCurrency = z.enum(CURRENCIES);
```

`currencyDecimals` is keyed by `Currency` (never indexed by an arbitrary string), so `noUncheckedIndexedAccess` is satisfied without optional chaining.

**Predefined categories** (`src/categories.ts`):

```ts
export const PREDEFINED_INCOME_IDS = [
  'income:salary', 'income:freelance', 'income:investment', 'income:gift', 'income:other',
] as const;
export const PREDEFINED_EXPENSE_IDS = [
  'expense:food', 'expense:transport', 'expense:rent', 'expense:utilities',
  'expense:entertainment', 'expense:health', 'expense:education', 'expense:shopping', 'expense:other',
] as const;
export const PREDEFINED_CATEGORY_IDS = [
  ...PREDEFINED_INCOME_IDS, ...PREDEFINED_EXPENSE_IDS,
] as const;
export type PredefinedCategoryId = (typeof PREDEFINED_CATEGORY_IDS)[number];

export const PREDEFINED_CATEGORIES: ReadonlyArray<{
  categoryId: PredefinedCategoryId;
  name: string;
  type: 'income' | 'expense';
}> = [
  { categoryId: 'income:salary',     name: 'Salary',        type: 'income' },
  // ... full list
];

export const isPredefinedCategoryId = (id: string): id is PredefinedCategoryId =>
  (PREDEFINED_CATEGORY_IDS as readonly string[]).includes(id);
```

**Money / decimal transforms** (`src/money.ts`): Zod schema that accepts a decimal string with up to N decimal places (N = `currencyDecimals[currency]`), strips trailing zeros, and `.transform()`s into integer cents. Because the transform needs the currency, the wallet schema or transaction schema composes its own object schema using `superRefine` to enforce the conversion in the context of `currency`. Concretely:

```ts
// money.ts
export const zDecimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Invalid decimal');

export function decimalStringToCents(value: string, currency: Currency): number {
  const scale = 10 ** currencyDecimals[currency];
  const [intPart = '0', fracPart = ''] = value.split('.');
  if (fracPart.length > currencyDecimals[currency]) {
    throw new Error(`Too many decimal places for ${currency}`);
  }
  const padded = fracPart.padEnd(currencyDecimals[currency], '0');
  const negative = intPart.startsWith('-');
  const intAbs = intPart.replace(/^-/, '');
  const cents = Number(intAbs) * scale + Number(padded || '0');
  return negative ? -cents : cents;
}

export function centsToDecimalString(cents: number, currency: Currency): string {
  const scale = 10 ** currencyDecimals[currency];
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / scale);
  const fracPart = (abs % scale).toString().padStart(currencyDecimals[currency], '0');
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}
```

`AddTransactionRequestSchema` carries `amount: string` (decimal). The handler converts to cents using the wallet's known currency before invoking the use case — NOT inside the schema, because the schema doesn't know the wallet yet.

**Type sharing with web**: `packages/web` will re-export inferred types directly (`import type { WalletResponse } from '@smart-wallet/shared-types'`). No duplicated types.

---

### 2.2 `packages/domain`

**Zero runtime deps.** Pure TypeScript. Compiled with `tsc --emitDeclarationOnly`-friendly settings (already configured).

**Files to create** (`packages/domain/src/`):

```
src/
  index.ts                          # barrel
  shared/
    Result.ts                       # Result<T, E> + ok/err/isOk/isErr/mapResult/chainResult
    DomainError.ts                  # base class + tag
    Entity.ts                       # generic Entity<TId>
    AggregateRoot.ts                # extends Entity, holds DomainEvent[]
    ValueObject.ts                  # generic ValueObject<TProps>
    Clock.ts                        # interface Clock { now(): Date }
    IdGenerator.ts                  # interface IdGenerator { uuid(): string }
    DomainEvent.ts                  # interface DomainEvent { occurredAt: Date; type: string }
  user/
    UserId.ts                       # VO wrapping string (Cognito sub)
  wallet/
    WalletId.ts
    Wallet.ts                       # AggregateRoot
    WalletError.ts                  # extends DomainError — InvalidName, InvalidCurrency, etc.
    WalletRepository.ts             # port (interface)
    events/
      WalletCreated.ts
    usecases/
      CreateWallet.ts
      ListWallets.ts
      GetWallet.ts
  transaction/
    Money.ts                        # VO { amount: number cents, currency: Currency }
    TransactionId.ts
    Transaction.ts                  # AggregateRoot
    TransactionError.ts             # CurrencyMismatch, AmountNotPositive, WalletNotFound, etc.
    TransactionRepository.ts        # port — exposes addTransaction(...) (TransactWriteItems)
    events/
      TransactionAdded.ts
    usecases/
      AddTransaction.ts
      ListTransactionsByWallet.ts
      ListTransactionsByCategory.ts
  category/
    CategoryId.ts                   # union: PredefinedCategoryId | UUID — domain treats as opaque string with helpers
    CategoryType.ts                 # type CategoryType = 'income' | 'expense'
    Category.ts                     # custom only
    CategoryError.ts
    CategoryRepository.ts           # port
    usecases/
      ListCategories.ts             # returns merged predefined + custom
      CreateCustomCategory.ts
      DeleteCustomCategory.ts
```

**Base classes**:

`Entity<TId>` — holds `readonly id: TId`, exposes `equals(other)`. Frozen after construction.

`AggregateRoot<TId>` — extends `Entity<TId>`, holds `private events: DomainEvent[]`, exposes `pullEvents(): DomainEvent[]` (returns and clears). MVP doesn't dispatch events anywhere, but the contract is set so a future outbox change is purely additive.

`ValueObject<TProps>` — holds frozen `readonly props: TProps`, exposes `equals(other)` via shallow JSON comparison of `props`.

`Result<T, E>` — as locked in proposal §4.10.

`Clock` and `IdGenerator` — interfaces in `shared/`. Real impls live in `packages/api/src/adapters/system/`.

**`DomainError` hierarchy**:

```ts
// shared/DomainError.ts
export abstract class DomainError extends Error {
  abstract readonly tag: string;     // discriminator for the HTTP mapper
  abstract readonly httpStatus: 400 | 404 | 409;
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

Subclasses:

- `WalletError.InvalidName` (`tag: 'wallet.invalid_name'`, 400)
- `WalletError.NotFound` (`tag: 'wallet.not_found'`, 404)
- `TransactionError.CurrencyMismatch` (`tag: 'transaction.currency_mismatch'`, 409)
- `TransactionError.AmountNotPositive` (`tag: 'transaction.amount_not_positive'`, 400)
- `TransactionError.InvalidOccurredAt` (`tag: 'transaction.invalid_occurred_at'`, 400)
- `TransactionError.UnknownCategory` (`tag: 'transaction.unknown_category'`, 409)
- `TransactionError.CategoryTypeMismatch` (`tag: 'transaction.category_type_mismatch'`, 409)
- `CategoryError.InvalidName` (`tag: 'category.invalid_name'`, 400)
- `CategoryError.PredefinedCannotBeDeleted` (`tag: 'category.predefined_immutable'`, 400)
- `CategoryError.NotFound` (`tag: 'category.not_found'`, 404)

The api package's `shared/errors.ts` maps `error.httpStatus` directly — no giant switch.

**Repository ports** (key interfaces — illustrative, not final):

```ts
// wallet/WalletRepository.ts
export interface WalletRepository {
  create(wallet: Wallet): Promise<void>;
  findById(userId: UserId, walletId: WalletId): Promise<Wallet | null>;
  listByUser(userId: UserId, page: { limit: number; cursor?: string | undefined }):
    Promise<{ items: Wallet[]; nextCursor?: string }>;
}

// transaction/TransactionRepository.ts
export interface TransactionRepository {
  /**
   * Atomically creates a Transaction item AND increments/decrements the Wallet balance.
   * If `idempotencyRecord` is provided, also writes an IdempotencyRecord with attribute_not_exists
   * — on collision, the adapter throws IdempotencyConflict (caught by the use case to trigger replay).
   */
  add(input: {
    transaction: Transaction;
    walletBalanceDelta: number; // signed cents
    idempotencyRecord?: { pk: string; sk: string; ttlEpochSeconds: number };
  }): Promise<void>;

  findById(userId: UserId, transactionId: TransactionId): Promise<Transaction | null>;

  listByWallet(userId: UserId, walletId: WalletId, filter: ListByWalletFilter):
    Promise<{ items: Transaction[]; nextCursor?: string }>;

  listByCategory(userId: UserId, categoryId: string, filter: ListByCategoryFilter):
    Promise<{ items: Transaction[]; nextCursor?: string }>;

  findIdempotentTransactionId(userId: UserId, idempotencyRecordSk: string):
    Promise<TransactionId | null>;
}

// category/CategoryRepository.ts
export interface CategoryRepository {
  create(category: Category): Promise<void>;
  findById(userId: UserId, categoryId: string): Promise<Category | null>;
  listCustomByUser(userId: UserId): Promise<Category[]>;
  softDelete(userId: UserId, categoryId: string, at: Date): Promise<void>;
}
```

Pagination cursors are opaque base64-encoded JSON of the last-evaluated key. The repository serialises and deserialises them; use cases pass them through opaquely.

**Result idiomatic usage**: domain functions never throw a `DomainError`. They `return err(new WalletError.NotFound(...))`. Adapters throw infrastructure errors (DDB exceptions); the handler middleware catches them and returns 500.

---

### 2.3 `packages/api`

**Files to create** (`packages/api/src/`):

```
src/
  index.ts                                # re-exports handlers for bundling (not strictly needed but useful)
  handlers/
    wallet/
      createWallet.ts
      listWallets.ts
      getWallet.ts
    transaction/
      addTransaction.ts
      listTransactionsByWallet.ts
      listTransactionsByCategory.ts
    category/
      listCategories.ts
      createCustomCategory.ts
      deleteCustomCategory.ts
  adapters/
    dynamodb/
      DynamoDBClient.ts                   # client + DocumentClient singletons
      keyBuilders.ts                      # keyForWallet, keyForTransaction, keyForCategory, keyForIdempotency
      mappers/
        WalletMapper.ts                   # entity ↔ DDB item
        TransactionMapper.ts
        CategoryMapper.ts
      DynamoDBWalletRepository.ts
      DynamoDBTransactionRepository.ts
      DynamoDBCategoryRepository.ts
      cursorCodec.ts                      # base64(JSON) ↔ LastEvaluatedKey
    system/
      SystemClock.ts                      # implements Clock — returns new Date()
      UuidIdGenerator.ts                  # implements IdGenerator — uses crypto.randomUUID
    cognito/
      extractUserId.ts                    # event → UserId
  middleware/
    withAuth.ts                           # extracts userId from JWT claims OR mock header (IS_OFFLINE)
    withValidation.ts                     # generic Zod-schema runner for body / query / path
    withErrorHandler.ts                   # try/catch wrapper, DomainError → HTTP, unknown → 500
    compose.ts                            # tiny pipe(...middlewares)(handler)
  composition/
    container.ts                          # factories that wire each use case with its adapters
  shared/
    response.ts                           # ok / created / noContent / formatJson helpers
    errors.ts                             # DomainError → APIGatewayProxyResultV2 mapper
    idempotency.ts                        # sha256(userId + walletId + idempotencyKey) → 32-char hex
    logger.ts                             # console.log wrapper with structured JSON
    env.ts                                # typed reader for process.env (TABLE_NAME, GSI1_NAME, REGION, IS_OFFLINE, …)
```

**Lambda handler contract**:

```ts
// handlers/wallet/createWallet.ts (illustrative)
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CreateWalletRequestSchema } from '@smart-wallet/shared-types';
import { makeCreateWallet } from '../../composition/container.js';
import { compose } from '../../middleware/compose.js';
import { withAuth } from '../../middleware/withAuth.js';
import { withValidation } from '../../middleware/withValidation.js';
import { withErrorHandler } from '../../middleware/withErrorHandler.js';
import { created } from '../../shared/response.js';
import { mapDomainError } from '../../shared/errors.js';

const createWallet = makeCreateWallet();

export const handler = compose(
  withErrorHandler,
  withAuth,
  withValidation({ body: CreateWalletRequestSchema }),
)(async (event, ctx) => {
  const result = await createWallet.execute(ctx.userId, ctx.body);
  if (!result.ok) return mapDomainError(result.error);
  return created(toWalletResponse(result.value));
});
```

Notes:
- Relative imports inside `packages/api` MUST carry explicit `.js` extensions (Node 22 ESM requirement). ESLint's `import/extensions` rule is configured accordingly.
- `compose(a, b, c)(handler)` applies middleware outside-in: `withErrorHandler` is the outermost (catches everything below).
- `ctx` is a per-request object middleware augments: `withAuth` adds `userId: UserId`, `withValidation` adds `body / query / path`. Strict typing via a small middleware-generic type (see Slice 8 below).

**DDB adapter pattern**:

- **Key builders** (`keyBuilders.ts`): one function per pattern. Each returns an object `{ PK, SK }` (and optionally `GSI1PK`, `GSI1SK`). Centralisation prevents typos in SK strings across the codebase.

  ```ts
  export const keyForWallet = (userId: string, walletId: string) =>
    ({ PK: `USER#${userId}`, SK: `WALLET#${walletId}` });

  export const keyForTransaction = (userId: string, walletId: string, occurredAtIso: string, transactionId: string) =>
    ({ PK: `USER#${userId}`, SK: `TXN#${walletId}#${occurredAtIso}#${transactionId}` });

  export const keyForTransactionGsi1 = (userId: string, categoryId: string, occurredAtIso: string, transactionId: string) =>
    ({ GSI1PK: `USER#${userId}`, GSI1SK: `CAT#${categoryId}#${occurredAtIso}#${transactionId}` });

  export const keyForCategory = (userId: string, categoryId: string) =>
    ({ PK: `USER#${userId}`, SK: `CATEGORY#${categoryId}` });

  export const keyForIdempotency = (userId: string, hash32: string) =>
    ({ PK: `USER#${userId}`, SK: `IDEMPOTENCY#${hash32}` });
  ```

- **Mappers** (`mappers/*.ts`): pure functions `toItem(entity) → DDB attributes` and `fromItem(item) → Result<entity, DomainError>`. They handle key composition, type narrowing, and the `entityType` tag.

- **`TransactWriteItems` builder for addTransaction**:
  - Without idempotency: `[Put(Transaction), Update(Wallet balance)]`.
  - With idempotency: `[Put(Transaction), Update(Wallet balance), Put(IdempotencyRecord with attribute_not_exists)]`.
  - On `TransactionCanceledException` with reason `ConditionalCheckFailed` on item index 2 → caught by the use case as `IdempotencyConflict`, which then reads the existing record and returns the original transaction. Other cancellation reasons rethrow (handled as 500 by middleware, unless the Wallet update fails the existence check, which the repository surfaces as `WalletError.NotFound`).

- **`marshallOptions`**: `{ removeUndefinedValues: true, convertEmptyValues: false, convertClassInstanceToMap: false }`. `removeUndefinedValues: true` keeps optional fields like `deletedAt` out of the item when unset — critical for `attribute_not_exists` filters to work as intended.

**Composition root** (`composition/container.ts`):

```ts
// container.ts (illustrative — one factory per use case)
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CreateWallet } from '@smart-wallet/domain';
import { DynamoDBWalletRepository } from '../adapters/dynamodb/DynamoDBWalletRepository.js';
import { SystemClock } from '../adapters/system/SystemClock.js';
import { UuidIdGenerator } from '../adapters/system/UuidIdGenerator.js';
import { env } from '../shared/env.js';

// Module-scope singletons (cold-start friendly)
const ddbClient = new DynamoDBClient({
  region: env.AWS_REGION,
  ...(env.IS_OFFLINE ? { endpoint: 'http://localhost:8000' } : {}),
});
const documentClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

const walletRepository = new DynamoDBWalletRepository(documentClient, env.TABLE_NAME);
const clock = new SystemClock();
const idGenerator = new UuidIdGenerator();

export const makeCreateWallet = () => new CreateWallet(walletRepository, clock, idGenerator);
// ... one factory per use case
```

Singletons live at module scope so cold starts pay the AWS SDK init exactly once per warm container. There is no DI framework — explicit construction is the contract.

---

### 2.4 `packages/infra-cdk`

**One root stack**: `SmartWalletStack`. Constructs inside it (no nested stacks needed for MVP).

**Files** (`packages/infra-cdk/src/`):

```
src/
  bin/
    smart-wallet.ts                 # CDK app entrypoint
  stacks/
    SmartWalletStack.ts             # the only stack
  constructs/
    SingleTable.ts                  # wraps dynamodb.Table with PK/SK/GSI1
    UserPool.ts                     # wraps cognito.UserPool + UserPoolClient + UserPoolDomain
    SsmParameters.ts                # publishes the parameters listed in proposal §4.13
```

**Resource details**:

- **DynamoDB table**:
  - Logical ID: `SmartWalletTable`
  - Name: `smart-wallet-prod` (or omit name to let CDK generate — but a fixed name simplifies SSM publication; the proposal locks it via `/smart-wallet/prod/dynamo/table-name`)
  - Partition key: `PK` (S), Sort key: `SK` (S)
  - GSI1: PK `GSI1PK` (S), SK `GSI1SK` (S), projection `ALL`
  - Billing: `PAY_PER_REQUEST`
  - TTL attribute: `ttl`
  - **PITR: disabled** (free-tier constraint — explicit choice; documented in code comment as MVP-only)
  - Deletion protection: enabled (defensive; cheap insurance)

- **Cognito**:
  - User Pool: email-based sign-in, password policy (min 8, requires lowercase + uppercase + digit), self sign-up enabled, auto-verify email.
  - User Pool Client: no client secret (`generateSecret: false`), `USER_PASSWORD_AUTH` + `USER_SRP_AUTH` enabled, refresh token validity 30 days.
  - User Pool Domain: prefix `smart-wallet-prod` (Cognito hosted UI domain; not used by API but enables future hosted login).

- **SSM Parameters** (all `StringParameter`, type `String` — none are `SecureString` because none are secrets in MVP; client ID and table ARN are not sensitive):
  - `/smart-wallet/prod/dynamo/table-name`
  - `/smart-wallet/prod/dynamo/table-arn`
  - `/smart-wallet/prod/dynamo/gsi1-name` (constant `GSI1`)
  - `/smart-wallet/prod/cognito/user-pool-id`
  - `/smart-wallet/prod/cognito/user-pool-arn`
  - `/smart-wallet/prod/cognito/user-pool-client-id`
  - `/smart-wallet/prod/cognito/issuer-url` — `https://cognito-idp.${region}.amazonaws.com/${userPool.userPoolId}` (computed string, NOT `userPool.userPoolProviderUrl` which returns the same value but a string token at synth time — both are fine; pick the explicit format for readability)
  - `/smart-wallet/prod/region` (constant `us-east-1`)

- **IAM**: The CDK stack itself doesn't grant runtime access — Serverless declares per-function policies pointing at the table ARN read from SSM.

- **Region**: `us-east-1`. Account: same account as Life Tracker MVP. CDK bootstrap is already done in that region — no extra `cdk bootstrap` needed.

---

### 2.5 `packages/infra-sls`

**`serverless.yml` structure**:

```yaml
service: smart-wallet-api
frameworkVersion: '3'

useDotenv: true

provider:
  name: aws
  runtime: nodejs22.x
  architecture: arm64
  region: ${ssm:/smart-wallet/prod/region}
  memorySize: 256
  timeout: 10
  logRetentionInDays: 14
  environment:
    NODE_OPTIONS: '--enable-source-maps'
    TABLE_NAME: ${ssm:/smart-wallet/prod/dynamo/table-name}
    GSI1_NAME: ${ssm:/smart-wallet/prod/dynamo/gsi1-name}
    AWS_REGION_OVERRIDE: ${ssm:/smart-wallet/prod/region}    # AWS_REGION is reserved by Lambda
  httpApi:
    cors: true
    authorizers:
      cognitoJwt:
        type: jwt
        identitySource: $request.header.Authorization
        issuerUrl: ${ssm:/smart-wallet/prod/cognito/issuer-url}
        audience:
          - ${ssm:/smart-wallet/prod/cognito/user-pool-client-id}

plugins:
  - serverless-esbuild
  - serverless-offline

custom:
  esbuild:
    bundle: true
    minify: true
    sourcemap: true
    target: node22
    platform: node
    format: esm
    mainFields: ['module', 'main']
    banner:
      js: |
        import { createRequire } from 'module';
        const require = createRequire(import.meta.url);
    external:
      - '@aws-sdk/*'    # provided by Lambda runtime? NO — Node 22 runtime ships AWS SDK v3, so externalising saves bundle size
  serverless-offline:
    httpPort: 3000
    noPrependStageInUrl: true
    useChildProcesses: true

package:
  individually: true

functions:
  createWallet:
    handler: ../api/src/handlers/wallet/createWallet.handler
    events:
      - httpApi:
          path: /wallets
          method: post
          authorizer:
            name: cognitoJwt
    iamRoleStatementsName: smart-wallet-createWallet
    iamRoleStatements:
      - Effect: Allow
        Action: [dynamodb:PutItem]
        Resource: ${ssm:/smart-wallet/prod/dynamo/table-arn}
  listWallets:
    handler: ../api/src/handlers/wallet/listWallets.handler
    events:
      - httpApi:
          path: /wallets
          method: get
          authorizer:
            name: cognitoJwt
    iamRoleStatements:
      - Effect: Allow
        Action: [dynamodb:Query]
        Resource: ${ssm:/smart-wallet/prod/dynamo/table-arn}
  # ... one entry per handler — each with minimal IAM:
  #   getWallet:               GetItem
  #   addTransaction:          PutItem + UpdateItem + TransactWriteItems + Query (for idempotency lookup) + GetItem (replay)
  #   listTransactionsByWallet: Query
  #   listTransactionsByCategory: Query on TABLE_ARN/index/GSI1
  #   listCategories:          Query
  #   createCustomCategory:    PutItem
  #   deleteCustomCategory:    UpdateItem (sets deletedAt)
```

`addTransaction` needs `dynamodb:TransactWriteItems` and also `dynamodb:GetItem` (for idempotency replay). `listTransactionsByCategory` needs `Resource: "${ssm:.../table-arn}/index/GSI1"`.

**`AWS_REGION_OVERRIDE`**: Lambda sets `AWS_REGION` automatically; we pass our own var to avoid colliding. The DynamoDBClient construction reads `AWS_REGION` (which Lambda sets) by default — we only override for local dev where we read `AWS_REGION` directly from `.env.local`.

**Local dev (`IS_OFFLINE`)**: `serverless-offline` sets `IS_OFFLINE=true` automatically. `withAuth` checks for it and switches to the mock JWT path; the DynamoDBClient construction in `container.ts` checks for it and points at `http://localhost:8000`. No additional plugin config needed beyond `serverless-offline` itself.

---

## 3. Data flow diagrams

### 3.1 addTransaction happy path (no idempotency)

```
Client                API GW         JWT Auth       Lambda                 Use case               DDB
  |  POST /wallets/{id}/transactions  |              |                       |                       |
  |  body + Authorization: Bearer …   |              |                       |                       |
  |---------------------------------->|              |                       |                       |
  |                                   |--validate--->|                       |                       |
  |                                   |<---claims----|                       |                       |
  |                                   |---event----------------------------->|                       |
  |                                                                          | withErrorHandler      |
  |                                                                          | withAuth (claims.sub) |
  |                                                                          | withValidation (Zod)  |
  |                                                                          | container.add…       |
  |                                                                          |---execute----------->| WalletRepository.findById
  |                                                                          |                       |---Query (PK,SK)------>
  |                                                                          |                       |<---Wallet item--------
  |                                                                          | Wallet.currency == body.currency? |
  |                                                                          | Category lookup (predefined OR custom find) |
  |                                                                          |                       |---GetItem (custom)--->
  |                                                                          |                       |<---Category item-----
  |                                                                          | Transaction.create()  |
  |                                                                          |---TransactWriteItems-->
  |                                                                          |  [Put Txn, Update Wallet.balance]            |
  |                                                                          |<----------success----------------------------|
  |                                                                          |<---Result.ok(Txn)----|
  |                                   <---201 + JSON---------                |                       |
  |<----201 + JSON --------------------|                                     |                       |
```

### 3.2 addTransaction with Idempotency-Key (first write)

```
… (auth + validation identical) …
handler computes hash32 = sha256(userId + walletId + key).hex.slice(0, 32)
use case:
  - reads Wallet (find by id)
  - validates category & currency
  - builds Transaction
  - calls TransactionRepository.add({ transaction, walletBalanceDelta, idempotencyRecord: {
      pk: USER#userId, sk: IDEMPOTENCY#hash32, ttlEpochSeconds: now + 86400 } })
  - repo invokes TransactWriteItems with 3 ops:
      [ Put(Txn),
        Update(Wallet.balance),
        Put(IdempotencyRecord) ConditionExpression: attribute_not_exists(PK) ]
  - all succeed → returns Result.ok(Transaction)
handler responds 201 + JSON
```

### 3.3 addTransaction with Idempotency-Key (replay)

```
handler computes hash32 (same as before — deterministic)
use case calls TransactionRepository.add({ … with idempotencyRecord … })
  - TransactWriteItems fails with TransactionCanceledException
  - cancellation reason at index 2 is ConditionalCheckFailed
  - adapter throws IdempotencyConflict (mapped from the cancellation reason)
use case catches IdempotencyConflict:
  - calls TransactionRepository.findIdempotentTransactionId(userId, IDEMPOTENCY#hash32)
    → returns the previously-stored transactionId
  - calls TransactionRepository.findById(userId, transactionId)
    → returns the previously-committed Transaction
  - returns Result.ok({ transaction, replayed: true })
handler responds 200 (NOT 201) + the same JSON shape
```

The "replayed" boolean is a use-case output flag the handler uses ONLY to pick the status code. The response body is identical to the first write.

### 3.4 listTransactionsByCategory (uses GSI1)

```
GET /transactions?categoryId=expense:food&limit=50 + Authorization
→ JWT validated by API GW
→ withAuth extracts userId
→ withValidation parses query
→ ListTransactionsByCategory use case calls TransactionRepository.listByCategory(userId, categoryId, { ... })
→ adapter issues Query on table SmartWalletTable, IndexName=GSI1:
    KeyConditionExpression: GSI1PK = :pk AND begins_with(GSI1SK, :catPrefix)
    where :pk = "USER#${userId}" and :catPrefix = "CAT#expense:food#"
    FilterExpression: attribute_not_exists(deletedAt)
    Limit = 50
    ExclusiveStartKey decoded from cursor
→ items mapped → response JSON
```

### 3.5 Local dev request flow

```
Developer runs:  pnpm ddb:up      (starts DynamoDB Local + dynamodb-admin)
                 pnpm dev         (turbo orchestrates → sls offline start in infra-sls)
                                  → serverless-offline sets IS_OFFLINE=true,
                                    creates Express routes mirroring httpApi events,
                                    invokes the same handlers in-process

Bruno / curl → http://localhost:3000/wallets
  + headers:  X-Mock-User-Id: 11111111-1111-1111-1111-111111111111
              Content-Type: application/json
→ serverless-offline routes to createWallet handler
→ withAuth sees IS_OFFLINE=true → reads X-Mock-User-Id → constructs userId
→ withValidation runs identical Zod schema
→ container's DynamoDBClient was constructed with endpoint=http://localhost:8000
→ uses Wallet repository against DDB Local (table must exist locally; bootstrapped by
  packages/infra-sls/scripts/init-local-table.ts or via dynamodb-admin UI)
→ identical response
```

The handler code path is 100% identical between offline and prod — only `withAuth` and the DDB endpoint branch on `IS_OFFLINE`. This is the testability guarantee from proposal §9 acceptance criterion 7.

---

## 4. Error handling contract

**Where errors are produced**:

- **Domain** (`packages/domain`): NEVER throws domain errors. Every fallible operation returns `Result<T, DomainError>`. Domain code may `throw` only for genuinely impossible invariants (`assert never`-style) — those are bugs, not domain errors.
- **Adapters** (`packages/api/src/adapters/`): MAY throw infrastructure exceptions (DDB throttling, network, malformed item). They MAY throw a typed `IdempotencyConflict` (subclass of `Error`, NOT `DomainError`) which the use case catches and translates into a `Result.ok({ replayed: true, ... })`.
- **Middleware** (`withErrorHandler`): wraps the entire handler in `try/catch`. Unknown throws → 500 + opaque body + full error logged to CloudWatch.

**DomainError → HTTP** mapping table (driven by `error.httpStatus`):

| Tag                                       | HTTP | Notes                          |
|-------------------------------------------|------|--------------------------------|
| `wallet.invalid_name`                     | 400  |                                |
| `wallet.not_found`                        | 404  |                                |
| `transaction.amount_not_positive`         | 400  |                                |
| `transaction.invalid_occurred_at`         | 400  |                                |
| `transaction.currency_mismatch`           | 409  |                                |
| `transaction.unknown_category`            | 409  | Per proposal §5 status codes   |
| `transaction.category_type_mismatch`      | 409  |                                |
| `category.invalid_name`                   | 400  |                                |
| `category.predefined_immutable`           | 400  | DELETE on `type:slug` ID       |
| `category.not_found`                      | 404  |                                |

Response body for any `DomainError`:

```json
{ "error": "<tag>", "message": "<error.message>" }
```

**ZodError**: caught inside `withValidation`, returned as:

```json
{ "error": "validation_failed", "details": <z.ZodError.flatten()> }
```

with HTTP 400.

**DDB `ConditionalCheckFailedException` in idempotency**: caught inside the adapter; rethrown as `IdempotencyConflict` (a typed adapter-level error). The `AddTransaction` use case catches `IdempotencyConflict`, reads the original record + transaction, and returns `Result.ok({ transaction, replayed: true })`. Status 200 (vs 201).

**Unknown errors**: `withErrorHandler` catches the rejection, logs the full error object with `requestId`/`userId`/`route`, and returns:

```json
{ "error": "internal_error", "message": "An unexpected error occurred." }
```

with HTTP 500. The original error is NEVER leaked to the client.

---

## 5. Configuration & secrets

**SSM parameter inventory** (restating proposal §4.13 verbatim — all under `/smart-wallet/prod/`):

| Parameter                                          | Producer | Consumer                                  |
|----------------------------------------------------|----------|-------------------------------------------|
| `/smart-wallet/prod/dynamo/table-name`             | CDK      | Serverless env → Lambda (`TABLE_NAME`)    |
| `/smart-wallet/prod/dynamo/table-arn`              | CDK      | Serverless IAM policy                     |
| `/smart-wallet/prod/dynamo/gsi1-name`              | CDK      | Serverless env → Lambda (`GSI1_NAME`)     |
| `/smart-wallet/prod/cognito/user-pool-id`          | CDK      | Serverless env → Lambda                   |
| `/smart-wallet/prod/cognito/user-pool-arn`         | CDK      | Serverless IAM policy (future)            |
| `/smart-wallet/prod/cognito/user-pool-client-id`   | CDK      | Serverless JWT authorizer audience        |
| `/smart-wallet/prod/cognito/issuer-url`            | CDK      | Serverless JWT authorizer issuerUrl       |
| `/smart-wallet/prod/region`                        | CDK      | Serverless env → Lambda                   |

**Lambda environment variables (deploy-time interpolation, runtime read)**:

- `TABLE_NAME`
- `GSI1_NAME`
- `AWS_REGION_OVERRIDE` (Lambda's `AWS_REGION` is set by the runtime; this is the SSM-resolved value, used only for cross-account symmetry — generally we just use `AWS_REGION` in code)

**Local env vars** (`.env.local` template — copied into `packages/infra-sls/.env.local.example`):

```bash
IS_OFFLINE=true
TABLE_NAME=smart-wallet-local
GSI1_NAME=GSI1
AWS_REGION=us-east-1
# Optional: spoof an auth user for local dev
LOCAL_USER_ID=11111111-1111-1111-1111-111111111111
```

The local handler reads `X-Mock-User-Id` header first; falls back to `LOCAL_USER_ID` env var if header is missing — convenient for `curl` invocations without typing the header.

**Secrets**: NONE in MVP. Cognito app client has no client secret (`generateSecret: false`) since we use a public client (HTTP API + future SPA). No API keys, no tokens, no database creds. All SSM parameters are `StringParameter`, not `SecureString`.

---

## 6. Composition root pattern

`packages/api/src/composition/container.ts` exports a factory function per use case. Each factory closes over module-scope singletons (DDB client, repositories, clock, id generator). Handlers call the factory **at module load time** so the use case is constructed once per cold start:

```ts
// container.ts (sketch)
const ddbClient = new DynamoDBClient({ /* … env-driven */ });
const documentClient = DynamoDBDocumentClient.from(ddbClient, { marshallOptions });
const tableName = env.TABLE_NAME;
const gsi1Name = env.GSI1_NAME;

const walletRepository: WalletRepository =
  new DynamoDBWalletRepository(documentClient, tableName);
const transactionRepository: TransactionRepository =
  new DynamoDBTransactionRepository(documentClient, tableName, gsi1Name);
const categoryRepository: CategoryRepository =
  new DynamoDBCategoryRepository(documentClient, tableName);
const clock: Clock = new SystemClock();
const idGenerator: IdGenerator = new UuidIdGenerator();

// One factory per use case
export const makeCreateWallet = () => new CreateWallet(walletRepository, clock, idGenerator);
export const makeListWallets  = () => new ListWallets(walletRepository);
export const makeGetWallet    = () => new GetWallet(walletRepository);
export const makeAddTransaction = () =>
  new AddTransaction(walletRepository, transactionRepository, categoryRepository, clock, idGenerator);
export const makeListTransactionsByWallet   = () => new ListTransactionsByWallet(transactionRepository);
export const makeListTransactionsByCategory = () => new ListTransactionsByCategory(transactionRepository);
export const makeListCategories          = () => new ListCategories(categoryRepository);
export const makeCreateCustomCategory    = () => new CreateCustomCategory(categoryRepository, clock, idGenerator);
export const makeDeleteCustomCategory    = () => new DeleteCustomCategory(categoryRepository, clock);
```

**Why this is testable**: a future test file imports `CreateWallet` (or any use case) directly from `@smart-wallet/domain`, instantiates it with in-memory repositories that implement the port interfaces, and asserts on `Result` values. Zero AWS, zero Lambda, zero Zod. The container.ts file is the ONLY file that knows about DDB.

---

## 7. Implementation order (slices for sdd-tasks)

Each slice is sized to ~1–3 hours of solo work, delivers a meaningful chunk, and ends with `tsc --noEmit` + `eslint` clean. A solo dev runs these sequentially. The only point where parallelism would help is between Slice 11 (CDK) and Slice 12 (Serverless) — they target different packages — but in practice the deploy in Slice 14 chains them, so sequential is fine.

1. **Slice 0 — Install runtime deps.** `pnpm add -F @smart-wallet/shared-types zod`. `pnpm add -F @smart-wallet/api @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb aws-jwt-verify uuid`. `pnpm add -F @smart-wallet/api -D @types/aws-lambda @types/uuid`. `pnpm add -F @smart-wallet/infra-cdk aws-cdk-lib constructs`. `pnpm add -F @smart-wallet/infra-cdk -D aws-cdk`. `pnpm add -F @smart-wallet/infra-sls -D serverless serverless-esbuild serverless-offline`. `pnpm install` clean. No code yet.

2. **Slice 1 — `shared-types` foundation.** Create `currencies.ts`, `categories.ts`, `pagination.ts`, `date.ts`, `schemas/common.ts`. NO money transforms yet (defer to Slice 7). Define schemas with placeholder `amount: z.string()` (transform comes later). Export inferred DTOs. `pnpm typecheck` green.

3. **Slice 2 — Domain shared base.** `Result`, helpers, `DomainError` abstract, `Entity`, `AggregateRoot`, `ValueObject`, `DomainEvent`, `Clock`, `IdGenerator`. No aggregate yet. `pnpm typecheck` green.

4. **Slice 3 — Wallet aggregate.** `UserId`, `WalletId`, `Wallet` entity (`Wallet.create()` enforces name + currency + balance=0; `applyBalanceChange(delta)`), `WalletError` subclasses, `WalletRepository` port, `WalletCreated` event. Use cases `CreateWallet`, `ListWallets`, `GetWallet`. `pnpm typecheck` green.

5. **Slice 4 — Money + Transaction aggregate.** `Money` VO (cents, currency, `add/subtract/negate`), `TransactionId`, `Transaction` entity (`Transaction.create()` enforces positive amount, occurredAt range, currency-match invariant), `TransactionError` subclasses, `TransactionRepository` port, `TransactionAdded` event. Use cases `AddTransaction` (no idempotency branch yet — that's Slice 10), `ListTransactionsByWallet`, `ListTransactionsByCategory`. `pnpm typecheck` green.

6. **Slice 5 — Category aggregate.** `CategoryId` helpers (`isPredefined`, `validateCustom`), `CategoryType`, `Category` entity (custom only), `CategoryError` subclasses, `CategoryRepository` port. Use cases `ListCategories` (merges `PREDEFINED_CATEGORIES` from `shared-types` + repo result), `CreateCustomCategory`, `DeleteCustomCategory`. Cross-package dep: `domain` may import the TYPE `PredefinedCategoryId` from `shared-types` — but **only as a type** (`import type`), keeping the runtime-deps rule intact. `pnpm typecheck` green.

7. **Slice 6 — Zod transforms + boundary validation.** Write `money.ts` (`decimalStringToCents`, `centsToDecimalString`, `zDecimalString`). Update `schemas/transaction.ts` so the request schema validates the string format (the cents conversion happens in the handler where currency is known). Add a `categoryId` validator that accepts either `PredefinedCategoryId` OR UUID v4. Add `zOccurredAt` (ISO + range). `pnpm typecheck` green.

8. **Slice 7 — DynamoDB adapters + key builders.** `DynamoDBClient.ts` (singletons, marshallOptions), `keyBuilders.ts`, `cursorCodec.ts`, three mappers, three repositories. `DynamoDBTransactionRepository.add()` for now implements only the 2-op `TransactWriteItems` (no idempotency arg). `pnpm typecheck` green.

9. **Slice 8 — API middleware + composition root.** `compose.ts`, `withErrorHandler`, `withAuth` (with `IS_OFFLINE` branch), `withValidation` (Zod runner taking `{ body?, query?, path? }`), `response.ts`, `errors.ts` (DomainError mapper), `idempotency.ts` (sha256 helper), `logger.ts`, `env.ts`, `container.ts` factories. `pnpm typecheck` green.

10. **Slice 9 — Lambda handlers.** All eight handlers wired to use cases. **Spike rule**: write `createWallet` FIRST, deploy it to `serverless-offline`, hit it with curl, confirm 201 response. ONLY THEN write the other seven. This validates the ESM bundling + middleware composition end-to-end before scaling. `pnpm typecheck` green.

11. **Slice 10 — Idempotency in AddTransaction.** Extend `AddTransaction` use case to compute the idempotency record SK when the handler passes one in, branch on `IdempotencyConflict` for replay. Extend `DynamoDBTransactionRepository.add()` to support the 3-op TransactWrite. Implement `findIdempotentTransactionId()`. TTL set to `now + 86400` seconds. `pnpm typecheck` green.

12. **Slice 11 — CDK stack.** `SmartWalletStack` with the table, GSI1, Cognito User Pool + app client + domain, all eight SSM parameters. `pnpm --filter @smart-wallet/infra-cdk synth` clean. (Deploy happens in Slice 14.)

13. **Slice 12 — Serverless config.** `serverless.yml` with all eight functions, IAM least-privilege per function, esbuild + offline plugins. `sls package` clean locally. Local `init-local-table.ts` script that uses `@aws-sdk/client-dynamodb` to create the table in DDB Local with the same key schema CDK uses.

14. **Slice 13 — Local dev verification.** Run `pnpm ddb:up`, run `init-local-table.ts`, run `sls offline start`. Exercise all eight endpoints via a checked-in Bruno collection at `packages/infra-sls/bruno/`. Document curl smoke-tests in a small `LOCAL_DEV.md` (this file is allowed because it's project doc, not an SDD artifact).

15. **Slice 14 — First cloud deploy.** `pnpm --filter @smart-wallet/infra-cdk deploy`, then `pnpm --filter @smart-wallet/infra-sls deploy`. Verify SSM populated via AWS console. Smoke-test against the deployed URL (must create a Cognito user manually first via CLI). Capture any bugs as follow-up tasks.

**Parallelism note** for solo dev: none meaningful. For a small team, Slice 11 (CDK) and Slices 2–10 (domain + api) can happen in parallel because they don't touch the same files; the join point is Slice 12 (Serverless reads SSM CDK published).

---

## 8. Key implementation details (non-obvious decisions)

- **DDB GSI projection ALL**: confirmed in proposal §4.2. Implication: every transaction is stored twice (base + GSI1), doubling write cost. At MVP volume (~1k txns/month) this is dust. Mappers do NOT need to set `GSI1PK`/`GSI1SK` separately — they're attributes on the same item; the mapper writes them as plain attributes and DDB replicates automatically.

- **DDB client config**: `marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false, convertClassInstanceToMap: false }`. The first ensures `deletedAt: undefined` doesn't get marshalled into a `NULL` attribute (would break `attribute_not_exists` filters). The second keeps empty strings empty (vs `null`). The third prevents accidental coercion of entity instances — the mapper is the only place an entity touches an item.

- **UUID library**: `crypto.randomUUID()` from Node 22 is preferred. `uuid` package is added only if we discover an ESM/bundler edge case in `serverless-esbuild` with `node:crypto`. `IdGenerator` interface insulates the choice — switching is a one-line adapter change. **Decision for MVP: start with `crypto.randomUUID()`**; drop `uuid` from Slice 0 if it isn't needed (verify during Slice 9 spike).

- **JWT mock for offline**: `withAuth` middleware short-circuits when `process.env.IS_OFFLINE === 'true'`. It reads `X-Mock-User-Id` (then falls back to `LOCAL_USER_ID` env). Real path uses `aws-jwt-verify` to validate the token signature against the Cognito user pool's JWKS. The middleware constructs a synthetic `event.requestContext.authorizer.jwt.claims` object in the offline branch so downstream code sees a uniform shape.

- **Logging**: `logger.ts` exports `log.info(msg, fields)` / `log.error(msg, err, fields)` that `console.log(JSON.stringify({ level, msg, ts, requestId, userId, route, ...fields }))`. CloudWatch's JSON parser indexes this automatically. `aws-lambda-powertools` is a future enhancement, not MVP.

- **Cold-start optimization**: each handler file imports ONLY what it needs (`import { makeCreateWallet }` not `import * as container`). Bundler tree-shakes effectively only when imports are named. DynamoDBClient + DocumentClient + per-handler use cases all live at module scope — constructed once per warm container.

- **ESM specifics**: ALL relative imports inside `packages/api`, `packages/domain`, `packages/shared-types`, and `packages/infra-cdk` MUST carry explicit `.js` extensions in source `.ts` files. Node 22 ESM does not auto-resolve. ESLint's `import/extensions` rule enforces this. Example: `import { compose } from '../../middleware/compose.js';` — even though the file is `compose.ts`.

- **`exactOptionalPropertyTypes`**: optional fields in entity props must be EITHER omitted from the object OR set to a value of their type — never explicit `undefined`. Example:

  ```ts
  // BAD — will not compile with exactOptionalPropertyTypes:
  const w = new Wallet({ name: 'x', currency: 'USD', deletedAt: undefined });

  // GOOD:
  const w = new Wallet({ name: 'x', currency: 'USD' });

  // ALSO GOOD when you have a value to assign:
  const w2 = new Wallet({ name: 'x', currency: 'USD', deletedAt: '2026-05-12T…' });
  ```

  Repository `findById` returns `Wallet | null` (NOT `Wallet | undefined`). Mappers spread conditionally:

  ```ts
  const props: WalletProps = {
    name: item.name,
    currency: item.currency,
    balance: item.balance,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.deletedAt !== undefined ? { deletedAt: item.deletedAt } : {}),
  };
  ```

- **`noUncheckedIndexedAccess`**: array access returns `T | undefined`. Code that indexes into pagination cursors, DDB `Items[0]`, or env vars MUST handle the undefined case explicitly. `env.ts` is the place that turns `process.env.TABLE_NAME` into a guaranteed `string` (throws at module load if absent).

- **`verbatimModuleSyntax` + AWS SDK**: AWS SDK v3 publishes both ESM and types. With `verbatimModuleSyntax`, distinguish:
  - `import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';` (type-only)
  - `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';` (value)

  ESLint's `@typescript-eslint/consistent-type-imports` (set to `'type-imports'`) catches violations on lint.

- **API Gateway HTTP API request body**: `event.body` is a string. `withValidation` parses it with `JSON.parse` inside a `try/catch` (malformed JSON → 400 `invalid_json`), then runs Zod against the parsed object.

- **CORS in serverless-offline**: enable globally via `provider.httpApi.cors: true` for MVP. Fine-tune (origin whitelist) when the web frontend lands.

---

## 9. Risks reviewed and mitigations sharpened

For each risk from proposal §7, the design's mitigation:

1. **Serverless + ESM bundling** — Slice 9 spike rule: write `createWallet` first; deploy to `serverless-offline`; verify 201; ONLY THEN write the other handlers. If `serverless-esbuild` `format: esm` misbehaves (e.g., dynamic `require` from a transitive dep), fall back to `format: cjs` for THAT single function and reopen as a follow-up — never let this block the whole MVP.

2. **`verbatimModuleSyntax` + AWS SDK** — ESLint `consistent-type-imports` rule enforced; Husky pre-commit runs `pnpm lint`. CI will catch any drift in a future change.

3. **TransactWriteItems cost** — at MVP scale (1k tx/month → 2k WCU normal, 3k with idempotency), negligible. No mitigation needed beyond awareness; documented in proposal §4.7.

4. **GSI1 ALL projection cost** — same: negligible at MVP. Documented; not mitigated.

5. **Idempotency key TTL** — `ttl` attribute set to `Math.floor(Date.now() / 1000) + 86400` at write. DDB TTL is best-effort but typically clears within 48h. Adequate for "user accidentally pressed submit twice" semantics. Adapter sets `ttl` field; CDK enables TTL on attribute `ttl`.

6. **Single GSI constraint** — already documented as out-of-scope. Future "list all txns across wallets" needs `GSI2`. Not mitigated in this design.

7. **Soft-delete RCU waste** — at MVP scale, no user will have >100 deleted items. Not mitigated; revisit when telemetry shows the issue.

8. **CDK + Serverless deploy order** — package-level scripts: `infra-cdk/package.json` defines `deploy`; `infra-sls/package.json` defines `deploy`. Add a root-level `deploy:all` script that runs them in order. SSM lookup failure surfaces as a clear `cloudformation` error at `sls deploy` time — easier to debug than a silent runtime crash.

9. **Cognito issuer URL format** — explicit string `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` in CDK, written to `/smart-wallet/prod/cognito/issuer-url`. After first deploy, verify the value via `aws ssm get-parameter --name /smart-wallet/prod/cognito/issuer-url`. Document the format in a code comment.

10. **Money precision at boundary** — single `decimalStringToCents`/`centsToDecimalString` pair in `shared-types/src/money.ts`. Every schema and every response goes through them. `sdd-spec` writes round-trip scenarios for USD and PEN ("`12.34` → `1234` → `12.34`" and edge cases like `0.05`, `0.10`, `-12.34`).

---

## 10. Open questions for the user

**None.** Every Q1–Q7 from the exploration is locked in the proposal. The design fills in the file/path/type details consistently with those locks. If anything in Section 7 (slicing) feels different from how the user prefers to work, `sdd-tasks` is the place to push back — but the technical contract is complete.
