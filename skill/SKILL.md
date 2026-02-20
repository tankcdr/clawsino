# Clawsino — OpenClaw Skill

**Name:** clawsino
**Version:** 0.2.0
**Description:** Agentic casino — play coinflip, dice, and blackjack with USDC microtransactions on Base via x402

## Setup

1. **Install dependencies:**
   ```bash
   cd skill && pip install -e .
   ```

2. **Configure wallet** — set your EVM private key:
   ```bash
   export CLAWSINO_PRIVATE_KEY="0x..."
   ```
   Or store in `~/.openclaw/clawsino/config.json`:
   ```json
   { "private_key": "0x...", "server_url": "http://localhost:3000" }
   ```

3. **Fund your wallet** with USDC on Base (minimum $1 recommended).

4. **Set server URL** (defaults to `http://localhost:3402`):
   ```bash
   export CLAWSINO_SERVER_URL="https://clawsino.example.com"
   ```

## Commands

| Command | Description |
|---------|-------------|
| `clawsino games` | List available games with odds and bet ranges |
| `clawsino flip <heads\|tails> <amount>` | Play coinflip |
| `clawsino dice <over\|under> <target> <amount>` | Play dice |
| `clawsino blackjack <amount>` | Play blackjack |
| `clawsino balance` | Check wallet USDC balance |
| `clawsino history` | Show recent game results and P&L |
| `clawsino verify <game_id>` | Verify fairness proof for a past game |
| `clawsino stats` | Win rate, total wagered, total P&L |

**Flags:**
- `--demo` — Show full x402 payment flow (for demos/presentations)

## Natural Language Examples

**Playing games:**
- "Play coinflip, bet 0.10 USDC on heads"
- "Flip a coin on tails for a quarter"
- "Roll dice over 7 for 0.25 USDC"
- "I'll take under 5 on dice for 0.50"
- "Deal me a blackjack hand for 1 USDC"
- "Play blackjack with 2 dollars"

**Checking status:**
- "What's my casino balance?"
- "How much USDC do I have?"
- "Show my gambling history"
- "What are my win/loss stats?"
- "Am I up or down?"

**Fairness verification:**
- "Verify that last game was fair"
- "Check the fairness proof for game flip_1234"
- "Was that coinflip legit?"

**Discovery:**
- "What games can I play?"
- "What are the odds on dice?"
- "How does blackjack work here?"
- "Show me the house edge"

**Demo mode (shows full x402 payment negotiation):**
- "Play coinflip in demo mode, heads for 0.10"
- "Show me the full payment flow for a dice game"

## How It Works

1. **Discovery:** `GET /api/games` returns available games, bet ranges, and odds
2. **Play:** `POST /api/coinflip` (or dice, blackjack) with bet in request body
3. **Payment:** Server returns 402 with x402 payment requirements → client pays USDC on Base → retries with `X-PAYMENT` header
4. **Result:** Server returns game outcome, payout, and fairness proof
5. **Verify:** Client can independently verify the fairness proof using the revealed server seed

All games use **commit-reveal fairness**: the server commits to a seed hash before the game, reveals the seed after, and you can verify `SHA-256(serverSeed + nonce) === committedHash`.

## Games

### 🪙 Coinflip
- **Endpoint:** `POST /api/coinflip`
- **Bet range:** 0.01–1.00 USDC
- **House edge:** 2% (payout = 1.96x)
- **Params:** `{ "choice": "heads"|"tails", "bet": 0.10 }`
- Pick heads or tails. Simple 50/50.

### 🎲 Dice Roll (2d6)
- **Endpoint:** `POST /api/dice`
- **Bet range:** 0.01–1.00 USDC
- **House edge:** 2% (variable payout based on probability)
- **Params:** `{ "prediction": "over"|"under", "target": 7, "bet": 0.25 }`
- Two dice rolled (total 2–12). Predict if the total will be over or under your target. Payout scales inversely with win probability.

### 🃏 Blackjack
- **Endpoint:** `POST /api/blackjack`
- **Bet range:** 0.10–5.00 USDC
- **Payout:** 2x on win, 2.5x on natural blackjack, 1x on push
- **Params:** `{ "bet": 1.00 }`
- Standard single-hand blackjack. Auto-plays basic strategy (hit on < 17).

## Fairness Verification

Every game response includes a `fairness_proof` object:
```json
{
  "serverSeed": "abc123...",
  "serverSeedHash": "sha256(serverSeed + nonce)",
  "clientSeed": "default",
  "nonce": "random_hex",
  "combinedHash": "sha256(serverSeed + clientSeed + nonce)"
}
```

Verify client-side:
1. Compute `SHA-256(serverSeed + nonce)` → must equal `serverSeedHash`
2. Compute `SHA-256(serverSeed + clientSeed + nonce)` → must equal `combinedHash`
3. The game outcome is deterministically derived from `combinedHash`

Use `clawsino verify <game_id>` to verify any past game automatically.

## Additional Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/games` | Game catalog with odds and parameters |
| `GET /api/info` | x402 payment info and requirements |
| `GET /api/leaderboard` | Top wallets by wagered and won |
| `GET /api/stats` | Global game stats and house edge |
| `GET /api/history/:wallet` | Per-wallet game history |
| `GET /api/contracts` | On-chain contract addresses |
| `GET /health` | Server health check |
