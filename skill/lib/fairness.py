"""Client-side fairness verification for commit-reveal proofs."""

import hashlib


def sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def keccak256_hex(data: str) -> str:
    from web3 import Web3
    return Web3.keccak(text=data).hex()


def verify_commit_reveal(
    server_seed: str,
    nonce: str,
    committed_hash: str,
    hash_algo: str = "sha256",
) -> bool:
    """Verify that hash(server_seed + nonce) matches the committed hash.

    Args:
        server_seed: Revealed server seed.
        nonce: Game nonce / client seed.
        committed_hash: Hash the server committed before the game.
        hash_algo: "sha256" or "keccak256".

    Returns:
        True if the proof is valid.
    """
    preimage = server_seed + nonce
    if hash_algo == "keccak256":
        computed = keccak256_hex(preimage)
    else:
        computed = sha256_hex(preimage)

    # Normalize — strip 0x prefix for comparison
    committed = committed_hash.lower().removeprefix("0x")
    computed = computed.lower().removeprefix("0x")
    return computed == committed


def verify_game_proof(proof: dict) -> bool:
    """Verify a fairness proof dict from the game server.

    Handles both snake_case and camelCase field names from the server.
    Server sends: serverSeed, serverSeedHash, clientSeed, nonce, combinedHash
    """
    if not proof:
        return False

    server_seed = proof.get("serverSeed") or proof.get("server_seed")
    nonce = proof.get("nonce", "")
    committed_hash = proof.get("serverSeedHash") or proof.get("committed_hash")
    hash_algo = proof.get("hash_algo", "sha256")

    if not server_seed or not committed_hash:
        return False

    # Verify: hash(serverSeed + nonce) == serverSeedHash
    if not verify_commit_reveal(server_seed, nonce, committed_hash, hash_algo):
        return False

    # Also verify combinedHash if present
    combined_hash = proof.get("combinedHash") or proof.get("combined_hash")
    client_seed = proof.get("clientSeed") or proof.get("client_seed", "")
    if combined_hash:
        preimage = server_seed + client_seed + nonce
        computed = sha256_hex(preimage)
        if computed.lower().removeprefix("0x") != combined_hash.lower().removeprefix("0x"):
            return False

    return True
