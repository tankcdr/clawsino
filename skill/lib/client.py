"""API client for the Clawsino game server."""

import json
import time
from pathlib import Path

import requests

from lib.wallet import get_server_url, get_address, get_account

HISTORY_DIR = Path.home() / ".openclaw" / "clawsino"
HISTORY_FILE = HISTORY_DIR / "history.json"


def _load_history() -> list[dict]:
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text())
    return []


def _save_history(history: list[dict]) -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2))


def _record_game(game_type: str, request_data: dict, response_data: dict) -> None:
    history = _load_history()
    entry = {
        "id": response_data.get("game_id", f"{game_type}_{int(time.time())}"),
        "type": game_type,
        "timestamp": time.time(),
        "request": request_data,
        "result": response_data,
    }
    history.append(entry)
    # Keep last 500 games
    if len(history) > 500:
        history = history[-500:]
    _save_history(history)


def _build_headers() -> dict:
    """Build request headers including x402 payment stub."""
    headers = {"Content-Type": "application/json"}
    address = get_address()
    if address:
        # x402 payment headers — the server's x402 middleware will handle
        # the actual payment negotiation. We include our address for identification.
        headers["X-Payer-Address"] = address
    return headers


def _post(endpoint: str, data: dict) -> dict:
    """POST to the game server."""
    url = f"{get_server_url()}{endpoint}"
    headers = _build_headers()

    resp = requests.post(url, json=data, headers=headers, timeout=30)

    # Handle x402 Payment Required flow — auto-retry with dev payment header
    if resp.status_code == 402:
        import hashlib, time as _t
        tx_hash = hashlib.sha256(f"{_t.time()}".encode()).hexdigest()
        headers["X-PAYMENT"] = f"x402:dev:{tx_hash}"
        resp = requests.post(url, json=data, headers=headers, timeout=30)
        if resp.status_code == 402:
            payment_info = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            return {
                "error": "payment_required",
                "message": "x402 payment required — real payment not yet implemented",
                "payment_info": payment_info,
            }

    resp.raise_for_status()
    return resp.json()


def demo_post(endpoint: str, data: dict) -> dict:
    """Two-step x402 demo flow. Returns structured trace of the full negotiation."""
    url = f"{get_server_url()}{endpoint}"
    headers = _build_headers()

    trace: dict = {"endpoint": endpoint, "data": data, "steps": []}

    # Step 1 — send WITHOUT payment header → expect 402
    resp1 = requests.post(url, json=data, headers=headers, timeout=30)
    step1: dict = {"status": resp1.status_code, "body": None}
    try:
        step1["body"] = resp1.json()
    except Exception:
        step1["body"] = resp1.text[:500]
    trace["steps"].append(step1)

    # Step 2 — send WITH dev payment header → expect 200
    import hashlib, time as _t
    tx_hash = "0x" + hashlib.sha256(f"demo:{_t.time()}".encode()).hexdigest()[:40]
    pay_headers = {**headers, "X-PAYMENT": f"x402:dev:{tx_hash}"}
    resp2 = requests.post(url, json=data, headers=pay_headers, timeout=30)
    step2: dict = {"status": resp2.status_code, "body": None, "tx_hash": tx_hash}
    try:
        step2["body"] = resp2.json()
    except Exception:
        step2["body"] = resp2.text[:500]
    trace["steps"].append(step2)

    return trace


def _get(endpoint: str, params: dict | None = None) -> dict:
    """GET from the game server."""
    url = f"{get_server_url()}{endpoint}"
    headers = _build_headers()
    resp = requests.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


# --- Game API ---

def play_coinflip(choice: str, amount: float) -> dict:
    """Play coinflip. choice: 'heads' or 'tails'."""
    data = {"choice": choice.lower(), "bet": amount}
    result = _post("/api/coinflip", data)
    _record_game("coinflip", data, result)
    return result


def play_dice(prediction: str, target: int, amount: float) -> dict:
    """Play dice. prediction: 'over' or 'under', target: number."""
    data = {"prediction": prediction.lower(), "target": target, "bet": amount}
    result = _post("/api/dice", data)
    _record_game("dice", data, result)
    return result


def play_blackjack(amount: float) -> dict:
    """Play blackjack."""
    data = {"bet": amount}
    result = _post("/api/blackjack", data)
    _record_game("blackjack", data, result)
    return result


def list_games() -> dict:
    """List available games from server, with fallback to local info."""
    try:
        return _get("/api/games")
    except Exception:
        return {
            "games": [
                {
                    "name": "Coinflip",
                    "endpoint": "/api/coinflip",
                    "bet_range": [0.01, 1.00],
                    "house_edge": "2%",
                    "payout": "1.96x",
                    "description": "Pick heads or tails.",
                },
                {
                    "name": "Dice",
                    "endpoint": "/api/dice",
                    "bet_range": [0.01, 1.00],
                    "house_edge": "variable",
                    "description": "Predict over/under a target with 2d6.",
                },
                {
                    "name": "Blackjack",
                    "endpoint": "/api/blackjack",
                    "bet_range": [0.10, 5.00],
                    "payout": "2x win, 2.5x natural",
                    "description": "Standard single-hand blackjack.",
                },
            ]
        }


def get_game_by_id(game_id: str) -> dict | None:
    """Find a game in local history by ID."""
    for entry in reversed(_load_history()):
        if entry.get("id") == game_id:
            return entry
    return None


def get_history(limit: int = 20) -> list[dict]:
    """Return recent game history."""
    history = _load_history()
    return history[-limit:]


def get_stats() -> dict:
    """Compute stats from local history."""
    history = _load_history()
    if not history:
        return {"games_played": 0, "total_wagered": 0, "total_pnl": 0, "win_rate": 0}

    total = len(history)
    wins = sum(1 for g in history if g.get("result", {}).get("won", False))
    wagered = sum(g.get("request", {}).get("bet", 0) for g in history)
    pnl = sum(
        g.get("result", {}).get("payout", 0) - g.get("request", {}).get("bet", 0)
        for g in history
    )

    return {
        "games_played": total,
        "wins": wins,
        "losses": total - wins,
        "win_rate": round(wins / total * 100, 1) if total else 0,
        "total_wagered": round(wagered, 4),
        "total_pnl": round(pnl, 4),
    }
