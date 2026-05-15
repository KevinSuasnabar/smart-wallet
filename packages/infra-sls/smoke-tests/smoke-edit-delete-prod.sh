#!/usr/bin/env bash
# Automated end-to-end smoke test for transaction-edit-delete endpoints
# against the deployed Smart Wallet API.
#
# Covers:
#   - GET    /wallets/{wid}/transactions/{tid}
#   - PATCH  /wallets/{wid}/transactions/{tid}
#   - DELETE /wallets/{wid}/transactions/{tid}
#
# Strategy: creates an ephemeral Cognito user, runs 11 smoke steps with a
# real JWT, then deletes the user at the end (even on failure, via trap).
#
# Usage:
#   AWS_PROFILE=tomishi-account ./smoke-edit-delete-prod.sh
#   or:
#   pnpm smoke:edit-delete:prod
#
# Exit codes:
#   0  — all 11 steps passed
#   1  — a step failed (HTTP status mismatch or unexpected body)
#   2  — setup failed (couldn't create user, fetch SSM, etc.)

set -euo pipefail

# ---------- Config ----------
: "${AWS_PROFILE:?Set AWS_PROFILE (e.g. AWS_PROFILE=tomishi-account)}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "→ Reading deployment config from SSM..."
USER_POOL_ID=$(aws ssm get-parameter \
  --name /smart-wallet/prod/cognito/user-pool-id \
  --query 'Parameter.Value' --output text \
  --region "$AWS_REGION" --profile "$AWS_PROFILE")
CLIENT_ID=$(aws ssm get-parameter \
  --name /smart-wallet/prod/cognito/user-pool-client-id \
  --query 'Parameter.Value' --output text \
  --region "$AWS_REGION" --profile "$AWS_PROFILE")
API_URL="${API_URL:-https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com}"

RANDOM_ID=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
TEST_EMAIL="smoke-ed-${RANDOM_ID}@smart-wallet.test"
TEST_PASSWORD="Smoke-$(python3 -c "import secrets; print(secrets.token_urlsafe(16))")!"

echo "→ Ephemeral user: $TEST_EMAIL"

# ---------- Cleanup on exit (always) ----------
cleanup() {
  local exit_code=$?
  echo ""
  echo "→ Cleanup: deleting test user $TEST_EMAIL..."
  aws cognito-idp admin-delete-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$TEST_EMAIL" \
    --region "$AWS_REGION" --profile "$AWS_PROFILE" 2>/dev/null \
    && echo "  ✓ user deleted" \
    || echo "  ! could not delete (might not exist if create failed)"
  exit "$exit_code"
}
trap cleanup EXIT

# ---------- Helpers ----------
json_field() {
  python3 -c "import sys, json; d=json.loads(sys.stdin.read()); k='$1'; print(d.get(k, ''))"
}

assert_status() {
  local expected=$1
  local actual=$2
  local label=$3
  if [ "$actual" -eq "$expected" ]; then
    echo "  ✓ $label → HTTP $actual"
  else
    echo "  ✗ $label → expected HTTP $expected, got $actual"
    exit 1
  fi
}

assert_field() {
  local expected=$1
  local actual=$2
  local label=$3
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $label = $actual"
  else
    echo "  ✗ $label expected '$expected', got '$actual'"
    exit 1
  fi
}

# ---------- Setup: user + JWT ----------
echo ""
echo "═══ Setup: create user + obtain JWT ═══"

aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region "$AWS_REGION" --profile "$AWS_PROFILE" > /dev/null
echo "✓ user created"

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --password "$TEST_PASSWORD" \
  --permanent \
  --region "$AWS_REGION" --profile "$AWS_PROFILE"
echo "✓ password set (permanent)"

ID_TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$TEST_EMAIL",PASSWORD="$TEST_PASSWORD" \
  --region "$AWS_REGION" --profile "$AWS_PROFILE" \
  --query 'AuthenticationResult.IdToken' --output text)

if [ -z "$ID_TOKEN" ] || [ "$ID_TOKEN" = "None" ]; then
  echo "✗ Failed to obtain ID token"
  exit 2
fi
echo "✓ JWT obtained"

AUTH_HEADER="Authorization: Bearer $ID_TOKEN"
JSON_HEADER="Content-Type: application/json"
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PAST_ISO=$(date -u -d "30 days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v -30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ'))")

# ---------- Setup data: wallet + transaction ----------
echo ""
echo "═══ Setup data: wallet + initial transaction ═══"

echo ""
echo "[SETUP] POST /wallets (USD)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/wallets" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{"name":"EditDeleteTest","currency":"USD"}')
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 201 "$STATUS" "create wallet"
WALLET_ID=$(echo "$BODY" | json_field walletId)
echo "  wallet_id=$WALLET_ID"

