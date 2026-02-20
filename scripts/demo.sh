#!/usr/bin/env bash
# demo.sh — Play 50 rounds across all Clawsino games with colorful P&L output
set -euo pipefail

SERVER="${CLAWSINO_SERVER_URL:-http://localhost:3402}"
WALLET="${CLAWSINO_WALLET:-0x$(openssl rand -hex 20)}"
ROUNDS=${1:-50}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Tracking
TOTAL_BET=0
TOTAL_PAYOUT=0
WINS=0
LOSSES=0
PUSHES=0

# Game counters
FLIP_COUNT=0
DICE_COUNT=0
BJ_COUNT=0

header() {
  echo ""
  echo -e "${MAGENTA}${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
  echo -e "${MAGENTA}${BOLD}║       🎰 CLAWSINO — Auto-Play Demo 🎰          ║${RESET}"
  echo -e "${MAGENTA}${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "${DIM}Server:  ${SERVER}${RESET}"
  echo -e "${DIM}Wallet:  ${WALLET}${RESET}"
  echo -e "${DIM}Rounds:  ${ROUNDS}${RESET}"
  echo ""
}

pnl_color() {
  local pnl="$1"
  if (( $(echo "$pnl > 0" | bc -l) )); then
    echo -e "${GREEN}+${pnl}${RESET}"
  elif (( $(echo "$pnl < 0" | bc -l) )); then
    echo -e "${RED}${pnl}${RESET}"
  else
    echo -e "${YELLOW}${pnl}${RESET}"
  fi
}

status_bar() {
  local net
  net=$(echo "$TOTAL_PAYOUT - $TOTAL_BET" | bc -l)
  net=$(printf "%.4f" "$net")
  local wr=0
  local total_played=$((WINS + LOSSES + PUSHES))
  if [ "$total_played" -gt 0 ]; then
    wr=$(echo "scale=1; $WINS * 100 / $total_played" | bc -l)
  fi
  echo -e "${DIM}───────────────────────────────────────────────────${RESET}"
  printf "  ${BOLD}Games:${RESET} %-4d  ${GREEN}W:${RESET}%-3d ${RED}L:${RESET}%-3d ${YELLOW}P:${RESET}%-3d  ${BOLD}WR:${RESET}%5.1f%%  ${BOLD}P&L:${RESET} $(pnl_color "$net")  ${BOLD}Vol:${RESET} %.2f\n" \
    "$total_played" "$WINS" "$LOSSES" "$PUSHES" "$wr" "$TOTAL_BET"
  echo -e "${DIM}  🪙 flips: ${FLIP_COUNT}  🎲 dice: ${DICE_COUNT}  🃏 blackjack: ${BJ_COUNT}${RESET}"
  echo -e "${DIM}───────────────────────────────────────────────────${RESET}"
}

play_coinflip() {
  local choice bet
  choice=$([ $((RANDOM % 2)) -eq 0 ] && echo "heads" || echo "tails")
  bet="0.$(printf '%02d' $((RANDOM % 100 + 1)))"

  local resp
  resp=$(curl -s -X POST "${SERVER}/api/coinflip" \
    -H "Content-Type: application/json" \
    -H "X-Wallet: ${WALLET}" \
    -H "X-PAYMENT: x402:dev:demo$(date +%s)${RANDOM}" \
    -d "{\"choice\":\"${choice}\",\"bet\":${bet}}")

  local won result payout
  won=$(echo "$resp" | jq -r '.won // false')
  result=$(echo "$resp" | jq -r '.result // "?"')
  payout=$(echo "$resp" | jq -r '.payout // 0')

  TOTAL_BET=$(echo "$TOTAL_BET + $bet" | bc -l)
  TOTAL_PAYOUT=$(echo "$TOTAL_PAYOUT + $payout" | bc -l)
  FLIP_COUNT=$((FLIP_COUNT + 1))

  local pnl
  pnl=$(echo "$payout - $bet" | bc -l)
  pnl=$(printf "%.4f" "$pnl")

  if [ "$won" = "true" ]; then
    WINS=$((WINS + 1))
    printf "  🪙 ${CYAN}%-6s${RESET} picked ${BOLD}%-5s${RESET} → ${BOLD}%-5s${RESET}  ${GREEN}✅ WIN ${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
      "FLIP" "$choice" "$result" "$bet"
  else
    LOSSES=$((LOSSES + 1))
    printf "  🪙 ${CYAN}%-6s${RESET} picked ${BOLD}%-5s${RESET} → ${BOLD}%-5s${RESET}  ${RED}❌ LOSS${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
      "FLIP" "$choice" "$result" "$bet"
  fi
}

