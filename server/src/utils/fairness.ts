import crypto from "crypto";

export interface FairnessCommitment {
  serverSeedHash: string;
  nonce: string;
}

export interface FairnessProof {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: string;
  combinedHash: string;
}

/**
 * Generate a cryptographically secure server seed.
 */
export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a random nonce.
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Hash a value with SHA-256.
 */
export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Create a commitment (hash of serverSeed + nonce) before the game runs.
 */
export function createCommitment(serverSeed: string, nonce: string): FairnessCommitment {
  return {
    serverSeedHash: sha256(serverSeed + nonce),
    nonce,
  };
}

/**
 * Generate a provably fair random number in [0, 1) from the combined seeds.
 */
export function generateFairRandom(serverSeed: string, clientSeed: string, nonce: string): number {
  const combined = sha256(serverSeed + clientSeed + nonce);
  // Use first 8 hex chars (32 bits) for the result
  const value = parseInt(combined.substring(0, 8), 16);
  return value / 0x100000000;
}

/**
 * Generate a full fairness proof after the game completes.
 */
export function createFairnessProof(
  serverSeed: string,
  clientSeed: string,
  nonce: string,
): FairnessProof {
  return {
    serverSeed,
    serverSeedHash: sha256(serverSeed + nonce),
    clientSeed,
    nonce,
    combinedHash: sha256(serverSeed + clientSeed + nonce),
  };
}

/**
 * Verify a fairness proof (client-side verification).
 */
export function verifyFairnessProof(proof: FairnessProof): boolean {
  const expectedHash = sha256(proof.serverSeed + proof.nonce);
  if (expectedHash !== proof.serverSeedHash) return false;

  const expectedCombined = sha256(proof.serverSeed + proof.clientSeed + proof.nonce);
  if (expectedCombined !== proof.combinedHash) return false;

  return true;
}
