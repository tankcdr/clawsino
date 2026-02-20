"""Wallet management — key loading, USDC balance checks, and transfers."""

import json
import os
from pathlib import Path

from eth_account import Account
from web3 import Web3

# Default RPC — override with CLAWSINO_RPC_URL for local anvil
BASE_RPC = "https://mainnet.base.org"

# USDC on Base (mainnet) — overridden by server's 402 response in onchain mode
USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USDC_DECIMALS = 6

# Minimal ERC-20 ABI
ERC20_ABI = [
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "transfer",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

CONFIG_DIR = Path.home() / ".openclaw" / "clawsino"
CONFIG_FILE = CONFIG_DIR / "config.json"


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {}


def save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def get_private_key() -> str | None:
    """Load private key from env or config."""
    key = os.environ.get("CLAWSINO_PRIVATE_KEY")
    if key:
        return key
    cfg = _load_config()
    return cfg.get("private_key")


def get_rpc_url() -> str:
    """Get RPC URL — defaults to Base mainnet, override with CLAWSINO_RPC_URL."""
    return os.environ.get("CLAWSINO_RPC_URL", BASE_RPC)


def get_server_url() -> str:
    """Load server URL from env or config."""
    url = os.environ.get("CLAWSINO_SERVER_URL")
    if url:
        return url.rstrip("/")
    cfg = _load_config()
    return cfg.get("server_url", "http://localhost:3000").rstrip("/")


def get_account() -> Account | None:
    """Return eth_account Account from private key."""
    key = get_private_key()
    if not key:
        return None
    return Account.from_key(key)


def get_address() -> str | None:
    acct = get_account()
    return acct.address if acct else None


def get_web3(rpc_url: str | None = None) -> Web3:
    """Get a Web3 instance connected to the configured RPC."""
    url = rpc_url or get_rpc_url()
    return Web3(Web3.HTTPProvider(url))


def get_usdc_balance(address: str | None = None, rpc_url: str | None = None, usdc_address: str | None = None) -> float:
    """Check USDC balance for address."""
    if address is None:
        address = get_address()
    if not address:
        raise ValueError("No wallet configured. Set CLAWSINO_PRIVATE_KEY or config.")

    w3 = get_web3(rpc_url)
    token = usdc_address or USDC_ADDRESS
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(token), abi=ERC20_ABI
    )
    raw = contract.functions.balanceOf(Web3.to_checksum_address(address)).call()
    return raw / (10**USDC_DECIMALS)


def transfer_usdc(to: str, amount: float, rpc_url: str | None = None, usdc_address: str | None = None) -> str:
    """Sign and send a USDC transfer. Returns tx hash."""
    key = get_private_key()
    if not key:
        raise ValueError("No wallet configured. Set CLAWSINO_PRIVATE_KEY.")

    w3 = get_web3(rpc_url)
    acct = Account.from_key(key)
    token = usdc_address or USDC_ADDRESS
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(token), abi=ERC20_ABI
    )

    raw_amount = int(amount * 10**USDC_DECIMALS)

    tx = contract.functions.transfer(
        Web3.to_checksum_address(to), raw_amount
    ).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address),
        "gas": 100000,
        "gasPrice": w3.eth.gas_price,
        "chainId": w3.eth.chain_id,
    })

    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)

    return receipt["transactionHash"].hex()
