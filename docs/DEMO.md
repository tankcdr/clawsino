# 🎰 Clawsino — Demo Guide

Step-by-step instructions for demoing Clawsino at Claws Out.

## Prerequisites

- Docker Desktop running
- Terminal with a large font (⌘+ a few times)
- Browser open alongside terminal

## 1. Start Everything

```bash
cd ~/dev/chris/clawsino
docker compose up -d --build
```

Wait ~15 seconds for anvil + contract deployment + game server. Verify:

```bash
curl -s http://localhost:3000/api/games | python3 -m json.tool | head -5
```

## 2. Open the Dashboard

```bash
open http://localhost:3000/dashboard
```

The dashboard shows every request/response in real-time with the x402 flow visualization. Position it on a second monitor or side-by-side with the terminal.

## 3. Play Individual Games (Manual Demo)

### Coinflip
```bash
curl -s -X POST http://localhost:3000/api/coinflip \
  -H 'Content-Type: application/json' \
  -d '{"choice":"heads","bet":0.25}' | python3 -m json.tool
```

### Dice
```bash
curl -s -X POST http://localhost:3000/api/dice \
  -H 'Content-Type: application/json' \
  -d '{"prediction":"over","target":7,"bet":0.50}' | python3 -m json.tool
```

### Blackjack
```bash
curl -s -X POST http://localhost:3000/api/blackjack \
  -H 'Content-Type: application/json' \
  -d '{"bet":1.00}' | python3 -m json.tool
```

## 4. Verify Fairness

Every game response includes a `fairness_proof` object. Verify it:

```bash
# Get a game result
RESP=$(curl -s -X POST http://localhost:3000/api/coinflip \
  -H 'Content-Type: application/json' \
  -d '{"choice":"heads","bet":0.10}')

echo "$RESP" | python3 -c "
import sys, json, hashlib
d = json.load(sys.stdin)
fp = d['fairness_proof']
# Recompute: SHA-256(serverSeed + nonce) should equal serverSeedHash
check = hashlib.sha256((fp['serverSeed'] + str(fp['nonce'])).encode()).hexdigest()
print(f'Server Seed Hash: {fp[\"serverSeedHash\"]}')
print(f'Recomputed:       {check}')
print(f'Verified: {\"✅\" if check == fp[\"serverSeedHash\"] else \"❌\"}')"
```

## 5. Auto-Play Demo Mode 🎰

Run the colorful auto-play script — great for showing autonomous agent behavior on a projector:

```bash
# 20 rounds, 1.5s delay (default)
./scripts/demo-autoplay.sh

# Fast mode: 50 rounds, 0.5s delay
./scripts/demo-autoplay.sh 50 0.5

# Slow for narration: 10 rounds, 3s delay
./scripts/demo-autoplay.sh 10 3
```

This shows:
- Mixed games (coinflip, dice, blackjack) chosen randomly
- Win/loss results with color coding
- Running P&L scoreboard every 5 rounds
- Final scoreboard with totals

## 6. Check P&L / History

```bash
curl -s http://localhost:3000/api/history/anonymous | python3 -m json.tool
```

Shows all games played, total wagered, total returned, and win rate.

## 7. Show Smart Contracts

```bash
cd contracts
forge test --summary
# 29/29 passing — FairnessVerifier + ClawsinoPayout
```

## 8. Show the Skill (OpenClaw Integration)

```bash
cat skill/SKILL.md
# Agents discover and play games via natural language
```

## Quick Reset

```bash
docker compose down -v && docker compose up -d --build
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Server not responding | `docker compose logs game-api` |
| Contract deployment failed | `docker compose logs init` |
| Port 3000 in use | `lsof -i :3000` then kill, or change PORT in docker-compose.yml |
| Dashboard blank | Hard refresh (⌘⇧R), check WebSocket at ws://localhost:3000/ws |

## Talking Points

- **x402**: HTTP 402 Payment Required — finally has a protocol. Agents negotiate payments natively.
- **Provable fairness**: Commit-reveal — server can't cheat. Verifiable on-chain via FairnessVerifier.sol.
- **Base L2**: Sub-cent gas fees make microtransactions viable.
- **No UI needed**: Pure API — any agent with HTTP + wallet can play.
- **98 tests passing**: 69 server + 29 contract tests.
