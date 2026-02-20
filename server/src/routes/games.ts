import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { playCoinflip, type CoinSide } from "../games/coinflip.js";
import { playDice, calculateMultiplier, type DicePrediction } from "../games/dice.js";
import { playBlackjack } from "../games/blackjack.js";
import { recordGameOnchain } from "../middleware/payment.js";
import { sendError, ErrorCodes } from "../utils/errors.js";
import { recordGame, getHistory, getStats } from "../utils/history.js";

const router = Router();

function gameId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function getWallet(req: Request): string {
  return (req as any).payment?.playerAddress || req.headers["x-wallet"] as string || "anonymous";
}

/**
 * After a game completes, record the result on-chain if in onchain mode.
 */
async function handleOnchainPayout(req: Request, won: boolean, betAmount: number, payoutAmount: number): Promise<string | undefined> {
  const payment = (req as any).payment;
  const config = (req as any).paymentConfig;
  if (!payment?.onchain || !config || !payment.playerAddress) return undefined;

  const result = await recordGameOnchain(config, payment.playerAddress, betAmount, won, won ? payoutAmount : 0);
  if (result.error) console.error(`⚠️ On-chain payout error: ${result.error}`);
  return result.txHash;
}

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

router.post("/coinflip", async (req: Request, res: Response) => {
  try {
    const { choice, bet, clientSeed } = req.body || {};

    if (choice === undefined && bet === undefined) {
      return sendError(res, 400, ErrorCodes.MALFORMED_REQUEST, "Request body must include 'choice' and 'bet'.");
    }
    if (!choice || !["heads", "tails"].includes(choice)) {
      return sendError(res, 400, ErrorCodes.INVALID_CHOICE, 'Choice must be "heads" or "tails".');
    }
    if (typeof bet !== "number" || !isFinite(bet) || bet < 0.01 || bet > 1.0) {
      return sendError(res, 400, ErrorCodes.INVALID_BET, "Bet must be a number between 0.01 and 1.00 USDC.");
    }

    const result = playCoinflip({ choice: choice as CoinSide, bet, clientSeed });
    const id = gameId("flip");
    const payoutTxHash = await handleOnchainPayout(req, result.won, bet, result.payout);

    recordGame({ gameId: id, game: "coinflip", wallet: getWallet(req), bet, payout: result.payout, won: result.won, timestamp: new Date().toISOString() });

    const response: any = { game_id: id, ...result };
    if (payoutTxHash) response.payoutTxHash = payoutTxHash;
    if ((req as any).payment?.txHash) response.betTxHash = (req as any).payment.txHash;
    res.json(response);
  } catch (err) {
    sendError(res, 500, ErrorCodes.GAME_ERROR, "Internal game error.", String(err));
  }
});

// --- Dice ---

router.post("/dice", async (req: Request, res: Response) => {
  try {
    const { prediction, target, bet, clientSeed } = req.body || {};

    if (prediction === undefined && target === undefined && bet === undefined) {
      return sendError(res, 400, ErrorCodes.MALFORMED_REQUEST, "Request body must include 'prediction', 'target', and 'bet'.");
    }
    if (!prediction || !["over", "under"].includes(prediction)) {
      return sendError(res, 400, ErrorCodes.INVALID_PREDICTION, 'Prediction must be "over" or "under".');
    }
    if (typeof target !== "number" || !isFinite(target) || !Number.isInteger(target) || target < 2 || target > 12) {
      return sendError(res, 400, ErrorCodes.INVALID_TARGET, "Target must be an integer between 2 and 12.");
    }
    if (typeof bet !== "number" || !isFinite(bet) || bet < 0.01 || bet > 1.0) {
      return sendError(res, 400, ErrorCodes.INVALID_BET, "Bet must be a number between 0.01 and 1.00 USDC.");
    }

    const multiplier = calculateMultiplier(prediction as DicePrediction, target);
    if (multiplier === 0) {
      return sendError(res, 400, ErrorCodes.IMPOSSIBLE_BET, "Impossible bet — 0% win probability for this prediction/target.");
    }

    const result = playDice({ prediction: prediction as DicePrediction, target, bet, clientSeed });
    const id = gameId("dice");
    const payoutTxHash = await handleOnchainPayout(req, result.won, bet, result.payout);

    recordGame({ gameId: id, game: "dice", wallet: getWallet(req), bet, payout: result.payout, won: result.won, timestamp: new Date().toISOString() });

    const response: any = { game_id: id, ...result };
    if (payoutTxHash) response.payoutTxHash = payoutTxHash;
    if ((req as any).payment?.txHash) response.betTxHash = (req as any).payment.txHash;
    res.json(response);
  } catch (err) {
    sendError(res, 500, ErrorCodes.GAME_ERROR, "Internal game error.", String(err));
  }
});

// --- Blackjack ---

router.post("/blackjack", async (req: Request, res: Response) => {
  try {
    const { bet, clientSeed } = req.body || {};

    if (bet === undefined) {
      return sendError(res, 400, ErrorCodes.MALFORMED_REQUEST, "Request body must include 'bet'.");
    }
    if (typeof bet !== "number" || !isFinite(bet) || bet < 0.1 || bet > 5.0) {
      return sendError(res, 400, ErrorCodes.INVALID_BET, "Bet must be a number between 0.10 and 5.00 USDC.");
    }

    const result = playBlackjack({ bet, clientSeed });
    const won = result.outcome === "win" || result.outcome === "blackjack";
    const id = gameId("bj");
    const payoutTxHash = await handleOnchainPayout(req, won, bet, result.payout);

    recordGame({ gameId: id, game: "blackjack", wallet: getWallet(req), bet, payout: result.payout, won, outcome: result.outcome, timestamp: new Date().toISOString() });

    const response: any = { game_id: id, ...result };
    if (payoutTxHash) response.payoutTxHash = payoutTxHash;
    if ((req as any).payment?.txHash) response.betTxHash = (req as any).payment.txHash;
    res.json(response);
  } catch (err) {
    sendError(res, 500, ErrorCodes.GAME_ERROR, "Internal game error.", String(err));
  }
});

// --- History ---

router.get("/history/:wallet", (req: Request, res: Response) => {
  const { wallet } = req.params;
  if (!wallet || !/^(0x[a-fA-F0-9]{40}|anonymous)$/.test(wallet)) {
    return sendError(res, 400, ErrorCodes.INVALID_WALLET, "Invalid wallet address. Must be a valid Ethereum address (0x...).");
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  const { records, total } = getHistory(wallet, limit, offset);
  const stats = getStats(wallet);

  res.json({ wallet, ...stats, records, limit, offset, total });
});

export default router;
