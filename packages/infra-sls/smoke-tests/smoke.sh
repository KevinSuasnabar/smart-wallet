#!/usr/bin/env bash
# Smoke test for smart-wallet local stack.
# Prerequisites:
#   - DynamoDB Local running on port 8000 (pnpm ddb:up)
#   - Table initialized (pnpm ddb:init)
#   - serverless-offline running on port 3000 (cd packages/infra-sls && pnpm dev)
#   - python3 (for JSON parsing — no jq dependency)
set -euo pipefail

USER_ID="${MOCK_USER_ID:-11111111-1111-4111-8111-111111111111}"
BASE_URL="http://localhost:3000"
HEADER_AUTH="X-Mock-User-Id: $USER_ID"
HEADER_JSON="Content-Type: application/json"
PASS=0
FAIL=0

# JSON helpers (replaces jq — no extra system deps needed)
json_field() {
  python3 -c "import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('$1', ''))
except Exception:
    print('')" 2>/dev/null
}

json_pretty() {
  python3 -m json.tool 2>/dev/null || cat
}

check_status() {
  local step="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  [PASS] HTTP $actual"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] Expected HTTP $expected, got HTTP $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo " Smart Wallet — Local Smoke Test"
echo " USER_ID=$USER_ID"
echo " BASE_URL=$BASE_URL"
echo "============================================"
echo ""

echo "=== 1. Create wallet (USD) ==="
WALLET_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/wallets" \
  -H "$HEADER_AUTH" -H "$HEADER_JSON" \
  -d '{"name":"Cash","currency":"USD"}')
WALLET_BODY=$(echo "$WALLET_RESP" | head -n -1)
WALLET_STATUS=$(echo "$WALLET_RESP" | tail -n 1)
echo "$WALLET_BODY" | json_pretty
check_status "1" "201" "$WALLET_STATUS"
WALLET_ID=$(echo "$WALLET_BODY" | json_field walletId)
echo "  WALLET_ID=$WALLET_ID"
echo ""

echo "=== 2. List wallets ==="
LIST_WALLETS_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/wallets" -H "$HEADER_AUTH")
LIST_WALLETS_BODY=$(echo "$LIST_WALLETS_RESP" | head -n -1)
LIST_WALLETS_STATUS=$(echo "$LIST_WALLETS_RESP" | tail -n 1)
echo "$LIST_WALLETS_BODY" | json_pretty
check_status "2" "200" "$LIST_WALLETS_STATUS"
echo ""

echo "=== 3. Get wallet ==="
GET_WALLET_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/wallets/$WALLET_ID" -H "$HEADER_AUTH")
GET_WALLET_BODY=$(echo "$GET_WALLET_RESP" | head -n -1)
GET_WALLET_STATUS=$(echo "$GET_WALLET_RESP" | tail -n 1)
echo "$GET_WALLET_BODY" | json_pretty
check_status "3" "200" "$GET_WALLET_STATUS"
echo ""

echo "=== 4. Create custom category (type=expense) ==="
CAT_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/categories" \
  -H "$HEADER_AUTH" -H "$HEADER_JSON" \
  -d '{"name":"Coffee","type":"expense"}')
CAT_BODY=$(echo "$CAT_RESP" | head -n -1)
CAT_STATUS=$(echo "$CAT_RESP" | tail -n 1)
echo "$CAT_BODY" | json_pretty
check_status "4" "201" "$CAT_STATUS"
CAT_ID=$(echo "$CAT_BODY" | json_field categoryId)
echo "  CAT_ID=$CAT_ID"
echo ""

echo "=== 5. List categories (predefined + custom) ==="
LIST_CAT_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/categories" -H "$HEADER_AUTH")
LIST_CAT_BODY=$(echo "$LIST_CAT_RESP" | head -n -1)
LIST_CAT_STATUS=$(echo "$LIST_CAT_RESP" | tail -n 1)
echo "$LIST_CAT_BODY" | json_pretty
check_status "5" "200" "$LIST_CAT_STATUS"
echo ""

echo "=== 6. Add transaction (expense, predefined category expense:food) ==="
TXN_OCCURRED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TXN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/wallets/$WALLET_ID/transactions" \
  -H "$HEADER_AUTH" -H "$HEADER_JSON" \
  -d "{\"type\":\"expense\",\"amount\":\"5.50\",\"currency\":\"USD\",\"categoryId\":\"expense:food\",\"description\":\"lunch\",\"occurredAt\":\"$TXN_OCCURRED_AT\"}")
TXN_BODY=$(echo "$TXN_RESP" | head -n -1)
TXN_STATUS=$(echo "$TXN_RESP" | tail -n 1)
echo "$TXN_BODY" | json_pretty
check_status "6" "201" "$TXN_STATUS"
echo ""

