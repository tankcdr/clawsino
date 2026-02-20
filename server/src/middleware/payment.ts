/**
 * x402-compatible payment middleware for dynamic bet amounts.
 *
 * Architecture: Swappable payment verifier via PaymentVerifier interface.
 * When @x402/express SDK is available, swap in RealX402Verifier.
 * Until then, the built-in verifiers follow the same x402 flow:
 *   402 response → client pays → X-PAYMENT header → server verifies.
 *
 * Supports three modes:
 * - devMode: skip payment entirely (local dev)
 * - demoMode: enforce 402 flow but accept dev payment headers (x402:dev:*)
 * - onchainMode: verify real USDC transfers on-chain (anvil/Base)
 */
import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { ethers } from "ethers";

// ---- Swappable Payment Verifier Interface ----

export interface PaymentVerifyResult {
  valid: boolean;
  txHash?: string;
  from?: string;
  error?: string;
}

export interface PaymentVerifier {
  name: string;
  verify(paymentHeader: string, config: PaymentConfig, expectedAmount: number): Promise<PaymentVerifyResult>;
}

/** Dev/demo verifier — accepts any header, especially x402:dev:* */
export class DevPaymentVerifier implements PaymentVerifier {
  name = "dev";
  async verify(paymentHeader: string): Promise<PaymentVerifyResult> {
    if (paymentHeader.startsWith("x402:dev:")) {
      return { valid: true, txHash: paymentHeader.split(":")[2] || crypto.randomUUID() };
    }
    return { valid: true, txHash: `0x${crypto.randomBytes(32).toString("hex")}` };
  }
}

/** On-chain verifier — checks USDC Transfer event in tx receipt */
export class OnchainPaymentVerifier implements PaymentVerifier {
  name = "onchain";
  async verify(paymentHeader: string, config: PaymentConfig, expectedAmount: number): Promise<PaymentVerifyResult> {
    return verifyOnchainPayment(paymentHeader, config, expectedAmount);
  }
}

/**
 * Placeholder for real @x402/express SDK integration.
 * When SDK is available, implement this class to call the facilitator's /verify endpoint.
 *
 * Example:
 *   import { HTTPFacilitatorClient } from "@x402/core/server";
 *   export class X402SdkVerifier implements PaymentVerifier { ... }
 */

export interface PaymentRequirement {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface PaymentConfig {
  payTo: string;
  network: string;
  asset: string;
  facilitatorUrl: string;
  description: string;
  /** If true, skip payment verification (for local dev / testing) */
  devMode?: boolean;
  /** If true, enforce 402 flow but accept dev payment headers (x402:dev:*) */
  demoMode?: boolean;
  /** If true, verify real on-chain USDC transfers */
  onchainMode?: boolean;
  /** RPC URL for on-chain verification */
  rpcUrl?: string;
  /** USDC contract address */
  usdcAddress?: string;
  /** Payout contract address */
  payoutAddress?: string;
  /** Game server private key for calling recordGame */
  gameServerPrivateKey?: string;
}

export interface PaymentPayload {
  scheme: "exact";
  network: string;
  payload: {
    signature: string;
    authorization: Record<string, unknown>;
  };
}

const DEFAULT_CONFIG: Partial<PaymentConfig> = {
  network: "eip155:8453", // Base mainnet
  asset: "USDC",
  facilitatorUrl: "https://x402.org/facilitator",
};

// ERC-20 Transfer event signature
const TRANSFER_EVENT_TOPIC = ethers.id("Transfer(address,address,uint256)");

// Minimal ERC-20 ABI for verification
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// ClawsinoPayout ABI (recordGame)
const PAYOUT_ABI = [
  "function recordGame(address player, uint256 betAmount, bool won, uint256 payoutAmount)",
  "function bankroll() view returns (uint256)",
];

/**
 * Extract bet amount from request body.
 */
function extractBetAmount(req: Request): number {
  const bet = req.body?.bet;
  if (typeof bet !== "number" || bet <= 0) return 0;
  return bet;
}

/**
 * Build a 402 Payment Required response per the x402 spec.
 */
function buildPaymentRequired(
  config: PaymentConfig,
  amount: string,
  resource: string,
): PaymentRequirement {
  return {
    scheme: "exact",
    network: config.network,
    maxAmountRequired: amount,
    resource,
    description: config.description,
    mimeType: "application/json",
    payTo: config.payTo,
    maxTimeoutSeconds: 60,
    asset: config.asset,
  };
}

/**
 * Verify a dev/demo payment header.
 */
async function verifyDevPayment(
  paymentHeader: string,
): Promise<{ valid: boolean; txHash?: string }> {
  if (paymentHeader.startsWith("x402:dev:")) {
    const txHash = paymentHeader.split(":")[2] || crypto.randomUUID();
    return { valid: true, txHash };
  }
  return { valid: true, txHash: `0x${crypto.randomBytes(32).toString("hex")}` };
}

/**
 * Verify an on-chain USDC transfer by tx hash.
 */
async function verifyOnchainPayment(
  paymentHeader: string,
  config: PaymentConfig,
  expectedAmount: number,
): Promise<{ valid: boolean; txHash?: string; from?: string; error?: string }> {
  // Parse tx hash from header: "x402:tx:<hash>"
  let txHash: string;
  if (paymentHeader.startsWith("x402:tx:")) {
    txHash = paymentHeader.substring(8);
  } else if (paymentHeader.startsWith("0x")) {
    txHash = paymentHeader;
  } else {
    return { valid: false, error: "Invalid payment header format. Expected x402:tx:<txhash>" };
  }

  if (!config.rpcUrl || !config.usdcAddress) {
    return { valid: false, error: "Server not configured for on-chain verification" };
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { valid: false, txHash, error: "Transaction not found" };
    }

    if (receipt.status !== 1) {
      return { valid: false, txHash, error: "Transaction reverted" };
    }

    // Look for USDC Transfer event to our payTo address
    const usdcAddr = config.usdcAddress.toLowerCase();
    const payToAddr = config.payTo.toLowerCase();
    const expectedRaw = BigInt(Math.round(expectedAmount * 1e6));

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdcAddr) continue;
      if (log.topics[0] !== TRANSFER_EVENT_TOPIC) continue;

