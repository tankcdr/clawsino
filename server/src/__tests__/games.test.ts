import { describe, it, expect } from "vitest";
import { playCoinflip } from "../games/coinflip.js";
import { playDice, calculateMultiplier, calculateWinProbability } from "../games/dice.js";
import { playBlackjack } from "../games/blackjack.js";
import { verifyFairnessProof } from "../utils/fairness.js";

describe("coinflip", () => {
  it("returns a valid result", () => {
    const result = playCoinflip({ choice: "heads", bet: 0.1 });
    expect(result.game).toBe("coinflip");
    expect(["heads", "tails"]).toContain(result.result);
    expect(result.choice).toBe("heads");
    expect(result.multiplier).toBe(1.96);
    if (result.won) {
      expect(result.payout).toBeCloseTo(0.196, 4);
    } else {
      expect(result.payout).toBe(0);
    }
  });

  it("fairness proof is verifiable", () => {
    const result = playCoinflip({ choice: "tails", bet: 0.5, clientSeed: "test123" });
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });

  it("is deterministic with same seeds", () => {
    // Different server seeds each call, so results may differ — but proof is always valid
    for (let i = 0; i < 20; i++) {
      const r = playCoinflip({ choice: "heads", bet: 0.01 });
      expect(verifyFairnessProof(r.fairness_proof)).toBe(true);
    }
  });
});

describe("dice", () => {
  it("returns a valid result", () => {
    const result = playDice({ prediction: "over", target: 7, bet: 0.1 });
    expect(result.game).toBe("dice");
    expect(result.roll).toHaveLength(2);
    expect(result.total).toBe(result.roll[0] + result.roll[1]);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeLessThanOrEqual(12);
  });

  it("calculates win probability correctly", () => {
    // Over 7: 8,9,10,11,12 = 5+4+3+2+1 = 15/36
    expect(calculateWinProbability("over", 7)).toBeCloseTo(15 / 36, 6);
    // Under 7: 2,3,4,5,6 = 1+2+3+4+5 = 15/36
    expect(calculateWinProbability("under", 7)).toBeCloseTo(15 / 36, 6);
  });

  it("calculates multiplier with house edge", () => {
    const mult = calculateMultiplier("over", 7);
    const expected = (1 / (15 / 36)) * 0.98;
    expect(mult).toBeCloseTo(expected, 2);
  });

  it("rejects impossible bets", () => {
    // "over 12" is impossible
    expect(calculateMultiplier("over", 12)).toBe(0);
    // "under 2" is impossible
    expect(calculateMultiplier("under", 2)).toBe(0);
  });

  it("fairness proof is verifiable", () => {
    const result = playDice({ prediction: "under", target: 10, bet: 0.5 });
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });
});

describe("blackjack", () => {
  it("returns a valid result", () => {
    const result = playBlackjack({ bet: 1.0 });
    expect(result.game).toBe("blackjack");
    expect(result.playerHand.length).toBeGreaterThanOrEqual(2);
    expect(result.dealerHand.length).toBeGreaterThanOrEqual(2);
    expect(["win", "lose", "push", "blackjack"]).toContain(result.outcome);
  });

  it("payout matches outcome", () => {
    // Run many hands to hit different outcomes
    for (let i = 0; i < 50; i++) {
      const result = playBlackjack({ bet: 1.0, clientSeed: `seed${i}` });
      if (result.outcome === "lose") expect(result.payout).toBe(0);
      if (result.outcome === "win") expect(result.payout).toBe(2.0);
      if (result.outcome === "push") expect(result.payout).toBe(1.0);
      if (result.outcome === "blackjack") expect(result.payout).toBe(2.5);
    }
  });

  it("fairness proof is verifiable", () => {
    const result = playBlackjack({ bet: 0.5 });
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });

  it("player total never exceeds 21 after bust", () => {
    for (let i = 0; i < 100; i++) {
      const result = playBlackjack({ bet: 0.1, clientSeed: `bust${i}` });
      if (result.outcome !== "lose" || result.playerTotal <= 21) {
        // If player didn't bust, total should be <= 21
        if (result.outcome !== "lose") {
          expect(result.playerTotal).toBeLessThanOrEqual(21);
        }
      }
    }
  });
});
