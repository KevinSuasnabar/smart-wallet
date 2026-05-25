---
name: sw-serverless
description: "Trigger: Serverless Framework, serverless.yml, new Lambda function, new route, esbuild, HTTP API, JWT authorizer, infra-sls. Smart-wallet Serverless Framework patterns."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when editing `packages/infra-sls/serverless.yml` or adding files to `packages/infra-sls/src/handlers/`.

## Hard Rules

- **Proxy files only** — `infra-sls/src/handlers/**/*.ts` are one-line re-exports: `export { main } from '@smart-wallet/api/handlers/{resource}/{action}.js'`; no logic here ever
- **HTTP API v2** — all routes use `httpApi`, not `http` (API Gateway v1); event syntax is `- httpApi: { path, method, authorizer }`
- **JWT authorizer** — every protected route must declare `authorizer: cognitoJwtAuthorizer`; the authorizer is only active in prod (local uses `noAuth: true`)
- **Static routes before parametric** — in `serverless.yml` functions list, specific paths MUST appear before `{param}` paths:
  ```yaml
  # CORRECT
  recurringMaterialize:    # /recurring/materialize
    ...
  getRecurring:            # /recurring/{recurringId}
  ```
- **`AWS_REGION` is reserved** — never add it to `provider.environment`; Lambda runtime injects it automatically — setting it causes deploy failure
- **Runtime**: `nodejs22.x`; **memory**: 256 MB; **timeout**: 10 s (defaults in provider — don't repeat per function unless overriding)
- **esbuild bundler** (`serverless-esbuild`) — AWS SDK v3 is bundled (not external) for local dev compatibility; do not add `@aws-sdk` to `externals`
- **SSM at deploy time** — prod config (table names, Cognito IDs) is read from SSM during `sls deploy`; never hardcode ARNs in `serverless.yml`

## Adding a New Endpoint (complete checklist)

- [ ] Proxy file: `infra-sls/src/handlers/{resource}/{action}.ts` — one-line re-export
- [ ] Entry in `serverless.yml` under `functions:`, using the correct method + path
- [ ] Add `authorizer: cognitoJwtAuthorizer` to the event
- [ ] Verify route order: static before parametric
- [ ] Run `pnpm typecheck` — `infra-sls` uses `moduleResolution: NodeNext` (differs from base `Bundler`)

## Function Entry Pattern

```yaml
functions:
  createMyResource:
    handler: src/handlers/myResource/createMyResource.main
    events:
      - httpApi:
          path: /my-resources
          method: post
          authorizer:
            name: cognitoJwtAuthorizer
```

## Local Dev Notes

- `serverless-offline` on port 3000; `noAuth: true` disables JWT validation locally
- Auth in local mode: `X-Mock-User-Id: <any-uuid>` header or `Authorization: Bearer <JWT>` decoded without signature verification
- Default mock UUID: `11111111-1111-4111-8111-111111111111`
- `infra-sls` tsconfig uses `moduleResolution: NodeNext` — not the same as base `Bundler`
