# Clawsino API Reference

**Base URL:** `http://localhost:3402` (dev) or your deployed instance

**Payment Protocol:** [x402](https://x402.org) — USDC on Base

## Authentication & Payment

Game endpoints (`POST /api/coinflip`, `/api/dice`, `/api/blackjack`) require x402 payment:

1. **First request** (no payment header) → `402 Payment Required` with `paymentRequirements`
2. **Pay** the specified amount in USDC on Base
3. **Retry** with `X-PAYMENT: x402:tx:<txhash>` header → game result

In dev mode, payments are skipped. In demo mode, `X-PAYMENT: x402:dev:<any>` is accepted.

Optional headers:
- `X-Wallet: 0x...` — identify your wallet for history tracking
- `X-Payer-Address: 0x...` — same purpose, set by skill client

---

## Endpoints

### `GET /`

Root — service info.

**Response:**
```json
{
  "name": "🎰 Clawsino — Agentic Microtransaction Casino",
  "version": "0.1.0",
  "docs": "GET /api/games",
  "health": "GET /health",
  "dashboard": "GET /dashboard",
  "games": ["POST /api/coinflip", "POST /api/dice", "POST /api/blackjack"],
  "payment": "x402 (USDC on Base)",
  "mode": "dev"
}
```

---

### `GET /health`

Health check. Also available at `GET /api/health`.

**Response:**
```json
{
  "status": "ok",
  "service": "clawsino",
  "version": "0.1.0",
  "uptime": 123.45,
  "timestamp": "2026-02-20T10:00:00.000Z",
  "mode": "dev"
}
```

---

### `GET /api/games`

Game catalog with rules, odds, bet ranges, and parameter descriptions.

**Response:**
```json
{
  "games": [
    {
      "id": "coinflip",
      "name": "Coin Flip",
      "description": "Pick heads or tails. 1.96x payout (2% house edge).",
      "endpoint": "POST /api/coinflip",
      "odds": "50/50, 1.96x payout",
      "betRange": { "min": 0.01, "max": 1.0, "currency": "USDC" },
      "params": {
        "choice": "heads | tails",
        "bet": "number (0.01 - 1.00)",
        "clientSeed": "string (optional, for provable fairness)"
      }
    },
    {
      "id": "dice",
      "name": "Dice Roll (2d6)",
      "description": "Predict if the total of 2d6 will be over or under your target.",
      "endpoint": "POST /api/dice",
      "odds": "Variable — depends on target and prediction",
      "betRange": { "min": 0.01, "max": 1.0, "currency": "USDC" },
      "params": {
        "prediction": "over | under",
        "target": "number (2-12)",
        "bet": "number (0.01 - 1.00)",
        "clientSeed": "string (optional)"
      }
    },
    {
      "id": "blackjack",
      "name": "Blackjack",
      "description": "Single-hand blackjack. Auto-plays basic strategy.",
      "endpoint": "POST /api/blackjack",
      "odds": "~49% win rate, 2x on win, 2.5x on blackjack",
      "betRange": { "min": 0.1, "max": 5.0, "currency": "USDC" },
      "params": {
        "bet": "number (0.10 - 5.00)",
        "clientSeed": "string (optional)"
      }
    }
  ],
  "fairness": { "method": "commit-reveal", "description": "..." },
  "payment": { "protocol": "x402", "network": "Base (EIP-155:8453)", "currency": "USDC" }
}
```

---

### `GET /api/info`

x402 payment info — full payment requirements for each game, payment flow description.

**Response:** Payment requirements per game, protocol description, and (in onchain mode) contract addresses.

---

### `POST /api/coinflip`

Play a coin flip.

**Request body:**
```json
{
  "choice": "heads",
  "bet": 0.10,
  "clientSeed": "optional-custom-seed"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `choice` | `"heads"` \| `"tails"` | ✅ | Your pick |
| `bet` | number | ✅ | Bet amount (0.01–1.00 USDC) |
| `clientSeed` | string | ❌ | Custom seed for provable fairness |

**Response (200):**
```json
{
  "game_id": "flip_1708400000_a1b2c3d4",
  "game": "coinflip",
  "result": "heads",
  "choice": "heads",
  "won": true,
  "bet": 0.10,
  "payout": 0.196,
  "multiplier": 1.96,
  "fairness_proof": {
    "serverSeed": "...",
    "serverSeedHash": "...",
    "clientSeed": "optional-custom-seed",
    "nonce": "...",
    "combinedHash": "..."
  }
}
```

---

### `POST /api/dice`

Roll two dice (2d6) and predict over/under a target.

**Request body:**
```json
{
  "prediction": "over",
  "target": 7,
  "bet": 0.25,
  "clientSeed": "optional"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prediction` | `"over"` \| `"under"` | ✅ | Predict total will be over/under target |
| `target` | integer (2–12) | ✅ | Target number |
| `bet` | number | ✅ | Bet amount (0.01–1.00 USDC) |
| `clientSeed` | string | ❌ | Custom seed |

**Response (200):**
```json
{
  "game_id": "dice_1708400000_a1b2c3d4",
  "game": "dice",
  "roll": [3, 5],
  "total": 8,
  "prediction": "over",
  "target": 7,
  "won": true,
  "bet": 0.25,
  "payout": 0.5880,
  "multiplier": 2.3520,
  "fairness_proof": { "..." }
}
```

**Payout multiplier** scales with probability. Examples:
- Over 7: ~41.7% chance → ~2.35x
- Under 7: ~41.7% chance → ~2.35x
- Over 11: ~2.8% chance → ~35x
- Under 3: ~2.8% chance → ~35x

---

### `POST /api/blackjack`

Play a single hand of blackjack (auto-plays basic strategy: hit < 17).

**Request body:**
```json
{
  "bet": 1.00,
  "clientSeed": "optional"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bet` | number | ✅ | Bet amount (0.10–5.00 USDC) |
| `clientSeed` | string | ❌ | Custom seed |

**Response (200):**
```json
{
  "game_id": "bj_1708400000_a1b2c3d4",
  "game": "blackjack",
  "playerHand": [
    { "rank": "K", "suit": "♠", "value": 10 },
    { "rank": "A", "suit": "♥", "value": 11 }
  ],
  "dealerHand": [
    { "rank": "9", "suit": "♦", "value": 9 },
    { "rank": "7", "suit": "♣", "value": 7 }
  ],
  "playerTotal": 21,
  "dealerTotal": 16,
  "outcome": "blackjack",
  "bet": 1.00,
  "payout": 2.50,
  "multiplier": 2.5,
  "fairness_proof": { "..." }
}
```

**Outcomes:**
| Outcome | Multiplier | Description |
|---------|-----------|-------------|
| `"blackjack"` | 2.5x | Natural 21 |
| `"win"` | 2.0x | Beat dealer |
| `"push"` | 1.0x | Tie — bet returned |
| `"lose"` | 0x | Dealer wins |

---

### `GET /api/history/:wallet`

Get game history for a wallet address.

**URL params:** `wallet` — Ethereum address (0x...) or `anonymous`

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 50 | Max records (max 200) |
| `offset` | integer | 0 | Pagination offset |

**Response:**
```json
{
  "wallet": "0x1234...",
  "totalGames": 100,
  "totalBet": 12.50,
  "totalPayout": 11.80,
  "netPnl": -0.70,
  "records": [
    {
      "gameId": "flip_...",
      "game": "coinflip",
      "wallet": "0x1234...",
      "bet": 0.10,
      "payout": 0.196,
      "won": true,
      "timestamp": "2026-02-20T10:00:00.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 100
}
```

---

### `GET /api/leaderboard`

Top wallets by total wagered and total won.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 20 | Max entries (max 100) |

**Response:**
```json
{
  "byWagered": [
    {
      "wallet": "0x1234...",
      "totalBet": 50.00,
      "totalPayout": 48.50,
      "netPnl": -1.50,
      "games": 200
    }
  ],
  "byWon": [
    {
      "wallet": "0xabcd...",
      "totalBet": 30.00,
      "totalPayout": 35.00,
      "netPnl": 5.00,
      "games": 150
    }
  ]
}
```

---

### `GET /api/stats`

Global game statistics.

**Response:**
```json
{
  "totalGames": 1000,
  "totalVolume": 250.00,
  "totalPayout": 242.50,
  "houseEdgeRealized": 3.0,
  "gameBreakdown": {
    "coinflip": { "games": 400, "volume": 80.00, "payout": 78.40 },
    "dice": { "games": 300, "volume": 70.00, "payout": 67.20 },
    "blackjack": { "games": 300, "volume": 100.00, "payout": 96.90 }
  },
  "uniqueWallets": 15
}
```

---

### `GET /api/contracts`

Contract addresses (useful for on-chain mode).

**Response:**
```json
{
  "mode": "dev",
  "network": "eip155:8453",
  "usdc": "0x...",
  "payout": "0x...",
  "payTo": "0x..."
}
```

---

### `GET /dashboard`

Serves the live dashboard HTML (connects via WebSocket at `ws://host:port/ws`).

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": "Optional extra info"
}
```

**Error codes:**
| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_CHOICE` | 400 | Invalid coinflip choice |
| `INVALID_BET` | 400 | Bet out of range |
| `INVALID_PREDICTION` | 400 | Invalid dice prediction |
| `INVALID_TARGET` | 400 | Dice target out of range |
| `IMPOSSIBLE_BET` | 400 | 0% win probability |
| `MALFORMED_REQUEST` | 400 | Missing required fields |
| `INVALID_WALLET` | 400 | Bad wallet address format |
| `GAME_ERROR` | 500 | Internal game error |

---

## Fairness Proof Verification

Every game response includes a `fairness_proof` object. To verify:

```
SHA-256(serverSeed + nonce) === serverSeedHash   ← server didn't change the seed
SHA-256(serverSeed + clientSeed + nonce) === combinedHash  ← outcome is deterministic
```

The random outcome is derived from the first 8 hex chars of `combinedHash`:
```
random = parseInt(combinedHash[0:8], 16) / 0x100000000  →  [0, 1)
```

Supply a custom `clientSeed` in your request to ensure the server can't predict your seed.

---

## WebSocket Events

Connect to `ws://host:port/ws` for real-time game events.

**Event types:**
| Type | Description |
|------|-------------|
| `request` | New game request received |
| `payment_received` | Payment header detected |
| `payment_required` | 402 response sent |
| `result` | Game completed with outcome |

Each event includes `timestamp`, `game`, `endpoint`, and relevant data.
