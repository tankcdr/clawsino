# CLAUDE.md — Clawsino: Agentic Microtransaction Casino

## Overview
Agentic casino where AI agents gamble via x402 HTTP payments on Base. Strip the UI — pure API. Agents pay per play, get results + payouts instantly.

## Architecture
```
AI Agent → x402 payment (USDC on Base) → Game API (Express) → Result + Payout
```

## Stack
- **Server:** Express.js + TypeScript + @x402/express middleware
- **Chain:** Base L2 (low gas, x402 native)
- **Currency:** USDC on Base
- **Fairness:** Commit-reveal (local), Chainlink VRF (production)
- **Local Dev:** Docker Compose (anvil Base fork + game server + redis)
- **Smart Contracts:** Foundry (Solidity 0.8.20+)
- **Skill:** OpenClaw skill for any agent to play

## Directory Structure
```
clawsino/
├── contracts/          # Foundry — fairness verifier, payout contract
│   ├── src/
│   ├── test/
│   └── script/
├── server/             # Express API server
│   └── src/
│       ├── games/      # Game logic (coinflip, dice, blackjack)
│       ├── middleware/  # x402 payment middleware
│       └── utils/      # Crypto, fairness, payout utils
├── skill/              # OpenClaw skill (SKILL.md + scripts)
├── docs/               # Architecture, API docs
├── docker-compose.yml  # Local dev stack
└── CLAUDE.md
```

## Game Endpoints

### Coinflip — `POST /api/coinflip`
- Request: `{ "choice": "heads" | "tails", "bet": 0.01-1.00 }`
- x402 payment: bet amount in USDC
- Response: `{ "result": "heads", "won": true, "payout": 0.02, "fairness_proof": "..." }`
- House edge: 2% (payout = 1.96x)

### Dice Roll — `POST /api/dice`
- Request: `{ "prediction": "over" | "under", "target": 7, "bet": 0.01-1.00 }`
- x402 payment: bet amount in USDC
- Response: `{ "roll": [3, 5], "total": 8, "won": true, "payout": 0.02, "fairness_proof": "..." }`

### Blackjack — `POST /api/blackjack`
- Request: `{ "bet": 0.10-5.00 }` → deal
- Stateless single-hand: deal + auto-play optimal strategy, or allow hit/stand via query params
- Response: full hand result + payout

## x402 Integration
- Server uses `@x402/express` middleware
- Each game endpoint has a payment requirement (the bet amount)
- Dynamic pricing: bet amount specified in request body
- Facilitator: Coinbase hosted (production) or local (Docker dev)
- Settlement: USDC on Base

## Fairness
- **Commit-Reveal:** Server commits hash of (server_seed + nonce) before game. Reveals after. Agent can verify.
- **On-chain option:** Fairness verifier contract — submit seeds + result, contract verifies hash chain.
- **Production:** Chainlink VRF for true randomness.

## Payout Contract
- Simple escrow: house deposits USDC, contract pays winners
- Or direct x402 settlement: payment goes to house if agent loses, refund + bonus if agent wins

## OpenClaw Skill
- SKILL.md with game descriptions and natural language interface
- Scripts: `clawsino.py` or `clawsino.ts` — CLI for all games
- Commands: `clawsino flip heads 0.10`, `clawsino dice over 7 0.25`, `clawsino blackjack 1.00`
- Wallet management: reuse agent's existing EVM wallet

## Docker Compose
```yaml
services:
  anvil:           # Foundry anvil — Base fork
  game-api:        # Express server
  redis:           # Optional: game state cache
```

## Build Commands
```bash
# Contracts
cd contracts && forge build && forge test

# Server
cd server && npm install && npm run build && npm run dev

# Docker
docker-compose up -d

# Skill test
cd skill && clawsino flip heads 0.10
```

## Demo Script (Claws Out)
1. Show empty agent wallet
2. Fund agent with $5 USDC on Base
3. Agent plays 50 coinflips autonomously
4. Show P&L in real-time
5. Verify fairness proofs on-chain
6. Agent discovers and plays dice game
7. Show x402 payment flow in network tab
