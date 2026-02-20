import { describe, it, expect } from "vitest";
import { playCoinflip } from "../games/coinflip.js";
import { playDice, calculateMultiplier, calculateWinProbability } from "../games/dice.js";
import { playBlackjack } from "../games/blackjack.js";
import { verifyFairnessProof, createFairnessProof, generateServerSeed, generateNonce } from "../utils/fairness.js";

// ========== Coinflip Edge Cases ==========

describe("coinflip edge cases", () => {
  it("rejects zero bet at route level (game function still works)", () => {
    // The game function itself doesn't validate — route does. Test game still runs:
    const result = playCoinflip({ choice: "heads", bet: 0 });
    expect(result.payout).toBe(0); // Even if won, 0 * 1.96 = 0
  });

  it("handles minimum bet", () => {
    const result = playCoinflip({ choice: "heads", bet: 0.01 });
    expect(result.bet).toBe(0.01);
    if (result.won) expect(result.payout).toBeCloseTo(0.0196, 4);
  });

  it("handles maximum bet", () => {
    const result = playCoinflip({ choice: "tails", bet: 1.0 });
    expect(result.bet).toBe(1.0);
    if (result.won) expect(result.payout).toBeCloseTo(1.96, 4);
  });

  it("handles empty clientSeed (defaults to 'default')", () => {
    const result = playCoinflip({ choice: "heads", bet: 0.1 });
    expect(result.fairness_proof.clientSeed).toBe("default");
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });

  it("handles very long clientSeed", () => {
    const longSeed = "x".repeat(10000);
    const result = playCoinflip({ choice: "heads", bet: 0.1, clientSeed: longSeed });
    expect(result.fairness_proof.clientSeed).toBe(longSeed);
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });

  it("handles unicode clientSeed", () => {
    const result = playCoinflip({ choice: "heads", bet: 0.1, clientSeed: "🎰🎲🃏" });
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });

  it("handles special characters in clientSeed", () => {
    const result = playCoinflip({ choice: "heads", bet: 0.1, clientSeed: '<script>alert("xss")</script>' });
    expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
  });
});

// ========== Dice Edge Cases ==========

describe("dice edge cases", () => {
  it("rejects over 12 (impossible bet)", () => {
    expect(calculateMultiplier("over", 12)).toBe(0);
  });

  it("rejects under 2 (impossible bet)", () => {
    expect(calculateMultiplier("under", 2)).toBe(0);
  });

  it("handles extreme target: over 2 (almost certain win)", () => {
    const prob = calculateWinProbability("over", 2);
    expect(prob).toBeCloseTo(35 / 36, 6);
    const mult = calculateMultiplier("over", 2);
    expect(mult).toBeGreaterThan(0);
    expect(mult).toBeLessThan(1.1); // Nearly 1:1
  });

  it("handles extreme target: under 12 (almost certain win)", () => {
    const prob = calculateWinProbability("under", 12);
    expect(prob).toBeCloseTo(35 / 36, 6);
  });

  it("handles extreme target: over 11 (very unlikely win)", () => {
    const prob = calculateWinProbability("over", 11);
    expect(prob).toBeCloseTo(1 / 36, 6);
    const mult = calculateMultiplier("over", 11);
    expect(mult).toBeGreaterThan(30); // High multiplier for low prob
  });

  it("roll values are always 1-6", () => {
    for (let i = 0; i < 200; i++) {
      const result = playDice({ prediction: "over", target: 7, bet: 0.01, clientSeed: `edge${i}` });
      expect(result.roll[0]).toBeGreaterThanOrEqual(1);
      expect(result.roll[0]).toBeLessThanOrEqual(6);
      expect(result.roll[1]).toBeGreaterThanOrEqual(1);
      expect(result.roll[1]).toBeLessThanOrEqual(6);
      expect(result.total).toBe(result.roll[0] + result.roll[1]);
    }
  });

  it("zero bet produces zero payout", () => {
    const result = playDice({ prediction: "over", target: 7, bet: 0 });
    expect(result.payout).toBe(0);
  });

  it("fairness proof valid for all targets", () => {
    for (let target = 2; target <= 12; target++) {
      const result = playDice({ prediction: "over", target, bet: 0.01 });
      expect(verifyFairnessProof(result.fairness_proof)).toBe(true);
    }
  });
});

