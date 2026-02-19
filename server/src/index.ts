import express from "express";
import cors from "cors";
import gameRoutes from "./routes/games.js";
import { paymentMiddleware } from "./middleware/payment.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3402");

// Middleware
app.use(cors());
app.use(express.json());

// Payment config
const paymentConfig = {
  payTo: process.env.PAY_TO_ADDRESS || "0x0000000000000000000000000000000000000000",
  network: process.env.NETWORK || "eip155:8453",
  asset: process.env.ASSET || "USDC",
  facilitatorUrl: process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  description: "Clawsino — Agentic Microtransaction Casino",
  devMode: process.env.NODE_ENV !== "production",
  demoMode: process.env.X402_MODE === "demo",
};

// Apply x402 payment middleware to game endpoints
app.use("/api/coinflip", paymentMiddleware(paymentConfig));
app.use("/api/dice", paymentMiddleware(paymentConfig));
app.use("/api/blackjack", paymentMiddleware(paymentConfig));

// Routes
app.use("/api", gameRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "clawsino", version: "0.1.0" });
});

// Root
app.get("/", (_req, res) => {
  res.json({
    name: "🎰 Clawsino — Agentic Microtransaction Casino",
    version: "0.1.0",
    docs: "GET /api/games",
    health: "GET /health",
    games: ["POST /api/coinflip", "POST /api/dice", "POST /api/blackjack"],
    payment: "x402 (USDC on Base)",
  });
});

app.listen(PORT, () => {
  console.log(`🎰 Clawsino server running on port ${PORT}`);
  console.log(`   Mode: ${paymentConfig.demoMode ? "DEMO (402 enforced, dev payments accepted)" : paymentConfig.devMode ? "DEV (payments skipped)" : "PRODUCTION"}`);
  console.log(`   Pay to: ${paymentConfig.payTo}`);
  console.log(`   Network: ${paymentConfig.network}`);
});

export default app;
