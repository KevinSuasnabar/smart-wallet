# Smart Wallet — AGENTS.md

## Stack (condensed)

pnpm + Turborepo monorepo, 6 packages under `packages/*`:

| Package | Role |
|---|---|
| `domain` | Pure DDD: entities, value objects, `makeX` use-case factories, `Result<T,E>` type |
| `api` | Adapters (DynamoDB, Cognito, System), middleware (withAuth, withValidation, withErrorHandler), handler functions, composition root (`container.ts`) |
| `infra-sls` | Serverless Framework config; proxy handlers that re-export from `@smart-wallet/api` via one-line files (`export { main } from '...'`) |
| `infra-cdk` | CDK stacks for DynamoDB table, Cognito User Pool, S3/CloudFront (non-Lambda infra) |
| `shared-types` | Zod schemas + TS types shared frontend/backend (`@smart-wallet/shared-types`) |
| `web` | React + Vite + Tailwind v3 + shadcn/ui + React Router |

## Key commands

```bash
pnpm build           # turbo run build
pnpm dev             # turbo run dev
pnpm test            # turbo run test (ALL packages: echo 'no tests yet' && exit 0)
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit on each package
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
pnpm clean           # turbo run clean && rm -rf node_modules .turbo
pnpm ddb:up          # docker compose up -d dynamodb dynamodb-admin
pnpm ddb:down        # docker compose down
pnpm ddb:init        # pnpm --filter @smart-wallet/infra-sls init:local
pnpm smoke           # bash packages/infra-sls/smoke-tests/smoke.sh
pnpm smoke:prod      # AWS_PROFILE=tomishi-account pnpm smoke:prod
```

## Local dev loop (full local, no AWS account)

**Terminal 1:**
```bash
pnpm install && pnpm ddb:up && pnpm ddb:init
```

**Terminal 2:**
```bash
cd packages/infra-sls && pnpm dev    # serverless-offline on :3000
```

**Terminal 3:**
```bash
pnpm smoke    # 12-step smoke test against localhost:3000
```

Key facts:
- DynamoDB Local runs `-inMemory` — **data lost on container restart**; re-run `pnpm ddb:init` after each `pnpm ddb:down`
- `serverless-offline` bypasses the Cognito JWT authorizer (`noAuth: true` in `serverless.yml`)
- Offline auth uses `X-Mock-User-Id` header with any UUID (fast path), or `Authorization: Bearer <JWT>` (decoded without signature verification)
- Default mock UUID: `11111111-1111-4111-8111-111111111111`
- Smoke test uses `python3` for JSON parsing (NOT `jq`)
- **Currencies**: only `USD` and `PEN` accepted (hard constraint in domain)

## Architecture

### Lambda handler wiring pattern

```
serverless.yml → infra-sls/src/handlers/{resource}/{action}.ts (proxy re-export)
                   → @smart-wallet/api/handlers/{resource}/{action}.ts (actual handler)
                       → container.{useCase}(input)  ← composition/container.ts
                           → @smart-wallet/domain use-case (makeX factory)
```

Each handler is wrapped in: `withErrorHandler(withAuth(handler))`.

Middleware (`packages/api/src/middleware/`):
- `withAuth`: reads `userId` from JWT claims (prod) or `X-Mock-User-Id`/Bearer header (offline)
- `withValidation`: Zod schema validation on request body
- `withErrorHandler`: catches thrown errors, returns 500

**Composition root** (`api/src/composition/container.ts`): adapter singletons at module scope → passed to `makeX` use-case factories. No DI framework — manual wiring.

### Domain patterns
- Custom `Result<T, E>` type (discriminated union: `{ ok: true, value: T } | { ok: false, error: E }`)
- Use cases follow factory pattern: `makeCreateWallet({ walletRepo, idGen, clock })` returns a function
- All repositories are interfaces defined in domain, implemented in api's `adapters/dynamodb/repositories/`

### DynamoDB single-table
- PK/SK compound key, GSI1 for category queries, TTL on `ttl` attribute for idempotency records

### Important constraints
- `AWS_REGION` is **reserved** by Lambda runtime — cannot be set in `serverless.yml` `provider.environment`
- `package.json` `packageManager` field is authoritative; CI skips `version:` in `pnpm/action-setup`
- Static route ordering requirement in `serverless.yml`: `/recurring/materialize` MUST be listed BEFORE `/recurring/{recurringId}`
- infra-sls `tsconfig.json` uses `moduleResolution: "NodeNext"` (differs from base `"Bundler"`)
- CI runs `typecheck` → `build` only. `format:check` is **intentionally disabled** (~200 files of pre-existing drift, Husky/lint-staged handles new commits)
- `ENOENT` on `env.ts`? The `env.ts` file is at `packages/api/src/env.ts`; don't look at the root

## Deployment

**Only prod.** No staging environment.

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy-backend.yml` | push to main | Reads Cognito/DynamoDB config from SSM → `sls deploy --stage prod` → `pnpm smoke:prod` |
| `deploy-frontend.yml` | push to main (path-filtered) | Reads S3/CloudFront config from SSM → `vite build` with prod env → S3 sync (hashed files: 1yr cache, HTML: no-cache) → CloudFront invalidation |
| `ci.yml` | PR to main, push to main | `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm build` |

- `deploy-frontend` path-filtered: only triggers on changes to `packages/web/`, `packages/shared-types/`, `pnpm-lock.yaml`, `package.json`, `turbo.json`, `tsconfig.base.json`, or the workflow itself
- Deploy concurrency: **never cancel in-flight** (CloudFormation/S3 mid-update would be dangerous)
- Frontend: Vite env vars (`VITE_API_BASE_URL`, `VITE_COGNITO_*`) baked at build time via `pnpm --filter @smart-wallet/web build`

## Testing status

**No unit/integration tests exist yet.** Every package's `test` script is `echo 'no tests yet' && exit 0`. No test framework is installed. The only verification mechanisms are:
- `pnpm typecheck` (TypeScript compilation)
- `pnpm build` (Turborepo build chain)
- `pnpm smoke` (bash-based API smoke test, 12 scenarios)
- `pnpm smoke:prod` (same smoke against production, creates ephemeral Cognito user)

## Conventions

- **Conventional commits** enforced by commitlint (pre-commit hook + CI)
- **lint-staged**: runs `prettier --write` + `eslint --fix` on staged `*.{ts,tsx,js,jsx,mjs,cjs}`, `prettier --write` on `*.{json,md,yml,yaml,css}`
- **TypeScript strict**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`
- **Import style**: `@typescript-eslint/consistent-type-imports: error` — use `import type` for type-only imports
- **SDD workflow**: openspec/changes tracks SDD artifacts (proposals, specs, designs, tasks per change)

## Predefined categories

**Income:** `income:salary`, `income:freelance`, `income:investment`, `income:gift`, `income:other`

**Expense:** `expense:food`, `expense:transport`, `expense:housing`, `expense:utilities`, `expense:health`, `expense:entertainment`, `expense:education`, `expense:clothing`, `expense:other`

## Web frontend notes

- `VITE_API_BASE_URL` defaults to `http://localhost:3000` in dev (`.env.development`), prod URL at build time
- Vite config aliases `global` to `globalThis` (Cognito SDK compat) — in both `define` and `optimizeDeps.esbuildOptions.define`
- Tailwind theme adapted from `DESIGN.md`: monochrome core + pastel `block-*` colors, pill-shaped CTAs
- UI components use shadcn/ui style (Radix primitives + CVA + `tailwind-merge`)
