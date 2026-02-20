import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import gameRoutes from "./routes/games.js";
import { paymentMiddleware } from "./middleware/payment.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { requestLoggingMiddleware } from "./middleware/logging.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3402");

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(data: Record<string, unknown>) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Export broadcast for use in middleware
(globalThis as any).__clawsinoBroadcast = broadcast;

wss.on("connection", (ws) => {
  console.log("📺 Dashboard client connected");
  ws.on("close", () => console.log("📺 Dashboard client disconnected"));
});

// Load contract addresses from file if available (written by init service)
let contractAddresses: { usdc?: string; payout?: string; verifier?: string } = {};
const contractsFile = process.env.CONTRACTS_FILE;
if (contractsFile && fs.existsSync(contractsFile)) {
  try {
    contractAddresses = JSON.parse(fs.readFileSync(contractsFile, "utf-8"));
    console.log("📄 Loaded contract addresses from", contractsFile);
    console.log("   USDC:", contractAddresses.usdc);
    console.log("   Payout:", contractAddresses.payout);
  } catch (err) {
    console.warn("⚠️ Failed to load contracts file:", err);
  }
}

// CORS — configurable origins for future UI
const corsOrigins = process.env.CORS_ORIGINS;
const corsOptions = corsOrigins && corsOrigins !== "*"
  ? { origin: corsOrigins.split(",").map(s => s.trim()), credentials: true }
  : { origin: "*" };
app.use(cors(corsOptions));
app.use(express.json());

// Request logging middleware for game endpoints
app.use("/api/coinflip", requestLoggingMiddleware());
app.use("/api/dice", requestLoggingMiddleware());
app.use("/api/blackjack", requestLoggingMiddleware());

// Rate limiting — 60 requests per minute per IP for game endpoints
app.use("/api/coinflip", rateLimitMiddleware({ windowMs: 60_000, maxRequests: 60 }));
app.use("/api/dice", rateLimitMiddleware({ windowMs: 60_000, maxRequests: 60 }));
app.use("/api/blackjack", rateLimitMiddleware({ windowMs: 60_000, maxRequests: 60 }));

// Dashboard broadcast middleware — captures request info before payment middleware
app.use("/api/coinflip", (req: any, _res: any, next: any) => { req.__game = "coinflip"; next(); }, broadcastMiddleware);
app.use("/api/dice", (req: any, _res: any, next: any) => { req.__game = "dice"; next(); }, broadcastMiddleware);
app.use("/api/blackjack", (req: any, _res: any, next: any) => { req.__game = "blackjack"; next(); }, broadcastMiddleware);

// Broadcast request events and intercept responses — helper applied per-game above
function broadcastMiddleware(req: any, res: any, next: any) {
  if (req.method !== "POST") return next();

  const game = req.__game;
  const endpoint = req.originalUrl;
  const ts = new Date().toISOString();

  // Broadcast request
  broadcast({ type: "request", timestamp: ts, game, endpoint, body: req.body });

  // Check if payment header present
  const paymentHeader = req.headers["x-payment"] as string || req.headers["payment-signature"] as string;
  if (paymentHeader) {
    broadcast({ type: "payment_received", timestamp: ts, game, endpoint, paymentHeader });
  }

  // Intercept response to capture 402s and results
  const origJson = res.json.bind(res);
  res.json = function (body: any) {
    const now = new Date().toISOString();
    if (res.statusCode === 402) {
      broadcast({ type: "payment_required", timestamp: now, game, endpoint, paymentRequirements: body.paymentRequirements || body });
    } else if (res.statusCode >= 200 && res.statusCode < 300 && (body.outcome !== undefined || body.won !== undefined)) {
      broadcast({ type: "result", timestamp: now, game, endpoint, body });
    }
    return origJson(body);
  } as any;

  next();
}

// Determine mode
const x402Mode = process.env.X402_MODE || "";
const isOnchain = x402Mode === "onchain";
const isDemo = x402Mode === "demo";

// Payment config
const paymentConfig = {
  payTo: process.env.PAY_TO_ADDRESS || contractAddresses.payout || "0x0000000000000000000000000000000000000000",
  network: process.env.NETWORK || "eip155:8453",
  asset: process.env.ASSET || "USDC",
  facilitatorUrl: process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  description: "Clawsino — Agentic Microtransaction Casino",
  devMode: process.env.NODE_ENV !== "production" && !isOnchain && !isDemo,
  demoMode: isDemo,
  onchainMode: isOnchain,
  rpcUrl: process.env.RPC_URL || "http://localhost:8545",
  usdcAddress: process.env.USDC_ADDRESS || contractAddresses.usdc || "",
  payoutAddress: process.env.PAYOUT_ADDRESS || contractAddresses.payout || "",
  gameServerPrivateKey: process.env.GAME_SERVER_PRIVATE_KEY || "",
};

