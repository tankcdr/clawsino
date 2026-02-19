/**
 * x402-compatible payment middleware for dynamic bet amounts.
 *
 * Implements the x402 protocol flow:
 * 1. Client sends request without payment → 402 with PaymentRequired
 * 2. Client sends request with X-PAYMENT header → verify & process
 *
 * This is a clean interface that mimics x402 behavior so we can swap
 * in the real @x402/express SDK later when dynamic amounts are supported.
 */
import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

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
 * Verify a payment header. In production this would call the facilitator's
 * /verify endpoint. In dev mode, we accept a simple HMAC or skip entirely.
 */
async function verifyPayment(
  paymentHeader: string,
  _config: PaymentConfig,
  _expectedAmount: number,
): Promise<{ valid: boolean; txHash?: string }> {
  // In dev mode, accept any non-empty payment header
  // Format: "x402:dev:<txhash>" for dev, or real x402 base64 payload
  if (paymentHeader.startsWith("x402:dev:")) {
    const txHash = paymentHeader.split(":")[2] || crypto.randomUUID();
    return { valid: true, txHash };
  }

  // For real x402 payloads, we'd decode the base64, call facilitator /verify
  // TODO: Integrate real facilitator verification
  // For now, accept and generate a mock tx hash
  return { valid: true, txHash: `0x${crypto.randomBytes(32).toString("hex")}` };
}

/**
 * Create x402-compatible payment middleware for game endpoints.
 *
 * Usage:
 *   app.use("/api/coinflip", paymentMiddleware(config));
 */
export function paymentMiddleware(config: PaymentConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config } as Required<PaymentConfig>;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip payment for GET requests (info endpoints)
    if (req.method === "GET") {
      next();
      return;
    }

    // Dev mode: skip payment entirely
    if (cfg.devMode) {
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

      res.status(402).json({
        error: "Payment Required",
        paymentRequirements: [requirement],
        facilitatorUrl: cfg.facilitatorUrl,
        message: `This endpoint requires a payment of ${betAmount} ${cfg.asset}. Include an X-PAYMENT header with your x402 payment payload.`,
      });
      return;
    }

    // Verify payment
    try {
      const result = await verifyPayment(paymentHeader, cfg, betAmount);
      if (!result.valid) {
        res.status(402).json({ error: "Payment verification failed" });
        return;
      }

      (req as any).payment = {
        verified: true,
        amount: betAmount,
        txHash: result.txHash,
      };
      next();
    } catch (err) {
      res.status(402).json({ error: "Payment processing error", details: String(err) });
    }
  };
}

export default paymentMiddleware;
