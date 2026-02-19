"""Wallet management — key loading, USDC balance checks on Base."""

import json
import os
from pathlib import Path

from eth_account import Account
from web3 import Web3

# Base mainnet RPC (public)
BASE_RPC = "https://mainnet.base.org"

# USDC on Base
USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USDC_DECIMALS = 6

# Minimal ERC-20 ABI for balanceOf
ERC20_ABI = [
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    }
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


def get_usdc_balance(address: str | None = None) -> float:
    """Check USDC balance on Base for address (defaults to configured wallet)."""
    if address is None:
        address = get_address()
    if not address:
        raise ValueError("No wallet configured. Set CLAWSINO_PRIVATE_KEY or config.")

    w3 = Web3(Web3.HTTPProvider(BASE_RPC))
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(USDC_ADDRESS), abi=ERC20_ABI
    )
    raw = contract.functions.balanceOf(Web3.to_checksum_address(address)).call()
    return raw / (10**USDC_DECIMALS)
