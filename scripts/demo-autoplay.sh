#!/usr/bin/env bash
# 🎰 Clawsino Demo Auto-Play — Colorful autonomous game session
# Plays a mix of games with animated output for live demos.
set -euo pipefail

BASE_URL="${CLAWSINO_URL:-http://localhost:3000}"
ROUNDS="${1:-20}"
DELAY="${2:-1.5}"

# Colors
R='\033[0;31m'    G='\033[0;32m'    Y='\033[0;33m'
B='\033[0;34m'    M='\033[0;35m'    C='\033[0;36m'
W='\033[1;37m'    DIM='\033[2m'     BOLD='\033[1m'
RST='\033[0m'

WINS=0  LOSSES=0  PUSHES=0
WAGERED=0  RETURNED=0

banner() {
  echo ""
  echo -e "${M}╔══════════════════════════════════════════════╗${RST}"
  echo -e "${M}║${RST}  ${BOLD}🎰  C L A W S I N O   D E M O   M O D E${RST}  ${M}║${RST}"
  echo -e "${M}║${RST}  ${DIM}Agent-native casino • x402 payments • Base${RST} ${M}║${RST}"
  echo -e "${M}╚══════════════════════════════════════════════╝${RST}"
  echo ""
  echo -e "  ${DIM}Server:${RST} ${BASE_URL}"
  echo -e "  ${DIM}Rounds:${RST} ${ROUNDS}"
  echo -e "  ${DIM}Delay:${RST}  ${DELAY}s between games"
  echo ""
}

separator() {
  echo -e "${DIM}──────────────────────────────────────────────${RST}"
}

play_coinflip() {
  local choice=$(( RANDOM % 2 == 0 )) && local side="heads" || local side="tails"
  local bet="0.$(printf '%02d' $(( RANDOM % 100 + 1 )))"
  # Cap bet to valid range
  bet=$(python3 -c "print(f'{max(0.01, min(1.0, $bet)):.2f}')")

  echo -e "  ${C}🪙 Coinflip${RST} — ${W}${side}${RST} for ${Y}\$${bet}${RST}"
  echo -e "  ${DIM}▶ POST /api/coinflip${RST}"

  local resp
  resp=$(curl -sf -X POST "$BASE_URL/api/coinflip" \
    -H 'Content-Type: application/json' \
    -d "{\"choice\":\"$side\",\"bet\":$bet}" 2>/dev/null) || { echo -e "  ${R}✗ Request failed${RST}"; return; }

  local result won payout
  result=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result','?'))")
  won=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('won',False)).lower())")
  payout=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('payout',0):.4f}\")")

  WAGERED=$(python3 -c "print(f'{$WAGERED + $bet:.4f}')")
  RETURNED=$(python3 -c "print(f'{$RETURNED + $payout:.4f}')")

  if [ "$won" = "true" ]; then
    WINS=$((WINS + 1))
    echo -e "  ${G}✓ ${result} — WON \$${payout} USDC${RST}"
  else
    LOSSES=$((LOSSES + 1))
    echo -e "  ${R}✗ ${result} — LOST \$${bet} USDC${RST}"
  fi
}

play_dice() {
  local pred=$(( RANDOM % 2 == 0 )) && local prediction="over" || local prediction="under"
  local target=$(( RANDOM % 7 + 4 ))  # 4-10 for reasonable odds
  [ "$prediction" = "over" ] && target=$(( RANDOM % 4 + 5 ))   # 5-8 for over
  [ "$prediction" = "under" ] && target=$(( RANDOM % 4 + 6 ))  # 6-9 for under
  local bet="0.$(printf '%02d' $(( RANDOM % 50 + 5 )))"
  bet=$(python3 -c "print(f'{max(0.01, min(1.0, $bet)):.2f}')")

  echo -e "  ${B}🎲 Dice${RST} — ${W}${prediction} ${target}${RST} for ${Y}\$${bet}${RST}"
  echo -e "  ${DIM}▶ POST /api/dice${RST}"

  local resp
  resp=$(curl -sf -X POST "$BASE_URL/api/dice" \
    -H 'Content-Type: application/json' \
    -d "{\"prediction\":\"$prediction\",\"target\":$target,\"bet\":$bet}" 2>/dev/null) || { echo -e "  ${R}✗ Request failed${RST}"; return; }

  local roll total won payout
  total=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total','?'))")
  won=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('won',False)).lower())")
  payout=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('payout',0):.4f}\")")

  WAGERED=$(python3 -c "print(f'{$WAGERED + $bet:.4f}')")
  RETURNED=$(python3 -c "print(f'{$RETURNED + $payout:.4f}')")

  if [ "$won" = "true" ]; then
    WINS=$((WINS + 1))
    echo -e "  ${G}✓ Rolled ${total} (${prediction} ${target}) — WON \$${payout} USDC${RST}"
  else
    LOSSES=$((LOSSES + 1))
    echo -e "  ${R}✗ Rolled ${total} (${prediction} ${target}) — LOST \$${bet} USDC${RST}"
  fi
}

