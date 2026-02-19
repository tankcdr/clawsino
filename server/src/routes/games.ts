import { Router, type Request, type Response } from "express";
import { playCoinflip, type CoinSide } from "../games/coinflip.js";
import { playDice, calculateMultiplier, type DicePrediction } from "../games/dice.js";
import { playBlackjack } from "../games/blackjack.js";

const router = Router();

// --- Game catalog ---

router.get("/games", (_req: Request, res: Response) => {
  res.json({
    games: [
      {
        id: "coinflip",
        name: "Coin Flip",
        description: "Pick heads or tails. 1.96x payout (2% house edge).",
        endpoint: "POST /api/coinflip",
        odds: "50/50, 1.96x payout",
        betRange: { min: 0.01, max: 1.0, currency: "USDC" },
        params: {
          choice: "heads | tails",
          bet: "number (0.01 - 1.00)",
          clientSeed: "string (optional, for provable fairness)",
        },
      },
      {
        id: "dice",
        name: "Dice Roll (2d6)",
        description: "Predict if the total of 2d6 will be over or under your target. Variable payout based on probability.",
        endpoint: "POST /api/dice",
        odds: "Variable — depends on target and prediction",
        betRange: { min: 0.01, max: 1.0, currency: "USDC" },
        params: {
          prediction: "over | under",
          target: "number (2-12)",
          bet: "number (0.01 - 1.00)",
          clientSeed: "string (optional)",
        },
      },
      {
        id: "blackjack",
        name: "Blackjack",
        description: "Single-hand blackjack. Auto-plays basic strategy (hit < 17). Blackjack pays 2.5x, win pays 2x, push returns bet.",
        endpoint: "POST /api/blackjack",
        odds: "~49% win rate, 2x on win, 2.5x on blackjack",
        betRange: { min: 0.1, max: 5.0, currency: "USDC" },
        params: {
          bet: "number (0.10 - 5.00)",
          clientSeed: "string (optional)",
        },
      },
    ],
    fairness: {
      method: "commit-reveal",
      description: "Each response includes a fairness_proof object. Verify by checking SHA-256(serverSeed + nonce) === serverSeedHash, and SHA-256(serverSeed + clientSeed + nonce) === combinedHash. The random outcome is derived from the combinedHash.",
    },
    payment: {
      protocol: "x402",
      network: "Base (EIP-155:8453)",
      currency: "USDC",
      description: "Include X-PAYMENT header with x402 payment payload. Without it, you'll receive a 402 Payment Required response with payment instructions.",
    },
  });
});

// --- Coinflip ---

router.post("/coinflip", (req: Request, res: Response) => {
  try {
    const { choice, bet, clientSeed } = req.body;

    if (!choice || !["heads", "tails"].includes(choice)) {
      res.status(400).json({ error: 'Invalid choice. Must be "heads" or "tails".' });
      return;
    }
    if (typeof bet !== "number" || bet < 0.01 || bet > 1.0) {
      res.status(400).json({ error: "Bet must be between 0.01 and 1.00 USDC." });
      return;
    }

    const result = playCoinflip({ choice: choice as CoinSide, bet, clientSeed });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Game error", details: String(err) });
  }
});

// --- Dice ---

router.post("/dice", (req: Request, res: Response) => {
  try {
    const { prediction, target, bet, clientSeed } = req.body;

    if (!prediction || !["over", "under"].includes(prediction)) {
      res.status(400).json({ error: 'Invalid prediction. Must be "over" or "under".' });
      return;
    }
    if (typeof target !== "number" || target < 2 || target > 12) {
      res.status(400).json({ error: "Target must be between 2 and 12." });
      return;
    }
    if (typeof bet !== "number" || bet < 0.01 || bet > 1.0) {
      res.status(400).json({ error: "Bet must be between 0.01 and 1.00 USDC." });
      return;
    }

    const multiplier = calculateMultiplier(prediction as DicePrediction, target);
    if (multiplier === 0) {
      res.status(400).json({ error: "Impossible bet — 0% win probability for this prediction/target." });
      return;
    }

    const result = playDice({ prediction: prediction as DicePrediction, target, bet, clientSeed });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Game error", details: String(err) });
  }
});

// --- Blackjack ---

router.post("/blackjack", (req: Request, res: Response) => {
  try {
    const { bet, clientSeed } = req.body;

    if (typeof bet !== "number" || bet < 0.1 || bet > 5.0) {
      res.status(400).json({ error: "Bet must be between 0.10 and 5.00 USDC." });
      return;
    }

    const result = playBlackjack({ bet, clientSeed });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Game error", details: String(err) });
  }
});

export default router;
