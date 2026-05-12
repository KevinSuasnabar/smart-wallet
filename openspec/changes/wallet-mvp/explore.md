# Exploration: wallet-mvp

> SDD phase: explore
> Project: smart-wallet
> Change: wallet-mvp
> Date: 2026-05-12
> Engram topic_key: `sdd/wallet-mvp/explore`

## Current State

The repo is at initial commit `98fa8aa`. Verified file-by-file:

- `packages/domain/src/index.ts` — `export {}` placeholder
- `packages/api/src/index.ts` — `export {}` placeholder
- `packages/shared-types/src/index.ts` — `export {}` placeholder
- `packages/infra-cdk/src/index.ts` — `export {}` placeholder
- `packages/infra-sls/` — only `.gitkeep`
- `packages/web/src/index.ts` — `export {}` placeholder

No tests, no CDK stacks, no Serverless config, no Zod schemas, no domain code whatsoever.

Stack locks confirmed in `tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, target ES2022, module ESNext.

`docker-compose.yml` uses `amazon/dynamodb-local:2.5.4` with `-sharedDb` flag on port 8000 and `dynamodb-admin` on 8001. DynamoDB Local infrastructure is the only real runtime piece in place.

ESLint is strict (`recommendedTypeChecked` + `stylisticTypeChecked`), `consistent-type-imports: error` enforced.

## Affected Areas

Every package is a blank slate. All the following will need to be created:

- `packages/domain/src/` — all DDD domain code (aggregates, entities, VOs, ports, use cases, domain events)
- `packages/api/src/` — Lambda handlers, adapters, composition root
- `packages/shared-types/src/` — Zod schemas for request/response contracts shared with `web`
- `packages/infra-cdk/src/` — CDK stacks (DynamoDB table, Cognito User Pool, CloudFront/S3, SSM params)
- `packages/infra-sls/` — `serverless.yml`, handler entry points, IAM roles
- `packages/web/src/` — React + Vite (out of scope for this change's backend; noted)

---

## Topic 1: DDD Aggregate Modeling

Three candidate designs for the wallet-mvp bounded context:

### Option A: Transaction embedded in Wallet aggregate

Wallet is the aggregate root. Transaction is an entity (or value object) owned by Wallet, stored inside it.

- **Pros**: single consistency boundary; `addTransaction` enforces all invariants in one place; no cross-aggregate coordination
- **Cons**: CRITICAL — DynamoDB item size limit is 400 KB; a wallet with 500+ transactions would overflow a single item if stored naively; this forces either a nested-collection anti-pattern or a pagination hack; violates the guidance that aggregates should be small and loadable in full; Wallet would need to load all its transactions to validate business rules, which is expensive
- **Effort**: Low initially, High to refactor later
- **Verdict**: NOT VIABLE for DynamoDB at scale

### Option B: Wallet and Transaction as separate aggregates linked by WalletId (RECOMMENDED)

Wallet is one aggregate root (holds metadata: name, currency, ownerId, balance counter). Transaction is a separate aggregate root (holds: walletId, type income/expense, amount, categoryId, date, description, userId). They are linked by `WalletId` value object; coordination uses domain events or use-case–level orchestration.

- **Pros**: no 400 KB DDB item size risk (each transaction is its own item); each aggregate is small and fully loadable; balance can be maintained as a denormalized counter on Wallet using DDB TransactWrite (write transaction + update balance atomically); consistent with financial domain modeling (transactions are first-class citizens); scales to millions of transactions per wallet with no structural change; easier to add future features (recurring transactions, tags, attachments) without changing Wallet; natural mapping to single-table DDB key design
- **Cons**: cross-aggregate consistency must be explicit (use `TransactWriteItems` to write Transaction item + update Wallet balance atomically — this is the right tool and costs 2x WCU, acceptable at MVP scale); slightly more domain code upfront
- **Effort**: Medium
- **Verdict**: BEST for DynamoDB + DDD + MVP scale

### Option C: User as root with Wallet and Transaction inside

User is the aggregate root. All wallets and transactions are owned entities.

- **Pros**: single root, conceptually simple
- **Cons**: catastrophically wrong at DDB scale; a user with 10 wallets and 5000 transactions would be one massive aggregate; violates "load aggregate in full" principle; practically impossible; User as aggregate root is only viable when User holds a tiny amount of owned state
- **Effort**: Low initially, catastrophic to maintain
- **Verdict**: REJECTED

**RECOMMENDATION**: Option B — Wallet and Transaction as separate aggregates, coordinated at use-case layer via DynamoDB `TransactWriteItems` for balance consistency.

Key invariants:
- A Transaction belongs to exactly one Wallet (by WalletId VO)
- Adding a transaction to a wallet atomically writes the Transaction item AND updates the Wallet balance counter (`TransactWrite`)
- Wallet balance is denormalized (not computed on every read); this is the correct DDD pattern for balance projection
- Category is either a predefined enum or a User-owned entity (separate aggregate if user can CRUD it)

---

## Topic 2: DynamoDB Single-Table Access Patterns and Key Schema

MVP access patterns identified:

| # | Pattern | Notes |
|---|---------|-------|
| 1 | `getWallet(userId, walletId)` | Direct PK+SK lookup |
| 2 | `listWallets(userId)` | Query PK=USER#id with SK begins_with WALLET# |
| 3 | `getTransaction(userId, walletId, transactionId)` | Direct lookup |
| 4 | `listTransactionsByWallet(userId, walletId, paginated, date range)` | Query on date, requires a GSI or careful SK design |
| 5 | `listTransactionsByCategory(userId, categoryId)` | Cross-wallet; requires GSI |
| 6 | `getBalance(userId, walletId)` | Served by getWallet — balance is an attribute on the Wallet item |
| 7 | `listCategories(userId)` | Query PK=USER#id with SK begins_with CATEGORY# |

Proposed key schema:

### Base table

| Entity | PK | SK |
|--------|----|----|
| Wallet | `USER#{userId}` | `WALLET#{walletId}` |
| Transaction | `USER#{userId}` | `TXN#{walletId}#{ISO8601date}#{transactionId}` |
| Category (custom) | `USER#{userId}` | `CATEGORY#{categoryId}` |

