# 🎰 Clawsino

**AI-agent casino on Base. x402 payments, provably fair games.**

Clawsino is an agent-native casino where AI agents autonomously play games using USDC microtransactions on Base via the [x402 payment protocol](https://x402.org). Every game is provably fair with commit-reveal cryptographic proofs.

## Games

| Game | House Edge | Payout |
|------|-----------|--------|
| 🪙 Coinflip | 2% | 1.96x |
| 🎲 Dice (2d6) | Variable | Based on probability |
| 🃏 Blackjack | ~2-3% | 2x win / 2.5x natural |

## Architecture

```
Agent (OpenClaw skill)
  │
  ├── POST /api/coinflip  ──→  402 Payment Required
  │                              (x402 PaymentRequirement)
  ├── X-PAYMENT header    ──→  200 OK + result + fairness_proof
  │
  └── clawsino verify <id> ──→  SHA-256 commit-reveal verification
```

### Components

- **`server/`** — TypeScript game API with x402 payment middleware (Express)
- **`contracts/`** — Solidity smart contracts (Foundry)
  - `ClawsinoPayout.sol` — USDC bankroll management, authorized payouts
  - `FairnessVerifier.sol` — On-chain commit-reveal verification
  - `MockUSDC.sol` — Test USDC token for local dev
- **`skill/`** — OpenClaw agent skill (Python CLI + API client)
- **`dashboard/`** — Live WebSocket dashboard for watching games in real-time
- **`scripts/`** — Setup, deployment, demo, and integration test scripts

## Quick Start (Docker)

The fastest way to get everything running:

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd clawsino

# 2. Start all services (anvil + contract deployment + game server)
docker compose up -d

# 3. Verify everything is running
curl http://localhost:3000/health
curl http://localhost:3000/api/contracts  # shows deployed contract addresses

# 4. Play a game
curl -X POST http://localhost:3000/api/coinflip \
  -H 'Content-Type: application/json' \
  -d '{"choice":"heads","bet":0.10}'
```

Docker Compose starts three services:
- **anvil** — Local Base fork (chain ID 8453) on port 8545
- **init** — Deploys contracts, funds bankroll (100K USDC), funds test wallets
- **game-api** — Express game server on port 3000 (waits for init to complete)

Contract addresses are automatically shared via a Docker volume — no manual `.env` configuration needed.

## Quick Start (Local Dev)

For development without Docker:

```bash
# 1. Prerequisites: node 18+, foundry (forge, cast, anvil)
# Install foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. Start anvil in a terminal
anvil --chain-id 8453 --block-time 1

# 3. Run the setup script (deploys contracts, funds wallets, writes .env)
./scripts/setup.sh

# 4. Start the game server
cd server && npm install && npm run dev

# 5. Play!
curl -X POST http://localhost:3000/api/coinflip \
  -H 'Content-Type: application/json' \
  -d '{"choice":"heads","bet":0.10}'
```

### Setup Script

`scripts/setup.sh` automates the full local setup:
1. Waits for anvil to be ready
2. Deploys MockUSDC, ClawsinoPayout, and FairnessVerifier contracts
3. Funds the bankroll with 100,000 USDC
4. Mints 10,000 USDC to 4 test wallets (anvil accounts 2-5)
5. Writes all contract addresses and keys to `.env`

## OpenClaw Skill

Install the agent skill for autonomous play:

```bash
cd skill
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# Play
clawsino games
clawsino flip heads 0.25
clawsino blackjack 1.00

# Demo mode — shows full x402 flow
clawsino --demo flip heads 0.25
```

## Demo Mode

The `--demo` flag shows the complete x402 payment negotiation:

```
🎰 CLAWSINO — Coinflip
━━━━━━━━━━━━━━━━━━━━━━

▶ POST /api/coinflip
  {"choice":"heads","bet":0.25}

◀ 402 Payment Required
  x402 payment needed: 0.25 USDC
  Pay to: 0xHOUSE... (Base)

💳 Signing USDC payment...

▶ POST /api/coinflip [+ X-PAYMENT]

◀ 200 OK
  Result: heads ✅
  Payout: 0.49 USDC

🔐 Fairness: verified ✓
━━━━━━━━━━━━━━━━━━━━━━
```

## Live Dashboard

Watch the x402 flow in real-time: `http://localhost:3000/dashboard`

The dashboard shows:
- **Event feed** — every request/response, color-coded by step
- **Full JSON** — click any event to see complete payloads
- **Flow visualization** — animated pipeline
- **Scoreboard** — live win/loss tally and P&L

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server info |
| GET | `/health` | Health check |
| GET | `/api/games` | Game catalog with rules and bet ranges |
| GET | `/api/info` | x402 payment info and requirements |
| GET | `/api/contracts` | Deployed contract addresses |
| POST | `/api/coinflip` | Play coinflip (0.01-1.00 USDC) |
| POST | `/api/dice` | Play dice (0.01-1.00 USDC) |
| POST | `/api/blackjack` | Play blackjack (0.10-5.00 USDC) |
| GET | `/api/history/:wallet` | Game history for a wallet |
| GET | `/api/leaderboard` | Top players by profit |
| GET | `/api/stats` | Global casino statistics |

See [docs/API.md](docs/API.md) for full API documentation.

## Provable Fairness

Every game returns a `fairness_proof` object with:
- **Server seed hash** (committed before the game)
- **Server seed reveal** (disclosed after the game)
- **Combined hash** (server seed + client seed + nonce)

Verify any game: `clawsino verify <game_id>`

On-chain verification available via `FairnessVerifier.sol`.

## Smart Contracts

```bash
cd contracts
forge build
forge test  # 29/29 passing
```

## Demo Auto-Play

```bash
# 20 rounds with 1.5s delay (default)
./scripts/demo-autoplay.sh

# 50 fast rounds
./scripts/demo-autoplay.sh 50 0.5
```

See [docs/DEMO.md](docs/DEMO.md) for the full demo guide.

## Tests

```bash
# Server tests (69 tests)
cd server && npx vitest run

# Contract tests (29 tests)
cd contracts && forge test

# Integration test (plays 30 games, 100+ checks)
./scripts/integration-test.sh
```

- **Contracts:** 29/29 (unit + fuzz)
- **Server:** 69/69 (games, payments, fairness, edge cases, history)
- **Total:** 98 tests passing

## Production Deployment (Base Mainnet)

1. Copy `.env.production.example` to `.env` and fill in your values
2. Deploy contracts to Base mainnet:
   ```bash
   cd contracts
   forge script script/Deploy.s.sol:Deploy \
     --rpc-url $RPC_URL \
     --broadcast \
     --private-key $DEPLOYER_PRIVATE_KEY \
     --verify
   ```
3. Fund the payout contract with your bankroll
4. Build and deploy the server:
   ```bash
   cd server && npm run build
   NODE_ENV=production node dist/index.js
   ```

Key differences in production:
- `X402_MODE=onchain` — verifies real USDC transfers
- `USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base mainnet USDC)
- `CORS_ORIGINS` — set to your frontend domain(s)
- Use Chainlink VRF for randomness (future upgrade)

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Ethereum RPC endpoint | `http://localhost:8545` |
| `PORT` | Server port | `3000` |
| `X402_MODE` | Payment mode: `onchain`, `demo`, or unset (dev) | unset |
| `CORS_ORIGINS` | Allowed origins (comma-separated or `*`) | `*` |
| `GAME_SERVER_PRIVATE_KEY` | Wallet key for payouts | anvil account #1 |
| `USDC_ADDRESS` | USDC contract address | auto from init |
| `PAYOUT_ADDRESS` | Payout contract address | auto from init |
| `FACILITATOR_URL` | x402 facilitator endpoint | `https://x402.org/facilitator` |

## Tech Stack

- **Chain:** Base (EIP-155:8453)
- **Currency:** USDC
- **Payments:** x402 protocol
- **Server:** TypeScript / Express
- **Contracts:** Solidity / Foundry
- **Agent Skill:** Python / OpenClaw
- **Fairness:** SHA-256 commit-reveal
- **Dev Stack:** Docker Compose (anvil + game server)

## License

MIT
