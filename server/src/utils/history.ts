/**
 * In-memory game history store.
 * Production would use Redis or a database.
 */

export interface GameRecord {
  gameId: string;
  game: string;
  wallet: string;
  bet: number;
  payout: number;
  won: boolean;
  outcome?: string;
  timestamp: string;
}

const MAX_HISTORY = 10_000; // Max records in memory
const history: GameRecord[] = [];
const walletIndex = new Map<string, GameRecord[]>();

export function recordGame(record: GameRecord): void {
  history.push(record);
  if (history.length > MAX_HISTORY) {
    const removed = history.shift()!;
    // Clean up wallet index
    const walletRecords = walletIndex.get(removed.wallet);
    if (walletRecords) {
      const idx = walletRecords.indexOf(removed);
      if (idx >= 0) walletRecords.splice(idx, 1);
      if (walletRecords.length === 0) walletIndex.delete(removed.wallet);
    }
  }

  const key = record.wallet.toLowerCase();
  if (!walletIndex.has(key)) walletIndex.set(key, []);
  walletIndex.get(key)!.push(record);
}

export function getHistory(wallet: string, limit = 50, offset = 0): { records: GameRecord[]; total: number } {
  const key = wallet.toLowerCase();
  const records = walletIndex.get(key) || [];
  return {
    records: records.slice(-limit - offset, records.length - offset).reverse(),
    total: records.length,
  };
}

export function getStats(wallet: string): { totalGames: number; totalBet: number; totalPayout: number; netPnl: number } {
  const key = wallet.toLowerCase();
  const records = walletIndex.get(key) || [];
  let totalBet = 0, totalPayout = 0;
  for (const r of records) {
    totalBet += r.bet;
    totalPayout += r.payout;
  }
  return {
    totalGames: records.length,
    totalBet: parseFloat(totalBet.toFixed(6)),
    totalPayout: parseFloat(totalPayout.toFixed(6)),
    netPnl: parseFloat((totalPayout - totalBet).toFixed(6)),
  };
}

/** Get leaderboard — top wallets by total wagered and total won. */
export function getLeaderboard(limit = 20): {
  byWagered: { wallet: string; totalBet: number; totalPayout: number; netPnl: number; games: number }[];
  byWon: { wallet: string; totalBet: number; totalPayout: number; netPnl: number; games: number }[];
} {
  const walletStats: { wallet: string; totalBet: number; totalPayout: number; netPnl: number; games: number }[] = [];

  for (const [wallet, records] of walletIndex.entries()) {
    if (wallet === "anonymous") continue;
    let totalBet = 0, totalPayout = 0;
    for (const r of records) {
      totalBet += r.bet;
      totalPayout += r.payout;
    }
    walletStats.push({
      wallet,
      totalBet: parseFloat(totalBet.toFixed(6)),
      totalPayout: parseFloat(totalPayout.toFixed(6)),
      netPnl: parseFloat((totalPayout - totalBet).toFixed(6)),
      games: records.length,
    });
  }

  const byWagered = [...walletStats].sort((a, b) => b.totalBet - a.totalBet).slice(0, limit);
  const byWon = [...walletStats].sort((a, b) => b.totalPayout - a.totalPayout).slice(0, limit);

  return { byWagered, byWon };
}

/** Get global stats across all games. */
export function getGlobalStats(): {
  totalGames: number;
  totalVolume: number;
  totalPayout: number;
  houseEdgeRealized: number;
  gameBreakdown: Record<string, { games: number; volume: number; payout: number }>;
  uniqueWallets: number;
} {
  let totalVolume = 0, totalPayout = 0;
  const gameBreakdown: Record<string, { games: number; volume: number; payout: number }> = {};

  for (const r of history) {
    totalVolume += r.bet;
    totalPayout += r.payout;
    if (!gameBreakdown[r.game]) gameBreakdown[r.game] = { games: 0, volume: 0, payout: 0 };
    gameBreakdown[r.game].games++;
    gameBreakdown[r.game].volume += r.bet;
    gameBreakdown[r.game].payout += r.payout;
  }

  // Round breakdown values
  for (const g of Object.values(gameBreakdown)) {
    g.volume = parseFloat(g.volume.toFixed(6));
    g.payout = parseFloat(g.payout.toFixed(6));
  }

  const houseEdge = totalVolume > 0 ? (totalVolume - totalPayout) / totalVolume : 0;

  return {
    totalGames: history.length,
    totalVolume: parseFloat(totalVolume.toFixed(6)),
    totalPayout: parseFloat(totalPayout.toFixed(6)),
    houseEdgeRealized: parseFloat((houseEdge * 100).toFixed(4)),
    gameBreakdown,
    uniqueWallets: walletIndex.size,
  };
}

/** Clear all history (for testing). */
export function clearHistory(): void {
  history.length = 0;
  walletIndex.clear();
}
