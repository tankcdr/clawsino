import {
  generateServerSeed,
  generateNonce,
  generateFairRandom,
  createCommitment,
  createFairnessProof,
  type FairnessProof,
} from "../utils/fairness.js";

export type CoinSide = "heads" | "tails";

export interface CoinflipRequest {
  choice: CoinSide;
  bet: number;
  clientSeed?: string;
}

export interface CoinflipResult {
  game: "coinflip";
  result: CoinSide;
  choice: CoinSide;
  won: boolean;
  bet: number;
  payout: number;
  multiplier: number;
  fairness_proof: FairnessProof;
}

const PAYOUT_MULTIPLIER = 1.96; // 2% house edge

export function playCoinflip(request: CoinflipRequest): CoinflipResult {
  const { choice, bet, clientSeed = "default" } = request;

  const serverSeed = generateServerSeed();
  const nonce = generateNonce();

  // Commitment (would be sent before game in a real commit-reveal flow)
  createCommitment(serverSeed, nonce);

  // Generate result
  const random = generateFairRandom(serverSeed, clientSeed, nonce);
  const result: CoinSide = random < 0.5 ? "heads" : "tails";
  const won = result === choice;
  const payout = won ? parseFloat((bet * PAYOUT_MULTIPLIER).toFixed(6)) : 0;

  return {
    game: "coinflip",
    result,
    choice,
    won,
    bet,
    payout,
    multiplier: PAYOUT_MULTIPLIER,
    fairness_proof: createFairnessProof(serverSeed, clientSeed, nonce),
  };
}
