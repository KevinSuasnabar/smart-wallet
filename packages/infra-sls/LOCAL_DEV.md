# Smart Wallet — Local Development Guide

## Prerequisites

- Node 22 (`nvm use`)
- pnpm 10 (`npm i -g pnpm@10`)
- Docker (for DynamoDB Local)
- `jq` (for smoke tests: `brew install jq` / `apt install jq`)

## Startup Sequence

**Step 1 — Install dependencies (once)**
```bash
pnpm install
```

**Step 2 — Start DynamoDB Local**
```bash
pnpm ddb:up
# DynamoDB Local: http://localhost:8000
# Admin UI:       http://localhost:8001
```

**Step 3 — Initialize the table (once, or after ddb:down)**
```bash
pnpm ddb:init
# Creates smart-wallet-local table with PK/SK, GSI1, TTL on `ttl`
```

**Step 4 — Start serverless-offline**
```bash
cd packages/infra-sls
pnpm dev
# API available at http://localhost:3000
```

**Step 5 — Run smoke tests (another terminal)**
```bash
pnpm smoke
# or directly:
# MOCK_USER_ID=11111111-1111-4111-8111-111111111111 bash packages/infra-sls/smoke-tests/smoke.sh
```

## Auth in Local Mode

`serverless-offline` does **not** enforce the Cognito JWT authorizer configured in `serverless.yml`.
All requests pass through automatically.

The `withAuth` middleware detects `IS_OFFLINE=true` and reads the user identity from the
`X-Mock-User-Id` header. Use any valid UUID v4 as a mock user ID.

Default mock user ID: `11111111-1111-4111-8111-111111111111`

## Environment Variables (local)

The `pnpm dev` script sets these automatically:

| Variable | Local value |
|---|---|
| `IS_OFFLINE` | `true` |
| `DYNAMODB_ENDPOINT` | `http://localhost:8000` |
| `TABLE_NAME` | `smart-wallet-local` (default) |
| `GSI1_NAME` | `GSI1` (default) |

You can also create `.env.local` in `packages/infra-sls/` and load it manually if needed.

## Endpoint Reference

All endpoints require the `X-Mock-User-Id` header in local mode.

### Wallets

#### POST /wallets — Create wallet
```bash
curl -s -X POST http://localhost:3000/wallets \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cash","currency":"USD"}' | jq .
# Returns 201 with { walletId, name, currency, balance, createdAt, updatedAt }
```

#### GET /wallets — List wallets
```bash
curl -s http://localhost:3000/wallets \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" | jq .
# Returns 200 with { items: [...], nextCursor? }
```

#### GET /wallets/{walletId} — Get wallet
```bash
curl -s http://localhost:3000/wallets/<walletId> \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" | jq .
# Returns 200 with wallet object, or 404 if not found
```

### Transactions

#### POST /wallets/{walletId}/transactions — Add transaction
```bash
curl -s -X POST http://localhost:3000/wallets/<walletId>/transactions \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": "5.50",
    "currency": "USD",
    "categoryId": "expense:food",
    "description": "lunch",
    "occurredAt": "2026-05-12T12:00:00Z"
  }' | jq .
# Returns 201 (new) or 200 (idempotency replay)
```

With idempotency:
```bash
curl -s -X POST http://localhost:3000/wallets/<walletId>/transactions \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-123" \
  -d '{
    "type": "income",
    "amount": "100.00",
    "currency": "USD",
    "categoryId": "income:salary",
    "occurredAt": "2026-05-12T12:00:00Z"
  }' | jq .
# First call → 201. Same key repeated → 200 with identical body.
```

#### GET /wallets/{walletId}/transactions — List by wallet
```bash
curl -s "http://localhost:3000/wallets/<walletId>/transactions?limit=20" \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" | jq .
# Returns 200 with { items: [...], nextCursor? }
# Optional filters: type=expense|income, categoryId=expense:food, from=ISO, to=ISO
```

#### GET /transactions — List by category
```bash
curl -s "http://localhost:3000/transactions?categoryId=expense:food" \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" | jq .
# Returns 200 with { items: [...], nextCursor? }
```

### Categories

#### GET /categories — List categories
```bash
curl -s http://localhost:3000/categories \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" | jq .
# Returns 200 with { predefined: [...], custom: [...] }
```

#### POST /categories — Create custom category
```bash
curl -s -X POST http://localhost:3000/categories \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"name":"Coffee","type":"expense"}' | jq .
# Returns 201 with { categoryId, name, type, createdAt }
```

#### DELETE /categories/{categoryId} — Delete custom category
```bash
curl -s -X DELETE http://localhost:3000/categories/<categoryId> \
  -H "X-Mock-User-Id: 11111111-1111-4111-8111-111111111111" \
  -w "HTTP %{http_code}\n"
# Returns 204 on success, 404 if not found, 409 if predefined category
```

## Supported Currencies

USD and PEN only. Use one of these values in the `currency` field.

## Predefined Category IDs

**Income:**
- `income:salary`
- `income:freelance`
- `income:investment`
- `income:gift`
- `income:other`

**Expense:**
- `expense:food`
- `expense:transport`
- `expense:housing`
- `expense:utilities`
- `expense:health`
- `expense:entertainment`
- `expense:education`
- `expense:clothing`
- `expense:other`

## Smoke Test Script

`packages/infra-sls/smoke-tests/smoke.sh` exercises all 12 scenarios including idempotency
replay verification. Run it with `pnpm smoke` from the project root.
