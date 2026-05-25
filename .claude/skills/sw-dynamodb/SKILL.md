---
name: sw-dynamodb
description: "Trigger: DynamoDB, single-table, key builder, GSI, TransactWriteItems, query, mapper, cursor, repository implementation. Smart-wallet DynamoDB patterns."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when writing DynamoDB queries, mappers, or repository implementations.

## Hard Rules

- **Never hardcode key strings** — all PK/SK values come from `keyBuilders.ts` functions only
- `PK` is always `userPK(userId)` — all user data scoped under the user's partition
- `rehydrate()` in mappers, never `create()` — repositories trust persisted data
- Multi-entity atomic writes use `TransactWriteItems` — never two separate writes for consistency-critical ops
- Wallet balance updates MUST be atomic with the transaction write (one `TransactWriteItems`)
- Cursor-based pagination only: `encodeCursor()` / `decodeCursor()` from `cursor.ts` — no offset pagination
- TTL attribute is named `ttl` (epoch seconds) — DynamoDB auto-expires idempotency records
- DDB client instance lives only in `DynamoDBClient.ts` — import `ddb`, `TABLE_NAME`, `GSI1_NAME` from there

## Key Patterns

```
PK                    SK
userPK(userId)        walletSK(walletId)
userPK(userId)        transactionSK(walletId, occurredAtIso, txnId)  ← date-sortable
userPK(userId)        categorySK(categoryId)
userPK(userId)        recurringSK(recurringId)
userPK(userId)        idempotencySK(hashedKey)

GSI1PK (= PK)         GSI1SK
userPK(userId)        transactionGsi1SK(categoryId, occurredAtIso, txnId)  ← category queries
userPK(userId)        recurringGsi1SK(nextOccurrenceAtIso, recurringId)    ← pending materializations
```

## Decision Gates

| Need | Pattern |
|------|---------|
| New entity type | New SK prefix function in `keyBuilders.ts`, new mapper, new repository |
| Query by date range | `KeyConditionExpression: SK BETWEEN :from AND :to` on `transactionSK` prefix |
| Query by category + date | Use GSI1 with `transactionGsi1SK` prefix |
| Atomic balance update | `TransactWriteItems` — transaction Put + wallet balance Update |
| Auto-expire records | Add `ttl: epochSeconds` attribute, set `TimeToLiveSpecification` in CDK |

## Repository Implementation Pattern

```typescript
// Always import from keyBuilders — never hardcode
import { userPK, walletSK } from '../keyBuilders.js';

// Mappers call rehydrate(), never create()
const entity = MyEntity.rehydrate(id, { ...itemProps });

// Atomic writes
await ddb.send(new TransactWriteCommand({
  TransactItems: [
    { Put: { TableName: TABLE_NAME, Item: entityItem, ConditionExpression: 'attribute_not_exists(PK)' } },
    { Update: { TableName: TABLE_NAME, Key: walletKey, UpdateExpression: 'ADD balance :delta', ... } },
  ]
}));
```
