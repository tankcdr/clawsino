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

- **`server/`** — TypeScript game API with x402 payment middleware (Express, port 3402)
- **`contracts/`** — Solidity smart contracts (Foundry)
  - `ClawsinoPayout.sol` — USDC bankroll management, authorized payouts
  - `FairnessVerifier.sol` — On-chain commit-reveal verification
- **`skill/`** — OpenClaw agent skill (Python CLI + API client)

## Quick Start

```bash
# Start the casino (anvil + game server)
docker compose up -d

# Play via CLI
cd skill && pip install -e .
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

## Tests

- **Contracts:** 29/29 (unit + fuzz)
- **Server:** 20/20
- **Total:** 49 tests passing

## Tech Stack

- **Chain:** Base (EIP-155:8453)
- **Currency:** USDC (+ EVERY token planned)
- **Payments:** x402 protocol
- **Server:** TypeScript / Express
- **Contracts:** Solidity / Foundry
- **Agent Skill:** Python / OpenClaw
- **Fairness:** SHA-256 commit-reveal

## License

MIT
