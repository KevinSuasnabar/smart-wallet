#!/usr/bin/env bash
# Automated end-to-end smoke test against the deployed Smart Wallet API.
#
# Strategy: creates an ephemeral Cognito user, runs all 12 smoke steps with
# a real JWT, then deletes the user at the end (even on failure, via trap).
#
# Requirements:
#   - AWS CLI configured with profile that has Cognito + SSM read+write
#   - python3 (for JSON parsing — replaces jq for portability)
#   - curl
#
# Usage:
#   AWS_PROFILE=tomishi-account ./smoke-prod.sh
#   or:
#   pnpm smoke:prod
#
# Exit codes:
#   0  — all 12 steps passed
#   1  — a step failed (HTTP status mismatch or unexpected body)
#   2  — setup failed (couldn't create user, fetch SSM, etc.)

set -euo pipefail

# ---------- Config ----------
: "${AWS_PROFILE:?Set AWS_PROFILE (e.g. AWS_PROFILE=tomishi-account)}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Read identifiers from SSM (single source of truth, written by CDK stack).
echo "→ Reading deployment config from SSM..."
USER_POOL_ID=$(aws ssm get-parameter \
  --name /smart-wallet/prod/cognito/user-pool-id \
  --query 'Parameter.Value' --output text \
  --region "$AWS_REGION" --profile "$AWS_PROFILE")
CLIENT_ID=$(aws ssm get-parameter \
  --name /smart-wallet/prod/cognito/user-pool-client-id \
  --query 'Parameter.Value' --output text \
  --region "$AWS_REGION" --profile "$AWS_PROFILE")
# API URL is not in SSM (Serverless Framework owns it). Hardcoded but documented:
# This is a public URL, not a secret.
API_URL="${API_URL:-https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com}"

# Generate ephemeral credentials (random UUID + random password).
RANDOM_ID=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
TEST_EMAIL="smoke-${RANDOM_ID}@smart-wallet.test"
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

# ---------- Helper: JSON field extraction (python3, no jq dep) ----------
json_field() {
  python3 -c "import sys, json; d=json.loads(sys.stdin.read()); k='$1'; print(d.get(k, ''))"
}

# ---------- Helper: assert HTTP status ----------
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

# ---------- Setup: create user + auth ----------
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
echo "✓ JWT obtained (first 40 chars): ${ID_TOKEN:0:40}..."

AUTH_HEADER="Authorization: Bearer $ID_TOKEN"
JSON_HEADER="Content-Type: application/json"
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ---------- Smoke tests (12 steps) ----------
echo ""
echo "═══ Smoke tests against $API_URL ═══"

# 1. Create wallet (USD)
echo ""
echo "[1] POST /wallets (USD)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/wallets" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{"name":"Cash","currency":"USD"}')
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 201 "$STATUS" "create wallet"
WALLET_ID=$(echo "$BODY" | json_field walletId)
echo "  wallet_id=$WALLET_ID"

# 2. List wallets
echo ""
echo "[2] GET /wallets"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/wallets" -H "$AUTH_HEADER")
assert_status 200 "$STATUS" "list wallets"

# 3. Get wallet by id
echo ""
echo "[3] GET /wallets/{id}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
assert_status 200 "$STATUS" "get wallet"

# 4. Create custom category (expense)
echo ""
echo "[4] POST /categories (Coffee, expense)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/categories" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d '{"name":"Coffee","type":"expense"}')
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 201 "$STATUS" "create custom category"
CATEGORY_ID=$(echo "$BODY" | json_field categoryId)

# 5. List categories
echo ""
echo "[5] GET /categories"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/categories" -H "$AUTH_HEADER")
assert_status 200 "$STATUS" "list categories"

# 6. Add expense transaction (predefined category)
echo ""
echo "[6] POST txn (expense:food, \$5.50)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$API_URL/wallets/$WALLET_ID/transactions" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" \
  -d "{\"type\":\"expense\",\"amount\":\"5.50\",\"currency\":\"USD\",\"categoryId\":\"expense:food\",\"description\":\"lunch\",\"occurredAt\":\"$NOW_ISO\"}")
assert_status 201 "$STATUS" "add expense"

# 7. Add income with Idempotency-Key (first attempt)
echo ""
echo "[7] POST txn (income:salary, \$100, idempotency-key)"
IDEMP_KEY="smoke-$(date +%s)-$RANDOM"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/wallets/$WALLET_ID/transactions" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" -H "Idempotency-Key: $IDEMP_KEY" \
  -d "{\"type\":\"income\",\"amount\":\"100.00\",\"currency\":\"USD\",\"categoryId\":\"income:salary\",\"occurredAt\":\"$NOW_ISO\"}")
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 201 "$STATUS" "add income (first)"
FIRST_TXN_ID=$(echo "$BODY" | json_field transactionId)

# 8. Replay with same Idempotency-Key (should be 200 with SAME transactionId)
echo ""
echo "[8] POST replay with same Idempotency-Key (should 200, same txnId)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/wallets/$WALLET_ID/transactions" \
  -H "$AUTH_HEADER" -H "$JSON_HEADER" -H "Idempotency-Key: $IDEMP_KEY" \
  -d "{\"type\":\"income\",\"amount\":\"100.00\",\"currency\":\"USD\",\"categoryId\":\"income:salary\",\"occurredAt\":\"$NOW_ISO\"}")
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "replay (idempotent)"
REPLAY_TXN_ID=$(echo "$BODY" | json_field transactionId)
if [ "$REPLAY_TXN_ID" = "$FIRST_TXN_ID" ]; then
  echo "  ✓ same transactionId returned ($REPLAY_TXN_ID)"
else
  echo "  ✗ different transactionIds: first=$FIRST_TXN_ID replay=$REPLAY_TXN_ID"
  exit 1
fi

# 9. List transactions by wallet
echo ""
echo "[9] GET /wallets/{id}/transactions"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/wallets/$WALLET_ID/transactions" -H "$AUTH_HEADER")
assert_status 200 "$STATUS" "list by wallet"

# 10. List transactions by category (uses GSI1)
echo ""
echo "[10] GET /transactions?categoryId=expense:food"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/transactions?categoryId=expense:food" -H "$AUTH_HEADER")
assert_status 200 "$STATUS" "list by category"

# 11. Delete custom category
echo ""
echo "[11] DELETE /categories/{id}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/categories/$CATEGORY_ID" -H "$AUTH_HEADER")
assert_status 204 "$STATUS" "delete custom category"

# 12. Verify final balance (should be 94.50)
echo ""
echo "[12] GET /wallets/{id} — verify balance"
RESP=$(curl -s -w "\n%{http_code}" "$API_URL/wallets/$WALLET_ID" -H "$AUTH_HEADER")
BODY=$(echo "$RESP" | head -n-1)
STATUS=$(echo "$RESP" | tail -n1)
assert_status 200 "$STATUS" "get wallet final"
BALANCE=$(echo "$BODY" | json_field balance)
if [ "$BALANCE" = "94.50" ]; then
  echo "  ✓ balance is 94.50 USD (+100.00 income - 5.50 expense, replay counted once)"
else
  echo "  ✗ expected balance 94.50, got $BALANCE"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ ALL 12 SMOKE TESTS PASSED"
echo "═══════════════════════════════════════"
# trap will clean up the user
