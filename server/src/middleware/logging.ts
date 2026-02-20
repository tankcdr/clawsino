/**
 * Request logging middleware for game endpoints.
 * Logs: timestamp, game type, bet amount, result (win/lose), wallet address.
 * No sensitive data (no private keys, no payment signatures).
 */
import { type Request, type Response, type NextFunction } from "express";

export interface GameLogEntry {
  timestamp: string;
  game: string;
  method: string;
  path: string;
  wallet: string;
  bet: number | null;
  statusCode: number;
  won: boolean | null;
  payout: number | null;
  durationMs: number;
}

/**
 * Create logging middleware that captures game request/response info.
 */
export function requestLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    // Intercept res.json to capture response data
    const origJson = res.json.bind(res);
    res.json = function (body: any) {
      const duration = Date.now() - start;
      const game = extractGame(req.path);

      if (req.method === "POST" && game) {
        const entry: GameLogEntry = {
          timestamp: new Date().toISOString(),
          game,
          method: req.method,
          path: req.originalUrl,
          wallet: extractWallet(req),
          bet: req.body?.bet ?? null,
          statusCode: res.statusCode,
          won: body?.won ?? (body?.outcome === "win" || body?.outcome === "blackjack") ?? null,
          payout: body?.payout ?? null,
          durationMs: duration,
        };

        // Skip logging 402s (payment required) — only log completed games
        if (res.statusCode !== 402) {
          logGame(entry);
        }
      }

      return origJson(body);
    } as any;

    next();
  };
}

function extractGame(path: string): string | null {
  const match = path.match(/\/(coinflip|dice|blackjack)/);
  return match ? match[1] : null;
}

function extractWallet(req: Request): string {
  return (req as any).payment?.playerAddress ||
    req.headers["x-wallet"] as string ||
    "anonymous";
}

function logGame(entry: GameLogEntry): void {
  const icon = entry.won ? "✅" : entry.won === false ? "❌" : "➖";
  const betStr = entry.bet !== null ? `${entry.bet} USDC` : "?";
  const payoutStr = entry.payout !== null ? `→ ${entry.payout} USDC` : "";
  
  console.log(
    `${icon} [${entry.game}] ${entry.wallet.slice(0, 10)}... bet ${betStr} ${payoutStr} (${entry.durationMs}ms)`
  );
}

export default requestLoggingMiddleware;
