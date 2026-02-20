import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import gameRoutes from "./routes/games.js";
import { paymentMiddleware } from "./middleware/payment.js";

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

// Middleware
app.use(cors());
app.use(express.json());

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

// Serve dashboard static files
const dashboardPath = path.resolve(__dirname, "../../dashboard");
app.use("/dashboard", express.static(dashboardPath));

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
    dashboard: "GET /dashboard",
    games: ["POST /api/coinflip", "POST /api/dice", "POST /api/blackjack"],
    payment: "x402 (USDC on Base)",
  });
});

server.listen(PORT, () => {
  console.log(`🎰 Clawsino server running on port ${PORT}`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Mode: ${paymentConfig.demoMode ? "DEMO (402 enforced, dev payments accepted)" : paymentConfig.devMode ? "DEV (payments skipped)" : "PRODUCTION"}`);
  console.log(`   Pay to: ${paymentConfig.payTo}`);
  console.log(`   Network: ${paymentConfig.network}`);
});

export default app;
