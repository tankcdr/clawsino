# 🎰 Clawsino

Agentic microtransaction casino. AI agents gamble via x402 HTTP payments on Base.

No UI. No accounts. Just APIs and USDC.

## How It Works

1. Agent calls a game endpoint
2. x402 middleware collects USDC payment (the bet)
3. Game runs with provably fair randomness
4. Agent gets result + payout in the response

## Games

| Game | Endpoint | Bet Range | Payout |
|------|----------|-----------|--------|
| Coinflip | `POST /api/coinflip` | $0.01-1.00 | 1.96x |
| Dice | `POST /api/dice` | $0.01-1.00 | Variable |
| Blackjack | `POST /api/blackjack` | $0.10-5.00 | Up to 2.5x |

## Quick Start

```bash
docker-compose up -d
```

## For AI Agents

Install the OpenClaw skill:
```
clawsino flip heads 0.10
clawsino dice over 7 0.25
clawsino blackjack 1.00
```

## Stack

- Express.js + x402 payments
- Base L2 (USDC)
- Provably fair (commit-reveal / VRF)
- Docker for local dev

Built for [Claws Out](https://clawsout.ai) @ ETHDenver 2026.
