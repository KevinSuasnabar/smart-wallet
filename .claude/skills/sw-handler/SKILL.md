---
name: sw-handler
description: "Trigger: new endpoint, Lambda handler, REST route, API handler, new use case wiring. Smart-wallet handler and container wiring pattern."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when creating a new REST endpoint or wiring a new use case into the API.

## Hard Rules

- Every handler exports `export const main = withErrorHandler(withAuth(handler))`
- Handler receives `AuthenticatedEvent` — user identity is `event.userId` (UUID string)
- Validate path params with `validatePath(Schema, event.raw)`, body with `validateBody`, query with `validateQuery` — all from `middleware/index.js`
- Money input: always convert decimal string → cents at handler boundary via `parseAmountForCurrency()` from `shared/boundary/`
- Money output: always format cents → string via `formatMoneyForResponse()` or `formatCentsForResponse()`
- Map domain errors to HTTP via `domainErrorToResponse(result.error)` from `shared/errors.ts`
- Response helpers: `ok(body)` → 200, `created(body)` → 201, `badRequest(code, detail)` → 400
- Handlers call `container.{useCase}(input)` only — never instantiate repos or use cases directly
- Every new use case must be added to `container.ts` and exported from the `container` object

## Checklist for a New Endpoint

- [ ] Handler file: `api/src/handlers/{resource}/{action}.ts` — export `main`
- [ ] Proxy file: `infra-sls/src/handlers/{resource}/{action}.ts` — one-line re-export
- [ ] Route: add to `infra-sls/serverless.yml` under `functions`
- [ ] Use case: add `makeX(deps)` call to `container.ts`
- [ ] Zod schema: add request/response schemas to `shared-types/src/`
- [ ] Type check: `pnpm typecheck` must pass

## Static Route Ordering (serverless.yml)

Specific routes MUST come before parametric ones. Example:
```yaml
# CORRECT — specific before parametric
/recurring/materialize    # must be BEFORE /recurring/{recurringId}
/recurring/{recurringId}
```

## Handler Skeleton

```typescript
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler, validateBody } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  // 1. validate input
  // 2. call container.useCase(input)
  // 3. map result to response
};

export const main = withErrorHandler(withAuth(handler));
```