// ========== Blackjack Edge Cases ==========

describe("blackjack edge cases", () => {
  it("handles minimum bet", () => {
    const result = playBlackjack({ bet: 0.1 });
    expect(result.bet).toBe(0.1);
  });

  it("handles maximum bet", () => {
    const result = playBlackjack({ bet: 5.0 });
    expect(result.bet).toBe(5.0);
  });

  it("zero bet produces zero payout on win", () => {
    // Run many to find a win
    let foundWin = false;
    for (let i = 0; i < 200; i++) {
      const result = playBlackjack({ bet: 0, clientSeed: `zero${i}` });
      if (result.outcome === "win" || result.outcome === "blackjack") {
        expect(result.payout).toBe(0);
        foundWin = true;
        break;
      }
    }
    // It's statistically near-impossible to not find a win in 200 tries
    expect(foundWin).toBe(true);
  });

  it("player hand always has at least 2 cards", () => {
    for (let i = 0; i < 100; i++) {
      const result = playBlackjack({ bet: 1, clientSeed: `hand${i}` });
      expect(result.playerHand.length).toBeGreaterThanOrEqual(2);
      expect(result.dealerHand.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("card values are correct", () => {
    for (let i = 0; i < 100; i++) {
      const result = playBlackjack({ bet: 1, clientSeed: `card${i}` });
      for (const card of [...result.playerHand, ...result.dealerHand]) {
        if (["J", "Q", "K"].includes(card.rank)) expect(card.value).toBe(10);
        else if (card.rank === "A") expect(card.value).toBe(11);
        else expect(card.value).toBe(parseInt(card.rank));
      }
    }
  });

  it("all outcomes are valid", () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const result = playBlackjack({ bet: 1, clientSeed: `outcome${i}` });
      outcomes.add(result.outcome);
    }
    // Should see all 4 outcomes in 500 games
    expect(outcomes).toContain("win");
    expect(outcomes).toContain("lose");
    // push and blackjack are rarer, but check they're valid if present
    for (const o of outcomes) {
      expect(["win", "lose", "push", "blackjack"]).toContain(o);
    }
  });
});

// ========== Fairness Tampered Seeds ==========

describe("fairness verification with tampered seeds", () => {
  it("fails when serverSeed is tampered", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    proof.serverSeed = "0000000000000000000000000000000000000000000000000000000000000000";
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("fails when serverSeedHash is tampered", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    proof.serverSeedHash = "0000000000000000000000000000000000000000000000000000000000000000";
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("fails when clientSeed is tampered", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    proof.clientSeed = "tampered_client";
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("fails when nonce is tampered", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    proof.nonce = "00000000000000000000000000000000";
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("fails when combinedHash is tampered", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    proof.combinedHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(verifyFairnessProof(proof)).toBe(false);
  });

  it("fails when all fields are swapped between two proofs", () => {
    const p1 = createFairnessProof(generateServerSeed(), "client1", generateNonce());
    const p2 = createFairnessProof(generateServerSeed(), "client2", generateNonce());
    // Mix fields from two different proofs
    const mixed = { ...p1, combinedHash: p2.combinedHash };
    expect(verifyFairnessProof(mixed)).toBe(false);
  });

  it("fails with empty strings", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    expect(verifyFairnessProof({ ...proof, serverSeed: "" })).toBe(false);
    expect(verifyFairnessProof({ ...proof, nonce: "" })).toBe(false);
  });

  it("succeeds for all game types with valid proofs", () => {
    // Coinflip
    for (let i = 0; i < 20; i++) {
      const r = playCoinflip({ choice: "heads", bet: 0.01, clientSeed: `v${i}` });
      expect(verifyFairnessProof(r.fairness_proof)).toBe(true);
    }
    // Dice
    for (let i = 0; i < 20; i++) {
      const r = playDice({ prediction: "over", target: 7, bet: 0.01, clientSeed: `v${i}` });
      expect(verifyFairnessProof(r.fairness_proof)).toBe(true);
    }
    // Blackjack
    for (let i = 0; i < 20; i++) {
      const r = playBlackjack({ bet: 0.1, clientSeed: `v${i}` });
      expect(verifyFairnessProof(r.fairness_proof)).toBe(true);
    }
  });
});
