import { describe, it, expect } from "vitest";
import {
  generateServerSeed,
  generateNonce,
  sha256,
  createCommitment,
  generateFairRandom,
  createFairnessProof,
  verifyFairnessProof,
} from "../utils/fairness.js";

describe("fairness", () => {
  it("generates unique server seeds", () => {
    const s1 = generateServerSeed();
    const s2 = generateServerSeed();
    expect(s1).not.toBe(s2);
    expect(s1).toHaveLength(64);
  });

  it("generates unique nonces", () => {
    const n1 = generateNonce();
    const n2 = generateNonce();
    expect(n1).not.toBe(n2);
    expect(n1).toHaveLength(32);
  });

  it("sha256 is deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("commitment matches proof", () => {
    const serverSeed = generateServerSeed();
    const nonce = generateNonce();
    const commitment = createCommitment(serverSeed, nonce);
    const proof = createFairnessProof(serverSeed, "clientSeed", nonce);
    expect(proof.serverSeedHash).toBe(commitment.serverSeedHash);
  });

  it("generateFairRandom returns [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const r = generateFairRandom(generateServerSeed(), "client", generateNonce());
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it("generateFairRandom is deterministic", () => {
    const r1 = generateFairRandom("seed", "client", "nonce");
    const r2 = generateFairRandom("seed", "client", "nonce");
    expect(r1).toBe(r2);
  });

  it("verifyFairnessProof succeeds on valid proof", () => {
    const serverSeed = generateServerSeed();
    const nonce = generateNonce();
    const proof = createFairnessProof(serverSeed, "clientSeed", nonce);
    expect(verifyFairnessProof(proof)).toBe(true);
  });

  it("verifyFairnessProof fails on tampered proof", () => {
    const proof = createFairnessProof(generateServerSeed(), "client", generateNonce());
    proof.serverSeed = "tampered";
    expect(verifyFairnessProof(proof)).toBe(false);
  });
});