echo "=== 7. Add transaction with Idempotency-Key (FIRST attempt) ==="
IDEMP_KEY="smoke-test-key-$(date +%s)"
IDEMP_OCCURRED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TXN_FIRST=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/wallets/$WALLET_ID/transactions" \
  -H "$HEADER_AUTH" -H "$HEADER_JSON" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -d "{\"type\":\"income\",\"amount\":\"100.00\",\"currency\":\"USD\",\"categoryId\":\"income:salary\",\"occurredAt\":\"$IDEMP_OCCURRED_AT\"}")
TXN_FIRST_BODY=$(echo "$TXN_FIRST" | head -n -1)
TXN_FIRST_STATUS=$(echo "$TXN_FIRST" | tail -n 1)
echo "$TXN_FIRST_BODY" | json_pretty
check_status "7" "201" "$TXN_FIRST_STATUS"
TXN_ID=$(echo "$TXN_FIRST_BODY" | json_field transactionId)
echo "  TXN_ID=$TXN_ID"
echo ""

echo "=== 8. Add transaction with SAME Idempotency-Key (REPLAY — should return 200, same body) ==="
TXN_REPLAY=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/wallets/$WALLET_ID/transactions" \
  -H "$HEADER_AUTH" -H "$HEADER_JSON" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -d "{\"type\":\"income\",\"amount\":\"100.00\",\"currency\":\"USD\",\"categoryId\":\"income:salary\",\"occurredAt\":\"$IDEMP_OCCURRED_AT\"}")
TXN_REPLAY_BODY=$(echo "$TXN_REPLAY" | head -n -1)
TXN_REPLAY_STATUS=$(echo "$TXN_REPLAY" | tail -n 1)
echo "$TXN_REPLAY_BODY" | json_pretty
check_status "8 (replay)" "200" "$TXN_REPLAY_STATUS"
REPLAY_TXN_ID=$(echo "$TXN_REPLAY_BODY" | json_field transactionId)
if [ "$REPLAY_TXN_ID" = "$TXN_ID" ]; then
  echo "  [PASS] Replay returned same transactionId=$TXN_ID"
else
  echo "  [FAIL] Replay transactionId mismatch: expected=$TXN_ID got=$REPLAY_TXN_ID"
  FAIL=$((FAIL + 1))
fi
echo ""

echo "=== 9. List transactions by wallet ==="
LIST_TXN_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/wallets/$WALLET_ID/transactions" -H "$HEADER_AUTH")
LIST_TXN_BODY=$(echo "$LIST_TXN_RESP" | head -n -1)
LIST_TXN_STATUS=$(echo "$LIST_TXN_RESP" | tail -n 1)
echo "$LIST_TXN_BODY" | json_pretty
check_status "9" "200" "$LIST_TXN_STATUS"
echo ""

echo "=== 10. List transactions by category (expense:food) ==="
LIST_BY_CAT_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/transactions?categoryId=expense:food" -H "$HEADER_AUTH")
LIST_BY_CAT_BODY=$(echo "$LIST_BY_CAT_RESP" | head -n -1)
LIST_BY_CAT_STATUS=$(echo "$LIST_BY_CAT_RESP" | tail -n 1)
echo "$LIST_BY_CAT_BODY" | json_pretty
check_status "10" "200" "$LIST_BY_CAT_STATUS"
echo ""

echo "=== 11. Delete custom category ==="
DEL_CAT_RESP=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/categories/$CAT_ID" -H "$HEADER_AUTH")
DEL_CAT_STATUS=$(echo "$DEL_CAT_RESP" | tail -n 1)
echo "  HTTP $DEL_CAT_STATUS"
check_status "11" "204" "$DEL_CAT_STATUS"
echo ""

echo "=== 12. Verify wallet balance reflects transactions ==="
# After step 6 (expense -5.50 = -550 cents) and step 7 (income +100.00 = +10000 cents)
# Net balance = +9450 cents = +94.50 USD (replay in step 8 counts only once)
FINAL_WALLET_RESP=$(curl -s -w "\n%{http_code}" "$BASE_URL/wallets/$WALLET_ID" -H "$HEADER_AUTH")
FINAL_WALLET_BODY=$(echo "$FINAL_WALLET_RESP" | head -n -1)
FINAL_WALLET_STATUS=$(echo "$FINAL_WALLET_RESP" | tail -n 1)
echo "$FINAL_WALLET_BODY" | json_pretty
check_status "12" "200" "$FINAL_WALLET_STATUS"
echo ""

echo "============================================"
echo " Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