// Apply x402 payment middleware to game endpoints
app.use("/api/coinflip", paymentMiddleware(paymentConfig));
app.use("/api/dice", paymentMiddleware(paymentConfig));
app.use("/api/blackjack", paymentMiddleware(paymentConfig));

// Routes
app.use("/api", gameRoutes);

// Serve dashboard static files
const dashboardPath = process.env.DASHBOARD_PATH || path.resolve(__dirname, "../../dashboard");
app.use("/dashboard", express.static(dashboardPath));

// Health check (both /health and /api/health)
const healthHandler = (_req: any, res: any) => {
  res.json({
    status: "ok",
    service: "clawsino",
    version: "0.1.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mode: isOnchain ? "onchain" : isDemo ? "demo" : "dev",
  });
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Contract info (for clients to discover addresses without triggering game events)
app.get("/api/contracts", (_req, res) => {
  res.json({
    mode: isOnchain ? "onchain" : isDemo ? "demo" : "dev",
    network: paymentConfig.network,
    usdc: paymentConfig.usdcAddress || null,
    payout: paymentConfig.payoutAddress || null,
    payTo: paymentConfig.payTo,
  });
});

// x402 payment info endpoint — returns payment requirements for each game
app.get("/api/info", (_req, res) => {
  const mode = isOnchain ? "onchain" : isDemo ? "demo" : "dev";
  const baseRequirement = {
    scheme: "exact" as const,
    network: paymentConfig.network,
    asset: paymentConfig.asset,
    payTo: paymentConfig.payTo,
    facilitatorUrl: paymentConfig.facilitatorUrl,
    maxTimeoutSeconds: 60,
    mimeType: "application/json",
  };

  res.json({
    protocol: "x402",
    mode,
    description: "Clawsino — Agentic Microtransaction Casino. Pay-per-play via x402.",
    paymentFlow: {
      step1: "POST to a game endpoint without X-PAYMENT header",
      step2: "Receive 402 Payment Required with paymentRequirements",
      step3: "Send payment (USDC on Base) per the requirements",
      step4: "Re-send request with X-PAYMENT header containing payment proof",
      step5: "Receive game result + payout if you win",
    },
    games: {
      coinflip: {
        endpoint: "POST /api/coinflip",
        betRange: { min: 0.01, max: 1.0, currency: "USDC" },
        paymentRequirement: {
          ...baseRequirement,
          description: "Coinflip bet — 50/50, 1.96x payout",
          resource: "/api/coinflip",
          note: "maxAmountRequired is dynamic based on 'bet' field in request body",
        },
      },
      dice: {
        endpoint: "POST /api/dice",
        betRange: { min: 0.01, max: 1.0, currency: "USDC" },
        paymentRequirement: {
          ...baseRequirement,
          description: "Dice roll bet — variable payout based on target/prediction",
          resource: "/api/dice",
          note: "maxAmountRequired is dynamic based on 'bet' field in request body",
        },
      },
      blackjack: {
        endpoint: "POST /api/blackjack",
        betRange: { min: 0.1, max: 5.0, currency: "USDC" },
        paymentRequirement: {
          ...baseRequirement,
          description: "Blackjack bet — 2x win, 2.5x blackjack",
          resource: "/api/blackjack",
          note: "maxAmountRequired is dynamic based on 'bet' field in request body",
        },
      },
    },
    ...(isOnchain && {
      onchain: {
        rpcUrl: paymentConfig.rpcUrl,
        usdcAddress: paymentConfig.usdcAddress,
        payoutContract: paymentConfig.payoutAddress,
      },
    }),
  });
});

// Root
app.get("/", (_req, res) => {
  res.json({
    name: "🎰 Clawsino — Agentic Microtransaction Casino",
    version: "0.1.0",
    docs: "GET /api/games",
    health: "GET /health",
    dashboard: "GET /dashboard",
    games: ["POST /api/coinflip", "POST /api/dice", "POST /api/blackjack"],
    payment: "x402 (USDC on Base)",
    mode: isOnchain ? "onchain" : isDemo ? "demo" : "dev",
  });
});

const modeLabel = isOnchain ? "ONCHAIN (real USDC verification)" : isDemo ? "DEMO (402 enforced, dev payments accepted)" : "DEV (payments skipped)";

server.listen(PORT, () => {
  console.log(`🎰 Clawsino server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Mode: ${modeLabel}`);
  console.log(`   Pay to: ${paymentConfig.payTo}`);
  console.log(`   Network: ${paymentConfig.network}`);
  if (isOnchain) {
    console.log(`   RPC: ${paymentConfig.rpcUrl}`);
    console.log(`   USDC: ${paymentConfig.usdcAddress}`);
    console.log(`   Payout: ${paymentConfig.payoutAddress}`);
  }
});

export default app;
