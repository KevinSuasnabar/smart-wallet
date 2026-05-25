---
name: sw-hexagonal
description: "Trigger: architecture, hexagonal, clean architecture, ports and adapters, layers, dependency rule, where does X go. Smart-wallet architectural boundaries."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when making architectural decisions: where a new file goes, what a layer can import, how to wire a new capability.

## Hard Rules

- **Dependency rule**: domain ← api ← infra. Never reverse. Domain imports nothing from api or infra.
- **Ports** (interfaces): `Clock`, `IdGenerator`, and all `*Repository` interfaces live in `packages/domain/`
- **Adapters** (implementations): DynamoDB repos, Cognito adapter, SystemClock, UuidIdGenerator live in `packages/api/src/adapters/`
- **Composition root**: `api/src/composition/container.ts` is the ONLY place adapters are instantiated and wired to use-case factories
- **Entry points**: `api/src/handlers/` for REST; `api/src/telegram/` for bot — both call `container.*`
- **Shared types**: `packages/shared-types/` holds Zod schemas and TS types shared between web and api — no domain logic here
- **Web** (`packages/web/`) imports from `@smart-wallet/shared-types` only — never from `@smart-wallet/domain` or `@smart-wallet/api`
- **infra-sls**: one-line proxy re-exports only (`export { main } from '@smart-wallet/api/handlers/...'`); no logic here
- Adding a new capability = new port interface in domain → new adapter in api → wire in container → expose in handler

## Layer Map

```
packages/domain/          ← pure domain (no I/O)
  src/{aggregate}/
    {Aggregate}.ts         entity / aggregate
    {Aggregate}Repository.ts  port (interface)
    usecases/makeX.ts      use-case factory

packages/api/
  src/adapters/            adapters (implement ports)
  src/composition/         composition root
  src/handlers/            entry points (REST)
  src/telegram/            entry points (bot)
  src/shared/boundary/     input parsing + output formatting

packages/shared-types/    Zod schemas, DTOs (web ↔ api contract)
packages/web/             React frontend
packages/infra-sls/       Serverless Framework (proxy re-exports + serverless.yml)
packages/infra-cdk/       CDK (DynamoDB, Cognito, CloudFront)
```

## Decision Gates

| Question | Answer |
|----------|--------|
| Where does validation of user input go? | Handler boundary (`api/src/handlers/`) using Zod |
| Where does business rule validation go? | `domain/src/{aggregate}/{Aggregate}.ts` static create/methods |
| Where does DynamoDB query logic go? | `api/src/adapters/dynamodb/repositories/` |
| Where does money formatting go? | `api/src/shared/boundary/moneyBoundary.ts` |
| Where do shared TS types go? | `packages/shared-types/` |
| Can a handler call a repo directly? | No — always via `container.{useCase}()` |