echo ""
echo "[SETUP] POST expense \$100.00"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/wallets/$WALLET_ID/transactions" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d "{\"type\":\"expense\",\"amount\":\"100.00\",\"currency\":\"USD\",\"categoryId\":\"expense:food\",\"occurredAt\":\"$NOW_ISO\",\"description\":\"Initial\"}")
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 201 "$STATUS" "add transaction"
TX_ID=$(echo "$BODY" | json_field transactionId)
echo "  tx_id=$TX_ID"

# Verify pre-conditions
echo ""
echo "[SETUP] verify initial balance is -100.00"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
BALANCE=$(echo "$BODY" | json_field balance)
assert_field "-100.00" "$BALANCE" "initial balance"

# ---------- Smoke tests (11 steps) ----------
echo ""
echo "═══ Smoke tests against $API_URL ═══"

# [1] GET single transaction
echo ""
echo "[1] GET single transaction → 200"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "GET single tx"
RETURNED_ID=$(echo "$BODY" | json_field transactionId)
assert_field "$TX_ID" "$RETURNED_ID" "returned transactionId matches"

# [2] PATCH amount 100 → 120
echo ""
echo "[2] PATCH amount 100.00 → 120.00 (balance must go to -120.00)"
RESP=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{"amount":"120.00"}')
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "PATCH amount"
NEW_AMOUNT=$(echo "$BODY" | json_field amount)
assert_field "120.00" "$NEW_AMOUNT" "tx amount updated"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
BALANCE=$(echo "$BODY" | json_field balance)
assert_field "-120.00" "$BALANCE" "wallet balance after PATCH"

# [3] PATCH immutable field (type) → 400
echo ""
echo "[3] PATCH type=income (immutable) → 400"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{"type":"income"}')
assert_status 400 "$STATUS" "PATCH immutable type"

# [4] PATCH empty body → 400
echo ""
echo "[4] PATCH {} (empty) → 400"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{}')
assert_status 400 "$STATUS" "PATCH empty body"

# [5] PATCH occurredAt (SK MOVES — exercises the 3-op Delete+Put+Update path)
echo ""
echo "[5] PATCH occurredAt → 200 (SK moves; balance unchanged)"
RESP=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d "{\"occurredAt\":\"$PAST_ISO\"}")
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "PATCH occurredAt (SK move)"
NEW_OCCURRED=$(echo "$BODY" | json_field occurredAt)
assert_field "$PAST_ISO" "$NEW_OCCURRED" "occurredAt updated"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
BALANCE=$(echo "$BODY" | json_field balance)
assert_field "-120.00" "$BALANCE" "balance unchanged after SK move"

# [6] PATCH with Idempotency-Key (first call → 200 + new state)
echo ""
echo "[6] PATCH with Idempotency-Key (first call) → 200, amount → 150.00"
IDEMP_KEY="smoke-ed-$(date +%s)-$RANDOM"
RESP=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" -H "Idempotency-Key: $IDEMP_KEY" \
  -d '{"amount":"150.00"}')
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "PATCH idempotent first"
NEW_AMOUNT=$(echo "$BODY" | json_field amount)
assert_field "150.00" "$NEW_AMOUNT" "amount=150"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
BALANCE=$(echo "$BODY" | json_field balance)
assert_field "-150.00" "$BALANCE" "balance reflects delta -150"

# [7] PATCH replay with same Idempotency-Key → 200, balance unchanged
echo ""
echo "[7] PATCH replay with same Idempotency-Key → 200, balance NOT double-applied"
RESP=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" -H "Idempotency-Key: $IDEMP_KEY" \
  -d '{"amount":"150.00"}')
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "PATCH replay"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
BALANCE=$(echo "$BODY" | json_field balance)
assert_field "-150.00" "$BALANCE" "balance still -150 (idempotent)"

# [8] DELETE → 204, balance back to 0
echo ""
echo "[8] DELETE → 204, balance reverts to 0.00"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" -H "$AUTH_HEADER")
assert_status 204 "$STATUS" "DELETE tx"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
BALANCE=$(echo "$BODY" | json_field balance)
assert_field "0.00" "$BALANCE" "balance after delete"

# [9] DELETE second time → 404
echo ""
echo "[9] DELETE same tx again → 404"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" -H "$AUTH_HEADER")
assert_status 404 "$STATUS" "DELETE 2nd"

# [10] GET deleted → 404
echo ""
echo "[10] GET deleted tx → 404"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" -H "$AUTH_HEADER")
assert_status 404 "$STATUS" "GET deleted"

# [11] PATCH deleted → 404
echo ""
echo "[11] PATCH deleted tx → 404"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  "$API_URL/wallets/$WALLET_ID/transactions/$TX_ID" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{"amount":"10.00"}')
assert_status 404 "$STATUS" "PATCH deleted"

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ ALL 11 EDIT/DELETE SMOKE TESTS PASSED"
echo "═══════════════════════════════════════"
# trap cleans up the user + leaves the empty wallet behind
# (wallet cleanup is intentional — no DELETE /wallets endpoint exists yet)
