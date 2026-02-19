# Clawsino — OpenClaw Skill

**Name:** clawsino
**Version:** 0.1.0
**Description:** Agentic casino — play coinflip, dice, and blackjack with USDC microtransactions on Base

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

4. **Set server URL** (defaults to `http://localhost:3000`):
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

## Natural Language Examples

- "Play coinflip, bet 0.10 USDC on heads"
- "Roll dice over 7 for 0.25 USDC"
- "Deal me a blackjack hand for 1 USDC"
- "What's my casino balance?"
- "Show my gambling history"
- "Verify that last game was fair"
- "What are my win/loss stats?"
- "What games can I play?"

## How It Works

- Games are played via HTTP API with x402 payment headers (USDC on Base)
- Each bet is a microtransaction — you pay to play, get paid if you win
- All games use commit-reveal fairness proofs you can verify client-side
- Game history and P&L are tracked locally in `~/.openclaw/clawsino/history.json`

## Games

### Coinflip
- **Bet range:** 0.01–1.00 USDC
- **House edge:** 2% (payout = 1.96x)
- Pick heads or tails. Simple.

### Dice
- **Bet range:** 0.01–1.00 USDC
- **Mechanic:** Two dice rolled (2–12). Predict over or under a target number.
- Payout scales with probability.

### Blackjack
- **Bet range:** 0.10–5.00 USDC
- **Mechanic:** Standard blackjack, single hand, optimal auto-play or manual hit/stand.
- Payout: 2x on win, 2.5x on natural blackjack.