SK for Transaction includes walletId prefix AND ISO8601 date, enabling:
- `listTransactionsByWallet(userId, walletId)` → query PK=USER#{userId}, SK begins_with `TXN#{walletId}#`, with optional `between` on date suffix
- `getTransaction` → full PK+SK lookup
- Date is ISO8601 (e.g., `2026-05-11`) — lexicographic sort is correct for date range queries

### GSI1 — for `listTransactionsByCategory(userId, categoryId)`

| Attribute | Value |
|-----------|-------|
| GSI1PK | `USER#{userId}` |
| GSI1SK | `CAT#{categoryId}#{ISO8601date}#{transactionId}` |

Project: all attributes (not keys-only) since the list view needs amount, description, date.

This GSI only exists on Transaction items (sparse index — Wallet and Category items don't populate GSI1SK).

**No GSI2 needed** for MVP access patterns listed above.

### Balance strategy

**Denormalized counter on the Wallet item**.

- On addTransaction: `TransactWriteItems` — (1) Put Transaction item, (2) Update Wallet item with `balance = balance + amount` (signed: positive for income, negative for expense)
- Cost: 2x WCU per write — fully acceptable at MVP scale and free tier
- On getBalance: just `getWallet` — zero additional reads
- Reject "compute on read": would require loading ALL transactions for the wallet to sum them — O(N) reads, unacceptable once the wallet has >100 transactions; also requires pagination loops

DDB item size analysis: Wallet item ~500 bytes, Transaction item ~400 bytes, well under 400 KB limit. Category item ~200 bytes.

---

## Topic 3: Folder Structure for `packages/domain` and `packages/api`

Two approaches compete:

### Approach A: Feature-sliced (by bounded context / aggregate) — RECOMMENDED

```
domain/
  src/
    wallet/
      Wallet.ts                    # aggregate root entity
      WalletId.ts                  # value object
      WalletRepository.ts          # port (interface)
      events/
        WalletCreated.ts
    transaction/
      Transaction.ts               # aggregate root entity
      TransactionId.ts             # value object
      Money.ts                     # value object (amount + currency)
      TransactionRepository.ts     # port (interface)
      events/
        TransactionAdded.ts
    category/
      Category.ts                  # entity
      CategoryId.ts                # value object
      CategoryRepository.ts        # port (interface)
    user/
      UserId.ts                    # value object (Cognito sub)
    shared/
      Result.ts                    # Result<T, E> type
      DomainError.ts               # base error type
      Entity.ts                    # base Entity class (id, equals)
      AggregateRoot.ts             # base AggregateRoot (+ domain events)
      ValueObject.ts               # base VO (structural equality)
    usecases/
      wallet/
        CreateWallet.ts
        ListWallets.ts
        GetWallet.ts
      transaction/
        AddTransaction.ts
        ListTransactionsByWallet.ts
        ListTransactionsByCategory.ts
      category/
        ListCategories.ts
        CreateCustomCategory.ts
    index.ts                       # barrel — exports only public API
```

- **Pros**: screaming architecture (domain tells you what the app IS about by folder name); each aggregate is self-contained; adding future aggregates (Budget, Project) is additive, not disruptive; ports live next to their aggregate
- **Cons**: `usecases/` subfolder is slightly detached from aggregates — some prefer usecases inside the aggregate folder
- **Effort**: Medium

### Approach B: Layer-sliced (entities/, usecases/, repositories/)

```
domain/
  src/
    entities/
      Wallet.ts
      Transaction.ts
      Category.ts
    valueObjects/
      WalletId.ts
      Money.ts
    repositories/
      WalletRepository.ts
      TransactionRepository.ts
    usecases/
      CreateWallet.ts
      AddTransaction.ts
    events/
      TransactionAdded.ts
```

- **Pros**: familiar to developers coming from traditional layered arch; all entities in one place
- **Cons**: does NOT scream the domain; violates Clean Architecture's intent (the folder structure should reveal intent, not mechanics); mixing Wallet and Transaction in the same `entities/` folder hides the fact they are different aggregates; harder to scale to multiple bounded contexts
- **Effort**: Low

**RECOMMENDATION**: Approach A (feature-sliced / screaming architecture). Usecases can live either inside each aggregate folder or in a top-level `usecases/` folder grouped by aggregate. Top-level `usecases/` is slightly cleaner for the composition root to import.

### `packages/api` structure

```
api/
  src/
    handlers/
      wallet/
        createWallet.ts          # Lambda handler
        listWallets.ts
        getWallet.ts
      transaction/
        addTransaction.ts
        listTransactions.ts
      category/
        listCategories.ts
        createCategory.ts
    adapters/
      dynamodb/
        DynamoDBWalletRepository.ts     # implements WalletRepository port
        DynamoDBTransactionRepository.ts
        DynamoDBCategoryRepository.ts
        DynamoDBClient.ts               # shared client singleton
      cognito/
        CognitoUserIdExtractor.ts       # extracts userId from JWT claims
    middleware/
      withAuth.ts                       # extracts + validates JWT claims from event
      withValidation.ts                 # runs Zod schema on event.body
    composition/
      container.ts                      # composition root — wires ports to adapters
    shared/
      response.ts                       # APIGatewayProxyResultV2 helpers
      errors.ts                         # maps DomainError to HTTP status
    index.ts
```

---

## Topic 4: Result/Either Pattern Strategy

Three options:

### Option A: neverthrow library

- **Pros**: battle-tested; `ResultAsync` for async chains; `.map()`, `.mapErr()`, `.andThen()` for composing; ESLint plugin available; no external peer deps
- **Cons**: implemented as classes (Ok, Err), not plain objects — slightly heavier; maintainability concern (many open PRs, slower responses from maintainer as of 2025); class-based implementation makes it harder to extend with custom behavior; `verbatimModuleSyntax` requires careful import style
- **Effort**: Low

### Option B: Custom `Result<T, E>` union type — RECOMMENDED

```typescript
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- **Pros**: zero dependency; perfectly idiomatic with TypeScript's discriminated unions and `strict` mode; exhaustive narrowing with `if (result.ok)` — no library to learn; fully tree-shakable; composable with `async/await` (return `Promise<Result<T, E>>`); easy to add `mapResult`, `chainResult` helpers later; `exactOptionalPropertyTypes` is satisfied because we never use optional fields on Result; the user LEARNS the pattern rather than abstracting it behind a library
- **Cons**: no built-in `.map()` chaining (you write helpers manually); verbose for deep chains; async chains require explicit wrapping
- **Effort**: Low

### Option C: fp-ts / effect

- **Pros**: full functional programming toolkit; powerful composition
- **Cons**: massive learning curve; enormous bundle; overkill for this project; contradicts "learning DDD" goal — would shift focus to category theory
- **Effort**: High
- **Verdict**: REJECTED for MVP

**RECOMMENDATION**: Option B — custom `Result<T, E>`. The project is explicitly for learning. Understanding how to build the pattern from scratch is more valuable than reaching for neverthrow. A thin `helpers.ts` with `mapResult` and `chainResult` utilities covers 95% of needs. If the user finds chaining painful after 3+ aggregates, upgrade to neverthrow at that point.

---

## Topic 5: Validation Strategy with Zod

Three layers; recommendation is "validate at boundary, trust internally":

### Layer 1: API boundary (Lambda handler) — MANDATORY

- HTTP `event.body` is parsed and validated with Zod schema from `@smart-wallet/shared-types`
- If validation fails → return 400 immediately; do NOT call use case
- This is the "anti-corruption layer" for untrusted external input

### Layer 2: Use case input — OPTIONAL (type only)

- Use case accepts the already-validated Zod-inferred type (DTO)
- No re-validation; the type system guarantees the shape
- The use case constructs domain entities from the DTO

### Layer 3: Domain entity constructor — DOMAIN INVARIANTS ONLY

- Entity constructors enforce business rules (e.g., amount > 0, category is valid, wallet name is not empty)
- These are NOT Zod validations — they are domain invariants expressed as `Result<T, DomainError>`
- Example: `Transaction.create({ amount, type, categoryId }) => Result<Transaction, TransactionError>`

Zod schema location: `packages/shared-types/src/schemas/` — schemas export both the Zod schema and the inferred type:

```typescript
// shared-types/src/schemas/transaction.ts
export const CreateTransactionSchema = z.object({ ... });
export type CreateTransactionDTO = z.infer<typeof CreateTransactionSchema>;
```

The handler imports `CreateTransactionSchema` to parse, passes `CreateTransactionDTO` to the use case.
Domain package has NO dependency on Zod — pure TypeScript types only.

This "validate at boundary, domain invariants in constructors" pattern is the standard Clean Architecture approach and matches the locked stack.

---

## Topic 6: CDK + Serverless Framework Coordination

Three options for sharing ARNs/resource IDs:

### Option A: SSM Parameter Store — RECOMMENDED

CDK stack writes SSM parameters at deploy time:

```typescript
// infra-cdk/src/stacks/WalletStack.ts
new ssm.StringParameter(this, 'TableNameParam', {
  parameterName: '/smart-wallet/prod/dynamo/table-name',
  stringValue: table.tableName,
});
new ssm.StringParameter(this, 'TableArnParam', {
  parameterName: '/smart-wallet/prod/dynamo/table-arn',
  stringValue: table.tableArn,
});
new ssm.StringParameter(this, 'UserPoolIdParam', {
  parameterName: '/smart-wallet/prod/cognito/user-pool-id',
  stringValue: userPool.userPoolId,
});
```

Serverless Framework reads at deploy time in `serverless.yml`:

```yaml
provider:
  environment:
    TABLE_NAME: ${ssm:/smart-wallet/prod/dynamo/table-name}
  iam:
    role:
      statements:
        - Effect: Allow
          Action: [dynamodb:GetItem, ...]
          Resource: ${ssm:/smart-wallet/prod/dynamo/table-arn}
```

- **Pros**: clean separation; CDK owns infrastructure, Serverless owns Lambda deployment; no hardcoding; works for solo dev; SSM free tier covers 10,000 API calls/month (more than enough); parameters are auditable and discoverable in AWS Console
- **Cons**: CDK must be deployed BEFORE Serverless deploy (correct ordering); SSM has 40 TPS default limit — use deploy-time only, not runtime (Lambda reads TABLE_NAME from env var, NOT from SSM at invocation time)
- **Effort**: Low

### Option B: CloudFormation Outputs cross-stack reference

- **Pros**: native CF mechanism, no extra service
- **Cons**: tight coupling between CDK stack and Serverless stack via CF exports; CF export names are global per region; CF refuses to delete an export if another stack imports it — creates deployment lock-in issues; worse developer experience than SSM for solo dev
- **Effort**: Medium
- **Verdict**: Avoid

### Option C: Hardcoded values

- **Pros**: zero coordination complexity
- **Cons**: breaks every time resources are recreated; environment-specific values in code; security anti-pattern
- **Verdict**: REJECTED

**RECOMMENDATION**: SSM Parameter Store. CDK writes parameters, Serverless reads them at deploy-time via `${ssm:...}`. Lambda reads environment variables at runtime (TABLE_NAME, USER_POOL_ID) — never calls SSM at invocation time.

Deployment order: `pnpm --filter infra-cdk deploy` → `pnpm --filter infra-sls deploy`

---

## Topic 7: JWT Auth in Lambda — JWT Authorizer vs Lambda Authorizer

### Option A: API Gateway HTTP API JWT Authorizer (built-in) — RECOMMENDED

Configure in API Gateway HTTP API to point at Cognito User Pool issuer URL and audience (app client ID). API Gateway validates the JWT cryptographically before the Lambda handler is invoked.

```yaml
# serverless.yml
httpApi:
  authorizers:
    cognitoJwt:
      type: jwt
      identitySource: $request.header.Authorization
      issuerUrl: https://cognito-idp.us-east-1.amazonaws.com/{userPoolId}
      audience:
        - !Sub '${ssm:/smart-wallet/prod/cognito/user-pool-client-id}'
```

- **Pros**: zero Lambda code for auth; no cold starts from auth layer; API Gateway validates RS256 signature natively; free (no additional Lambda invocations for auth); extremely low latency; Cognito handles token rotation automatically; Lambda handler just reads `event.requestContext.authorizer.jwt.claims.sub` for userId
- **Cons**: no custom logic (cannot check group membership, custom claims, or DB lookups in auth); scope-based authorization only; if you need "only admins can delete wallets" you'd need to check inside the handler (or add a Lambda authorizer later)
- **For MVP**: all users have the same permissions on their own resources — the JWT authorizer is sufficient. Handler-level ownership check (userId from JWT claim must match resource owner) is the only additional guard needed.
- **Effort**: Very Low

### Option B: Custom Lambda Authorizer

- **Pros**: arbitrary auth logic; can check database, custom claims, group membership
- **Cons**: adds ~50-150ms latency per request (extra Lambda invocation); costs extra Lambda invocations; adds cold start risk; requires maintaining auth Lambda separately; overkill for MVP with simple user-owns-resource model
- **Effort**: High
- **Verdict**: Future consideration only (if fine-grained RBAC is needed)

**RECOMMENDATION**: HTTP API JWT Authorizer pointing at Cognito. For MVP, authorization is purely "is the JWT valid AND does the userId in the JWT match the resource owner?" — no Lambda authorizer needed.

**Security note**: ALWAYS verify resource ownership in the handler (e.g., confirm the walletId belongs to the JWT's `sub`). The JWT authorizer only proves authentication, not authorization.

---

## Recommendation Summary

| Topic | Recommendation |
|-------|---------------|
| DDD Aggregates | Option B — Wallet and Transaction as separate aggregates; TransactWrite for balance |
| DynamoDB schema | PK=USER#{userId}, SK=WALLET#{walletId} / TXN#{walletId}#{date}#{id}; GSI1 for by-category queries; denormalized balance counter |
| Domain folder structure | Feature-sliced (screaming architecture) — wallet/, transaction/, category/, user/, shared/, usecases/ |
| Result pattern | Custom `Result<T, E>` discriminated union — zero dependency, idiomatic TS strict |
| Validation | Zod at API boundary (shared-types); domain invariants in entity constructors returning Result |
| CDK + SLS coordination | SSM Parameter Store — CDK writes, Serverless reads at deploy-time, Lambda reads from env vars at runtime |
| JWT Auth | HTTP API JWT Authorizer (built-in) pointing at Cognito User Pool |

---

## Risks

1. **TransactWriteItems cost**: Each `addTransaction` call costs 2x WCU. At free tier (25 WCU/month provisioned, or on-demand), this is negligible for MVP (<1000 transactions/month). Budget alarm is already planned — keep it.

2. **DDB local transaction support**: DynamoDB Local 2.5.4 supports `TransactWriteItems` — confirmed. No risk for local dev.

3. **Serverless Framework + ESM**: `@smart-wallet/api` uses `type: module` (ESM). Serverless Framework v3+ supports ESM bundling with esbuild plugin. Must configure `esbuild` bundler in `serverless.yml`; bundled output is CJS by default. Recommend using `serverless-esbuild` plugin with `format: esm` and Node 22 runtime. This is a non-trivial configuration step that must be validated early.

4. **`verbatimModuleSyntax` + DynamoDB SDK**: `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` use CommonJS. With `verbatimModuleSyntax`, you must use `import type` for type-only imports and regular `import` for values. The SDK is compatible but requires attention in imports.

5. **Cognito free tier**: 50,000 MAU free on Cognito. For a personal finance app with 1-5 users, zero cost risk.

6. **Single GSI for MVP is a constraint**: If new access patterns emerge (e.g., list ALL transactions across ALL wallets for a user regardless of wallet), the current schema requires a new GSI or a full-table scan with filter. This is acceptable for MVP; document it as a known limitation.

7. **Category design decision needed**: Predefined categories (enum in shared-types) vs user-creatable custom categories (separate DDB entity). Both need to be defined before schema is finalized in proposal. Recommend: predefined enum in shared-types + user custom categories as DDB items.

## Ready for Proposal

Yes. All seven topic areas are resolved with clear recommendations. The proposal phase can formalize these into a structured change spec without reopening architecture questions.
