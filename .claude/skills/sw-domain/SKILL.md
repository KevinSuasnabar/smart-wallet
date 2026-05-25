---
name: sw-domain
description: "Trigger: domain entity, value object, aggregate, use case, repository interface, DDD, Result type. Smart-wallet domain layer patterns."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when creating or editing anything inside `packages/domain/src/`.

## Hard Rules

- `Result<T, E>` is `{ ok: true; value: T } | { ok: false; error: E }` — use `ok(value)` / `err(error)` constructors. Never throw from domain code.
- **Entities** extend `Entity<TId>` (equality by id). **Aggregates** extend `AggregateRoot<TId>` (adds domain events).
- **Value Objects** extend `ValueObject<TProps>` (equality by deep props; props are frozen on construction).
- Every aggregate has exactly two construction paths:
  - `static create(props): Result<T, DomainError>` — validates, raises domain events
  - `static rehydrate(id, props): T` — trusts persisted data; ONLY called from adapters
- **Use cases** follow the factory pattern: `makeX(deps): (input) => Promise<Result<Output, Error>>`
- **Repository interfaces** live in `domain/src/{aggregate}/` — implementations belong in `api/src/adapters/`
- Domain never imports from `api`, `infra-*`, or any I/O package
- Side effects (clock, id generation) are injected via ports: `Clock` and `IdGenerator`
- Domain errors extend `DomainError` with a `tag` string discriminant (e.g. `tag = 'WalletNotFound'`)
- Domain events are added via `addDomainEvent()` inside `create()`; pulled via `pullDomainEvents()` after persist

## Decision Gates

| Need | Action |
|------|--------|
| New entity with identity | Extend `Entity<TId>` |
| New entity that publishes events | Extend `AggregateRoot<TId>` |
| Immutable concept compared by value | Extend `ValueObject<TProps>` |
| New ID type | Extend `ValueObject<{value:string}>`, validate UUID regex |
| Cross-aggregate query | Add method to repository interface, NOT a domain service |

## Execution Steps

1. Create `{Aggregate}.ts`, `{Aggregate}Id.ts`, `{Aggregate}Error.ts`, `{Aggregate}Repository.ts` in `domain/src/{aggregate}/`
2. Add `static create()` with full validation returning `Result`
3. Add `static rehydrate()` with no validation
4. Add mutation methods that return `Result<void, Error>` and never mutate on failure (snapshot-rollback pattern)
5. Export everything from `domain/src/{aggregate}/index.ts` and `domain/src/index.ts`
