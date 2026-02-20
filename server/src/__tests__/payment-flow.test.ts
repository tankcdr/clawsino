/**
 * End-to-end x402 payment flow tests.
 *
 * Tests the full cycle:
 *   1. Request without payment → 402 Payment Required
 *   2. Request with valid payment header → game result
 *   3. Request with invalid payment → rejection
 */
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { paymentMiddleware, type PaymentConfig } from "../middleware/payment.js";
import gameRoutes from "../routes/games.js";

// --- Test server setup ---

function createTestApp(config: Partial<PaymentConfig> = {}) {
  const app = express();
  app.use(express.json());

  const paymentConfig: PaymentConfig = {
    payTo: "0x1234567890abcdef1234567890abcdef12345678",
    network: "eip155:8453",
    asset: "USDC",
    facilitatorUrl: "https://x402.org/facilitator",
    description: "Clawsino Test",
    devMode: false,
    demoMode: true, // enforce 402 flow but accept dev headers
    onchainMode: false,
    ...config,
  };

  app.use("/api/coinflip", paymentMiddleware(paymentConfig));
  app.use("/api/dice", paymentMiddleware(paymentConfig));
  app.use("/api/blackjack", paymentMiddleware(paymentConfig));
  app.use("/api", gameRoutes);

  // Info endpoint
  app.get("/api/info", (_req, res) => {
    res.json({ protocol: "x402", mode: "demo" });
  });

  return app;
}

// --- Tests ---

describe("x402 payment flow — demo mode", () => {
  const app = createTestApp();

  describe("Step 1: Request without payment → 402", () => {
    it("coinflip returns 402 with payment requirements", async () => {
      const res = await request(app)
        .post("/api/coinflip")
        .send({ choice: "heads", bet: 0.10 });

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("Payment Required");
      expect(res.body.paymentRequirements).toBeDefined();
      expect(res.body.paymentRequirements).toHaveLength(1);

      const req402 = res.body.paymentRequirements[0];
      expect(req402.scheme).toBe("exact");
      expect(req402.network).toBe("eip155:8453");
      expect(req402.maxAmountRequired).toBe("0.100000");
      expect(req402.asset).toBe("USDC");
      expect(req402.payTo).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(req402.resource).toContain("/api/coinflip");
    });

    it("dice returns 402 with correct bet amount", async () => {
      const res = await request(app)
        .post("/api/dice")
        .send({ prediction: "over", target: 7, bet: 0.50 });

      expect(res.status).toBe(402);
      expect(res.body.paymentRequirements[0].maxAmountRequired).toBe("0.500000");
    });

    it("blackjack returns 402 with correct bet amount", async () => {
      const res = await request(app)
        .post("/api/blackjack")
        .send({ bet: 2.00 });

      expect(res.status).toBe(402);
      expect(res.body.paymentRequirements[0].maxAmountRequired).toBe("2.000000");
    });

    it("402 response includes facilitator URL", async () => {
      const res = await request(app)
        .post("/api/coinflip")
        .send({ choice: "heads", bet: 0.01 });

      expect(res.status).toBe(402);
      expect(res.body.facilitatorUrl).toBe("https://x402.org/facilitator");
    });
  });

  describe("Step 2: Request with valid payment → game result", () => {
    it("coinflip succeeds with dev payment header", async () => {
      const res = await request(app)
        .post("/api/coinflip")
        .set("X-PAYMENT", "x402:dev:test-tx-123")
        .send({ choice: "heads", bet: 0.10 });

      expect(res.status).toBe(200);
      expect(res.body.game).toBe("coinflip");
      expect(["heads", "tails"]).toContain(res.body.result);
      expect(res.body.choice).toBe("heads");
      expect(res.body.bet).toBe(0.10);
      expect(res.body.fairness_proof).toBeDefined();
      expect(res.body.game_id).toMatch(/^flip_/);
    });

    it("dice succeeds with payment header", async () => {
      const res = await request(app)
        .post("/api/dice")
        .set("X-PAYMENT", "x402:dev:dice-tx-456")
        .send({ prediction: "over", target: 7, bet: 0.25 });

      expect(res.status).toBe(200);
      expect(res.body.game).toBe("dice");
      expect(res.body.roll).toHaveLength(2);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.total).toBeLessThanOrEqual(12);
    });

    it("blackjack succeeds with payment header", async () => {
      const res = await request(app)
        .post("/api/blackjack")
        .set("X-PAYMENT", "x402:dev:bj-tx-789")
        .send({ bet: 1.00 });

      expect(res.status).toBe(200);
      expect(res.body.game).toBe("blackjack");
      expect(["win", "lose", "push", "blackjack"]).toContain(res.body.outcome);
    });

    it("payment-signature header also works", async () => {
      const res = await request(app)
        .post("/api/coinflip")
        .set("Payment-Signature", "x402:dev:alt-header")
        .send({ choice: "tails", bet: 0.05 });

      expect(res.status).toBe(200);
      expect(res.body.game).toBe("coinflip");
    });
  });

  describe("Step 3: Edge cases", () => {
    it("missing bet amount returns 400", async () => {
      const res = await request(app)
        .post("/api/coinflip")
        .send({ choice: "heads" });

      // Without bet, payment middleware returns 400 before 402
      expect(res.status).toBe(400);
    });

    it("negative bet returns 400", async () => {
      const res = await request(app)
        .post("/api/coinflip")
        .send({ choice: "heads", bet: -1 });

      expect(res.status).toBe(400);
    });

    it("GET requests bypass payment middleware", async () => {
      const res = await request(app).get("/api/games");

      expect(res.status).toBe(200);
      expect(res.body.games).toBeDefined();
    });

    it("info endpoint returns x402 protocol info", async () => {
      const res = await request(app).get("/api/info");

      expect(res.status).toBe(200);
      expect(res.body.protocol).toBe("x402");
    });
  });
});

describe("x402 payment flow — dev mode (payments skipped)", () => {
  const app = createTestApp({ devMode: true, demoMode: false });

  it("coinflip succeeds without any payment header", async () => {
    const res = await request(app)
      .post("/api/coinflip")
      .send({ choice: "heads", bet: 0.10 });

    expect(res.status).toBe(200);
    expect(res.body.game).toBe("coinflip");
  });
});

describe("x402 payment flow — dynamic bet amounts", () => {
  const app = createTestApp();

  it("402 response reflects exact bet amount from request body", async () => {
    const bets = [0.01, 0.05, 0.25, 0.50, 1.00];

    for (const bet of bets) {
      const res = await request(app)
        .post("/api/coinflip")
        .send({ choice: "heads", bet });

      expect(res.status).toBe(402);
      expect(res.body.paymentRequirements[0].maxAmountRequired).toBe(bet.toFixed(6));
    }
  });

  it("payout reflects bet amount when game is won", async () => {
    // Play many games to find a win
    let foundWin = false;
    for (let i = 0; i < 50 && !foundWin; i++) {
      const res = await request(app)
        .post("/api/coinflip")
        .set("X-PAYMENT", `x402:dev:win-hunt-${i}`)
        .send({ choice: "heads", bet: 0.50 });

      expect(res.status).toBe(200);
      if (res.body.won) {
        expect(res.body.payout).toBeCloseTo(0.98, 2); // 0.50 * 1.96
        foundWin = true;
      } else {
        expect(res.body.payout).toBe(0);
      }
    }
    expect(foundWin).toBe(true);
  });
});