      // Decode Transfer event
      const to = "0x" + log.topics[2].slice(26);
      const value = BigInt(log.data);

      if (to.toLowerCase() === payToAddr && value >= expectedRaw) {
        const from = "0x" + log.topics[1].slice(26);
        return { valid: true, txHash, from };
      }
    }

    return { valid: false, txHash, error: "No matching USDC transfer found in tx" };
  } catch (err) {
    return { valid: false, txHash, error: `Verification error: ${err}` };
  }
}

/**
 * Record a game result on-chain via ClawsinoPayout.recordGame().
 * Returns the payout tx hash if successful.
 */
export async function recordGameOnchain(
  config: PaymentConfig,
  playerAddress: string,
  betAmount: number,
  won: boolean,
  payoutAmount: number,
): Promise<{ txHash?: string; error?: string }> {
  if (!config.rpcUrl || !config.payoutAddress || !config.gameServerPrivateKey) {
    return { error: "Server not configured for on-chain payouts" };
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.gameServerPrivateKey, provider);
    const payout = new ethers.Contract(config.payoutAddress, PAYOUT_ABI, wallet);

    const betRaw = BigInt(Math.round(betAmount * 1e6));
    const payoutRaw = BigInt(Math.round(payoutAmount * 1e6));

    const tx = await payout.recordGame(playerAddress, betRaw, won, payoutRaw);
    const receipt = await tx.wait();

    return { txHash: receipt.hash };
  } catch (err) {
    return { error: `On-chain payout error: ${err}` };
  }
}

/**
 * Create x402-compatible payment middleware for game endpoints.
 */
export function paymentMiddleware(config: PaymentConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config } as Required<PaymentConfig>;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip payment for GET requests (info endpoints)
    if (req.method === "GET") {
      next();
      return;
    }

    // Dev mode: skip payment entirely (but not in demo or onchain mode)
    if (cfg.devMode && !cfg.demoMode && !cfg.onchainMode) {
      (req as any).payment = { verified: true, amount: extractBetAmount(req), devMode: true };
      next();
      return;
    }

    const betAmount = extractBetAmount(req);
    if (betAmount <= 0) {
      res.status(400).json({ error: "Invalid or missing bet amount" });
      return;
    }

    // Check for payment header
    const paymentHeader =
      req.headers["x-payment"] as string ||
      req.headers["payment-signature"] as string;

    if (!paymentHeader) {
      // Return 402 Payment Required
      const requirement = buildPaymentRequired(
        cfg,
        betAmount.toFixed(6),
        req.originalUrl,
      );

      // In onchain mode, include extra info for the client
      if (cfg.onchainMode) {
        requirement.extra = {
          mode: "onchain",
          usdcAddress: cfg.usdcAddress,
          payoutAddress: cfg.payoutAddress,
          rpcUrl: cfg.rpcUrl,
        };
      }

      res.status(402).json({
        error: "Payment Required",
        paymentRequirements: [requirement],
        facilitatorUrl: cfg.facilitatorUrl,
        message: cfg.onchainMode
          ? `Transfer ${betAmount} USDC to ${cfg.payTo}. Include tx hash as X-PAYMENT: x402:tx:<hash>`
          : `This endpoint requires a payment of ${betAmount} ${cfg.asset}. Include an X-PAYMENT header with your x402 payment payload.`,
      });
      return;
    }

    // Verify payment via swappable verifier
    try {
      const verifier: PaymentVerifier = cfg.onchainMode
        ? new OnchainPaymentVerifier()
        : new DevPaymentVerifier();

      let result = await verifier.verify(paymentHeader, cfg, betAmount);

      if (!result.valid) {
        res.status(402).json({
          error: "Payment verification failed",
          details: result.error,
        });
        return;
      }

      (req as any).payment = {
        verified: true,
        amount: betAmount,
        txHash: result.txHash,
        playerAddress: result.from,
        onchain: cfg.onchainMode,
      };

      // Store config on request for post-game payout
      (req as any).paymentConfig = cfg;

      next();
    } catch (err) {
      res.status(402).json({ error: "Payment processing error", details: String(err) });
    }
  };
}

export default paymentMiddleware;
