import { describe, it, expect, beforeEach } from "vitest";
import { recordGame, getHistory, getStats, clearHistory } from "../utils/history.js";

describe("game history", () => {
  beforeEach(() => clearHistory());

  it("records and retrieves games", () => {
    recordGame({ gameId: "flip_1", game: "coinflip", wallet: "0xABC", bet: 0.1, payout: 0.196, won: true, timestamp: new Date().toISOString() });
    const { records, total } = getHistory("0xABC");
    expect(total).toBe(1);
    expect(records[0].gameId).toBe("flip_1");
  });

  it("is case-insensitive on wallet", () => {
    recordGame({ gameId: "flip_1", game: "coinflip", wallet: "0xABC", bet: 0.1, payout: 0, won: false, timestamp: new Date().toISOString() });
    const { total } = getHistory("0xabc");
    expect(total).toBe(1);
  });

  it("returns empty for unknown wallet", () => {
    const { records, total } = getHistory("0x0000000000000000000000000000000000000000");
    expect(total).toBe(0);
    expect(records).toHaveLength(0);
  });

  it("calculates stats correctly", () => {
    recordGame({ gameId: "1", game: "coinflip", wallet: "0xABC", bet: 1.0, payout: 1.96, won: true, timestamp: new Date().toISOString() });
    recordGame({ gameId: "2", game: "coinflip", wallet: "0xABC", bet: 1.0, payout: 0, won: false, timestamp: new Date().toISOString() });
    recordGame({ gameId: "3", game: "dice", wallet: "0xABC", bet: 0.5, payout: 0, won: false, timestamp: new Date().toISOString() });

    const stats = getStats("0xabc");
    expect(stats.totalGames).toBe(3);
    expect(stats.totalBet).toBeCloseTo(2.5, 4);
    expect(stats.totalPayout).toBeCloseTo(1.96, 4);
    expect(stats.netPnl).toBeCloseTo(-0.54, 4);
  });

  it("respects limit", () => {
    for (let i = 0; i < 10; i++) {
      recordGame({ gameId: `g${i}`, game: "coinflip", wallet: "0xABC", bet: 0.01, payout: 0, won: false, timestamp: new Date().toISOString() });
    }
    const { records } = getHistory("0xABC", 3);
    expect(records).toHaveLength(3);
  });
});
