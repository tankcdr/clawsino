/**
 * Standardized JSON error responses.
 */
import { type Response } from "express";

export interface GameError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const ErrorCodes = {
  INVALID_CHOICE: "INVALID_CHOICE",
  INVALID_BET: "INVALID_BET",
  INVALID_PREDICTION: "INVALID_PREDICTION",
  INVALID_TARGET: "INVALID_TARGET",
  IMPOSSIBLE_BET: "IMPOSSIBLE_BET",
  INVALID_WALLET: "INVALID_WALLET",
  GAME_ERROR: "GAME_ERROR",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  MALFORMED_REQUEST: "MALFORMED_REQUEST",
} as const;

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: GameError = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}