play_blackjack() {
  local bet="0.$(printf '%02d' $(( RANDOM % 200 + 10 )))"
  bet=$(python3 -c "print(f'{max(0.10, min(5.0, $bet)):.2f}')")

  echo -e "  ${M}🃏 Blackjack${RST} — ${Y}\$${bet}${RST}"
  echo -e "  ${DIM}▶ POST /api/blackjack${RST}"

  local resp
  resp=$(curl -sf -X POST "$BASE_URL/api/blackjack" \
    -H 'Content-Type: application/json' \
    -d "{\"bet\":$bet}" 2>/dev/null) || { echo -e "  ${R}✗ Request failed${RST}"; return; }

  local outcome payout ptotal dtotal
  outcome=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('outcome','?'))")
  payout=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('payout',0):.4f}\")")
  ptotal=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('playerTotal','?'))")
  dtotal=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dealerTotal','?'))")

  WAGERED=$(python3 -c "print(f'{$WAGERED + $bet:.4f}')")
  RETURNED=$(python3 -c "print(f'{$RETURNED + $payout:.4f}')")

  case "$outcome" in
    blackjack)
      WINS=$((WINS + 1))
      echo -e "  ${G}★ BLACKJACK! (${ptotal} vs ${dtotal}) — WON \$${payout} USDC${RST}" ;;
    win)
      WINS=$((WINS + 1))
      echo -e "  ${G}✓ ${ptotal} vs ${dtotal} — WON \$${payout} USDC${RST}" ;;
    push)
      PUSHES=$((PUSHES + 1))
      echo -e "  ${Y}= ${ptotal} vs ${dtotal} — PUSH \$${payout} USDC${RST}" ;;
    *)
      LOSSES=$((LOSSES + 1))
      echo -e "  ${R}✗ ${ptotal} vs ${dtotal} — LOST \$${bet} USDC${RST}" ;;
  esac
}

scoreboard() {
  local pnl=$(python3 -c "print(f'{$RETURNED - $WAGERED:.4f}')")
  local pnl_pct=$(python3 -c "w=$WAGERED; print(f'{(($RETURNED - w) / w * 100):.1f}' if w > 0 else '0.0')")
  local pnl_color="$G"
  python3 -c "exit(0 if $RETURNED >= $WAGERED else 1)" || pnl_color="$R"

  echo ""
  echo -e "${W}╔══════════════════════════════════════════════╗${RST}"
  echo -e "${W}║${RST}  ${BOLD}📊  S C O R E B O A R D${RST}                      ${W}║${RST}"
  echo -e "${W}╠══════════════════════════════════════════════╣${RST}"
  printf "${W}║${RST}  ${G}Wins:${RST}    %-5s  ${R}Losses:${RST} %-5s  ${Y}Push:${RST} %-4s${W}║${RST}\n" "$WINS" "$LOSSES" "$PUSHES"
  printf "${W}║${RST}  Wagered: ${Y}\$%-10s${RST}  Returned: ${Y}\$%-8s${RST}${W}║${RST}\n" "$WAGERED" "$RETURNED"
  printf "${W}║${RST}  ${BOLD}P&L:${RST} ${pnl_color}\$%-10s${RST} (${pnl_color}%s%%${RST})              ${W}║${RST}\n" "$pnl" "$pnl_pct"
  echo -e "${W}╚══════════════════════════════════════════════╝${RST}"
  echo ""
}

# --- Main ---
banner

# Check server
echo -e "  ${DIM}Checking server...${RST}"
if ! curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
  if ! curl -sf "$BASE_URL/api/games" > /dev/null 2>&1; then
    echo -e "  ${R}✗ Server not reachable at ${BASE_URL}${RST}"
    echo -e "  ${DIM}Start with: docker compose up -d${RST}"
    exit 1
  fi
fi
echo -e "  ${G}✓ Server is live${RST}"
echo ""

GAMES=("coinflip" "coinflip" "coinflip" "dice" "dice" "blackjack")

for i in $(seq 1 "$ROUNDS"); do
  separator
  echo -e "  ${DIM}Round $i/$ROUNDS${RST}"

  # Pick a random game (weighted toward coinflip)
  local_game="${GAMES[$((RANDOM % ${#GAMES[@]}))]}"

  case "$local_game" in
    coinflip)  play_coinflip ;;
    dice)      play_dice ;;
    blackjack) play_blackjack ;;
  esac

  # Mini scoreboard every 5 rounds
  if (( i % 5 == 0 )); then
    local pnl=$(python3 -c "print(f'{$RETURNED - $WAGERED:.4f}')")
    local pnl_color="$G"
    python3 -c "exit(0 if $RETURNED >= $WAGERED else 1)" || pnl_color="$R"
    echo -e "  ${DIM}── W:${WINS} L:${LOSSES} | P&L: ${pnl_color}\$${pnl}${RST}"
  fi

  sleep "$DELAY"
done

separator
scoreboard
echo -e "  ${DIM}🔐 All games include fairness proofs — verify with:${RST}"
echo -e "  ${DIM}   curl ${BASE_URL}/api/history/anonymous${RST}"
echo ""
