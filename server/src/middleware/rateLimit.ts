/**
 * Simple in-memory rate limiter middleware.
 * No external deps — uses a sliding window counter per IP.
 */
import { type Request, type Response, type NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  windowMs: number;      // Time window in ms
  maxRequests: number;   // Max requests per window
  message?: string;      // Custom error message
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,      // 1 minute
  maxRequests: 60,       // 60 req/min
};

export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const store = new Map<string, RateLimitEntry>();

  // Cleanup stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60_000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + cfg.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", cfg.maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, cfg.maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > cfg.maxRequests) {
      res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: cfg.message || "Too many requests. Please try again later.",
          retryAfterMs: entry.resetAt - now,
        },
      });
      return;
    }

    next();
  };
}

export default rateLimitMiddleware;