play_dice() {
  local prediction target bet
  prediction=$([ $((RANDOM % 2)) -eq 0 ] && echo "over" || echo "under")
  target=$((RANDOM % 9 + 3))  # 3-11 (avoid impossible bets at 2/12)
  bet="0.$(printf '%02d' $((RANDOM % 100 + 1)))"

  local resp
  resp=$(curl -s -X POST "${SERVER}/api/dice" \
    -H "Content-Type: application/json" \
    -H "X-Wallet: ${WALLET}" \
    -H "X-PAYMENT: x402:dev:demo$(date +%s)${RANDOM}" \
    -d "{\"prediction\":\"${prediction}\",\"target\":${target},\"bet\":${bet}}")

  local won total payout
  won=$(echo "$resp" | jq -r '.won // false')
  total=$(echo "$resp" | jq -r '.total // "?"')
  payout=$(echo "$resp" | jq -r '.payout // 0')

  TOTAL_BET=$(echo "$TOTAL_BET + $bet" | bc -l)
  TOTAL_PAYOUT=$(echo "$TOTAL_PAYOUT + $payout" | bc -l)
  DICE_COUNT=$((DICE_COUNT + 1))

  local pnl
  pnl=$(echo "$payout - $bet" | bc -l)
  pnl=$(printf "%.4f" "$pnl")

  if [ "$won" = "true" ]; then
    WINS=$((WINS + 1))
    printf "  🎲 ${BLUE}%-6s${RESET} ${prediction} %-2d → rolled ${BOLD}%-2s${RESET}  ${GREEN}✅ WIN ${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
      "DICE" "$target" "$total" "$bet"
  else
    LOSSES=$((LOSSES + 1))
    printf "  🎲 ${BLUE}%-6s${RESET} ${prediction} %-2d → rolled ${BOLD}%-2s${RESET}  ${RED}❌ LOSS${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
      "DICE" "$target" "$total" "$bet"
  fi
}

play_blackjack() {
  local bet
  bet="0.$(printf '%02d' $((RANDOM % 490 + 10)))"

  local resp
  resp=$(curl -s -X POST "${SERVER}/api/blackjack" \
    -H "Content-Type: application/json" \
    -H "X-Wallet: ${WALLET}" \
    -H "X-PAYMENT: x402:dev:demo$(date +%s)${RANDOM}" \
    -d "{\"bet\":${bet}}")

  local outcome ptotal dtotal payout
  outcome=$(echo "$resp" | jq -r '.outcome // "?"')
  ptotal=$(echo "$resp" | jq -r '.playerTotal // "?"')
  dtotal=$(echo "$resp" | jq -r '.dealerTotal // "?"')
  payout=$(echo "$resp" | jq -r '.payout // 0')

  TOTAL_BET=$(echo "$TOTAL_BET + $bet" | bc -l)
  TOTAL_PAYOUT=$(echo "$TOTAL_PAYOUT + $payout" | bc -l)
  BJ_COUNT=$((BJ_COUNT + 1))

  local pnl
  pnl=$(echo "$payout - $bet" | bc -l)
  pnl=$(printf "%.4f" "$pnl")

  case "$outcome" in
    win)
      WINS=$((WINS + 1))
      printf "  🃏 ${YELLOW}%-6s${RESET} you=${BOLD}%-2s${RESET} dealer=${BOLD}%-2s${RESET}        ${GREEN}✅ WIN ${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
        "BJ" "$ptotal" "$dtotal" "$bet"
      ;;
    blackjack)
      WINS=$((WINS + 1))
      printf "  🃏 ${YELLOW}%-6s${RESET} you=${BOLD}%-2s${RESET} dealer=${BOLD}%-2s${RESET}        ${GREEN}🔥 BJ! ${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
        "BJ" "$ptotal" "$dtotal" "$bet"
      ;;
    push)
      PUSHES=$((PUSHES + 1))
      printf "  🃏 ${YELLOW}%-6s${RESET} you=${BOLD}%-2s${RESET} dealer=${BOLD}%-2s${RESET}        ${YELLOW}🤝 PUSH${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
        "BJ" "$ptotal" "$dtotal" "$bet"
      ;;
    *)
      LOSSES=$((LOSSES + 1))
      printf "  🃏 ${YELLOW}%-6s${RESET} you=${BOLD}%-2s${RESET} dealer=${BOLD}%-2s${RESET}        ${RED}❌ LOSS${RESET} bet=%-5s pnl=$(pnl_color "$pnl")\n" \
        "BJ" "$ptotal" "$dtotal" "$bet"
      ;;
  esac
}

# Check server is up
if ! curl -sf "${SERVER}/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ Cannot connect to ${SERVER}. Is the server running?${RESET}"
  exit 1
fi

header

for i in $(seq 1 "$ROUNDS"); do
  # Rotate games: coinflip, dice, blackjack
  case $((i % 3)) in
    0) play_coinflip ;;
    1) play_dice ;;
    2) play_blackjack ;;
  esac

  # Show status bar every 10 rounds
  if [ $((i % 10)) -eq 0 ]; then
    status_bar
  fi
done

echo ""
echo -e "${MAGENTA}${BOLD}══════════════════ FINAL RESULTS ══════════════════${RESET}"
status_bar

# Fetch server-side stats
echo ""
echo -e "${BOLD}📊 Server-Side Stats:${RESET}"
curl -s "${SERVER}/api/stats" | jq .

echo ""
echo -e "${BOLD}🏆 Leaderboard:${RESET}"
curl -s "${SERVER}/api/leaderboard?limit=5" | jq '.byWagered[:5]'

echo ""
echo -e "${GREEN}${BOLD}Demo complete! 🎰${RESET}"
