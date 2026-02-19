import {
  generateServerSeed,
  generateNonce,
  generateFairRandom,
  createFairnessProof,
  type FairnessProof,
} from "../utils/fairness.js";

export type DicePrediction = "over" | "under";

export interface DiceRequest {
  prediction: DicePrediction;
  target: number; // 2-12
  bet: number;
  clientSeed?: string;
}

export interface DiceResult {
  game: "dice";
  roll: [number, number];
  total: number;
  prediction: DicePrediction;
  target: number;
  won: boolean;
  bet: number;
  payout: number;
  multiplier: number;
  fairness_proof: FairnessProof;
}

// Probability of each 2d6 total
const DICE_PROBABILITIES: Record<number, number> = {
  2: 1 / 36, 3: 2 / 36, 4: 3 / 36, 5: 4 / 36, 6: 5 / 36,
  7: 6 / 36, 8: 5 / 36, 9: 4 / 36, 10: 3 / 36, 11: 2 / 36, 12: 1 / 36,
};

const HOUSE_EDGE = 0.02;

/**
 * Calculate probability of winning for a given prediction and target.
 */
export function calculateWinProbability(prediction: DicePrediction, target: number): number {
  let prob = 0;
  for (let i = 2; i <= 12; i++) {
    if (prediction === "over" && i > target) prob += DICE_PROBABILITIES[i];
    if (prediction === "under" && i < target) prob += DICE_PROBABILITIES[i];
  }
  return prob;
}

/**
 * Calculate payout multiplier based on win probability with house edge.
 */
export function calculateMultiplier(prediction: DicePrediction, target: number): number {
  const prob = calculateWinProbability(prediction, target);
  if (prob <= 0) return 0;
  return parseFloat(((1 / prob) * (1 - HOUSE_EDGE)).toFixed(4));
}

/**
 * Roll 2d6 using provably fair random.
 */
function rollDice(serverSeed: string, clientSeed: string, nonce: string): [number, number] {
  const r1 = generateFairRandom(serverSeed, clientSeed, nonce + ":d1");
  const r2 = generateFairRandom(serverSeed, clientSeed, nonce + ":d2");
  const die1 = Math.floor(r1 * 6) + 1;
  const die2 = Math.floor(r2 * 6) + 1;
  return [die1, die2] as [number, number];
}

export function playDice(request: DiceRequest): DiceResult {
  const { prediction, target, bet, clientSeed = "default" } = request;

  if (target < 2 || target > 12) throw new Error("Target must be between 2 and 12");

  const serverSeed = generateServerSeed();
  const nonce = generateNonce();

  const roll = rollDice(serverSeed, clientSeed, nonce);
  const total = roll[0] + roll[1];

  const won =
    (prediction === "over" && total > target) ||
    (prediction === "under" && total < target);

  const multiplier = calculateMultiplier(prediction, target);
  const payout = won ? parseFloat((bet * multiplier).toFixed(6)) : 0;

  return {
    game: "dice",
    roll,
    total,
    prediction,
    target,
    won,
    bet,
    payout,
    multiplier,
    fairness_proof: createFairnessProof(serverSeed, clientSeed, nonce),
  };
}
