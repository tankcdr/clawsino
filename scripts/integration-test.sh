#!/usr/bin/env bash
# Integration test: starts the server, plays 10 rounds of each game, verifies results.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PORT=3402
BASE_URL="http://localhost:$PORT"
PASS=0
FAIL=0
TOTAL=0

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- Start server ---
echo "🚀 Starting Clawsino server on port $PORT..."
cd "$ROOT_DIR/server"
npx tsx src/index.ts &
SERVER_PID=$!
sleep 2

# Verify server is up
if ! curl -sf "$BASE_URL/health" > /dev/null; then
  echo "❌ Server failed to start"
  exit 1
fi
echo "✅ Server is up"
echo ""

check() {
  local label="$1"
  local condition="$2"  # "true" or "false"
  TOTAL=$((TOTAL + 1))
  if [ "$condition" = "true" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  ❌ FAIL: $label"
  fi
}

# --- Coinflip: 10 rounds ---
echo "🪙 Coinflip — 10 rounds"
COIN_WINS=0
COIN_LOSSES=0
for i in $(seq 1 10); do
  CHOICE=$(( i % 2 == 0 ? 1 : 0 ))
  [ "$CHOICE" -eq 0 ] && SIDE="heads" || SIDE="tails"
  RESP=$(curl -sf -X POST "$BASE_URL/api/coinflip" \
    -H 'Content-Type: application/json' \
    -d "{\"choice\":\"$SIDE\",\"bet\":0.05}")

  GAME=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game',''))")
  WON=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('won',False))")
  HAS_PROOF=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str('serverSeed' in d.get('fairness_proof',{})).lower())")
  RESULT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',''))")

  check "coinflip[$i] game=coinflip" "$([ "$GAME" = "coinflip" ] && echo true || echo false)"
  check "coinflip[$i] has fairness proof" "$HAS_PROOF"
  check "coinflip[$i] result is heads/tails" "$(echo "$RESULT" | grep -qE '^(heads|tails)$' && echo true || echo false)"

  [ "$WON" = "True" ] && COIN_WINS=$((COIN_WINS + 1)) || COIN_LOSSES=$((COIN_LOSSES + 1))
done
echo "  Results: $COIN_WINS wins, $COIN_LOSSES losses"
echo ""

# --- Dice: 10 rounds ---
echo "🎲 Dice — 10 rounds"
DICE_WINS=0
DICE_LOSSES=0
for i in $(seq 1 10); do
  TARGET=$(( (i % 5) + 5 ))  # targets 5-9
  PRED=$(( i % 2 == 0 ? 1 : 0 ))
  [ "$PRED" -eq 0 ] && PREDICTION="over" || PREDICTION="under"
  RESP=$(curl -sf -X POST "$BASE_URL/api/dice" \
    -H 'Content-Type: application/json' \
    -d "{\"prediction\":\"$PREDICTION\",\"target\":$TARGET,\"bet\":0.05}")

  GAME=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game',''))")
  WON=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('won',False))")
  TOTAL_ROLL=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
  HAS_PROOF=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str('serverSeed' in d.get('fairness_proof',{})).lower())")

  check "dice[$i] game=dice" "$([ "$GAME" = "dice" ] && echo true || echo false)"
  check "dice[$i] has fairness proof" "$HAS_PROOF"
  check "dice[$i] total in [2,12]" "$([ "$TOTAL_ROLL" -ge 2 ] && [ "$TOTAL_ROLL" -le 12 ] && echo true || echo false)"

  [ "$WON" = "True" ] && DICE_WINS=$((DICE_WINS + 1)) || DICE_LOSSES=$((DICE_LOSSES + 1))
done
echo "  Results: $DICE_WINS wins, $DICE_LOSSES losses"
echo ""

# --- Blackjack: 10 rounds ---
echo "🃏 Blackjack — 10 rounds"
BJ_RESULTS=""
for i in $(seq 1 10); do
  RESP=$(curl -sf -X POST "$BASE_URL/api/blackjack" \
    -H 'Content-Type: application/json' \
    -d "{\"bet\":0.50,\"clientSeed\":\"inttest$i\"}")

  GAME=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game',''))")
  OUTCOME=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('outcome',''))")
  PAYOUT=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payout',0))")
  PTOTAL=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('playerTotal',0))")
  HAS_PROOF=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str('serverSeed' in d.get('fairness_proof',{})).lower())")

  check "blackjack[$i] game=blackjack" "$([ "$GAME" = "blackjack" ] && echo true || echo false)"
  check "blackjack[$i] has fairness proof" "$HAS_PROOF"
  check "blackjack[$i] valid outcome" "$(echo "$OUTCOME" | grep -qE '^(win|lose|push|blackjack)$' && echo true || echo false)"

  # Verify payout matches outcome
  case "$OUTCOME" in
    lose) check "blackjack[$i] payout=0 on lose" "$(python3 -c "print(str($PAYOUT == 0).lower())")" ;;
    win) check "blackjack[$i] payout=1.0 on win" "$(python3 -c "print(str($PAYOUT == 1.0).lower())")" ;;
    push) check "blackjack[$i] payout=0.5 on push" "$(python3 -c "print(str($PAYOUT == 0.5).lower())")" ;;
    blackjack) check "blackjack[$i] payout=1.25 on bj" "$(python3 -c "print(str($PAYOUT == 1.25).lower())")" ;;
  esac

  BJ_RESULTS="$BJ_RESULTS $OUTCOME"
done
echo "  Results:$BJ_RESULTS"
echo ""

# --- Summary ---
echo "━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Integration Test Summary"
echo "   Total checks: $TOTAL"
echo "   Passed: $PASS"
echo "   Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ SOME TESTS FAILED"
  exit 1
else
  echo "✅ ALL TESTS PASSED"
fi
