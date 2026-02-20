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

/** Clear all history (for testing). */
export function clearHistory(): void {
  history.length = 0;
  walletIndex.clear();
}
