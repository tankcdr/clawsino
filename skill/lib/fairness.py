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

    Expected keys: server_seed, nonce, committed_hash, hash_algo (optional).
    """
    if not proof or "server_seed" not in proof:
        return False

    return verify_commit_reveal(
        server_seed=proof["server_seed"],
        nonce=proof.get("nonce", ""),
        committed_hash=proof["committed_hash"],
        hash_algo=proof.get("hash_algo", "sha256"),
    )
