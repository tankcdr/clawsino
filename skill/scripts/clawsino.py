#!/usr/bin/env python3
"""Clawsino CLI — play casino games with USDC on Base via x402."""

import json
import os
import sys
import time
import requests

# Allow running from skill/ directory
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib import client, wallet, fairness

# Check if we're in onchain mode (server tells us via 402 response extra field)
ONCHAIN_MODE = os.environ.get("CLAWSINO_RPC_URL") or os.environ.get("X402_MODE") == "onchain"

# ---------------------------------------------------------------------------
# Demo mode rendering
# ---------------------------------------------------------------------------

DEMO_MODE = False


def _demo_format(game_name: str, endpoint: str, data: dict, trace: dict) -> str:
    """Format demo trace for chat (Telegram/Discord markdown-friendly)."""
    lines = []
    sep = "━" * 22
    lines.append(f"🎰 CLAWSINO — {game_name}")
    lines.append(sep)
    lines.append("")

    # Step 1 — initial request
    lines.append(f"▶ POST {endpoint}")
    lines.append(f"  {json.dumps(data, separators=(',', ':'))}")
    lines.append("")

    step1 = trace["steps"][0]
    lines.append(f"◀ {step1['status']} Payment Required")
    body1 = step1.get("body") or {}
    if isinstance(body1, dict):
        reqs = body1.get("paymentRequirements", [])
        if reqs:
            r = reqs[0]
            extra = r.get("extra", {})
            lines.append(f"  ┌─ x402 PaymentRequirement ─────────────")
            lines.append(f"  │ scheme:    {r.get('scheme', '?')}")
            lines.append(f"  │ network:   {r.get('network', '?')}")
            lines.append(f"  │ asset:     {r.get('asset', 'USDC')}")
            lines.append(f"  │ amount:    {r.get('maxAmountRequired', '?')} USDC")
            lines.append(f"  │ payTo:     {r.get('payTo', '?')}")
            if extra.get("usdcAddress"):
                lines.append(f"  │ USDC contract: {extra['usdcAddress']}")
            if extra.get("payoutAddress"):
                lines.append(f"  │ Payout contract: {extra['payoutAddress']}")
            if extra.get("mode"):
                lines.append(f"  │ mode:     {extra['mode']}")
            lines.append(f"  └──────────────────────────────────────")
        else:
            lines.append(f"  {body1.get('message', 'Payment required')}")
    lines.append("")

    # Payment signing
    step2_data = trace["steps"][1] if len(trace["steps"]) > 1 else {}
    tx_hash = step2_data.get("tx_hash", "0x???")
    is_onchain = step2_data.get("onchain", False)
    player_addr = None
    try:
        player_addr = wallet.get_address()
    except Exception:
        pass
    if is_onchain:
        lines.append("💳 Signing USDC transfer on Base...")
        if player_addr:
            lines.append(f"   from:  {player_addr}")
        pay_to = reqs[0].get("payTo", "?") if reqs else "?"
        lines.append(f"   to:    {pay_to}")
        lines.append(f"   value: {data.get('bet', '?')} USDC")
        lines.append(f"   ⛓️  tx: {tx_hash}")
    else:
        lines.append("💳 Signing USDC payment (dev mode)...")
    lines.append("")

    # Step 2 — retry with payment
    lines.append(f"▶ POST {endpoint} [+ X-PAYMENT]")
    lines.append("")

    step2 = trace["steps"][1]
    body2 = step2.get("body") or {}
    lines.append(f"◀ {step2['status']} OK")
    if isinstance(body2, dict) and not body2.get("error"):
        for key in ("result", "roll", "total"):
            if key in body2:
                lines.append(f"  {key.title()}: {body2[key]}")
        won = body2.get("won")
        if won is not None:
            lines.append(f"  Won: {won} {'✅' if won else '❌'}")
        payout = body2.get("payout")
        if payout is not None:
            lines.append(f"  Payout: {payout} USDC")
        # Blackjack hands (camelCase from server)
        player_hand = body2.get("playerHand") or body2.get("player_hand")
        dealer_hand = body2.get("dealerHand") or body2.get("dealer_hand")
        if player_hand:
            hand_str = "  ".join(f"{c.get('rank','?')}{c.get('suit','')}" for c in player_hand)
            lines.append(f"  Your hand:   {hand_str}  ({body2.get('playerTotal', '?')})")
        if dealer_hand:
            hand_str = "  ".join(f"{c.get('rank','?')}{c.get('suit','')}" for c in dealer_hand)
            lines.append(f"  Dealer hand: {hand_str}  ({body2.get('dealerTotal', '?')})")
        # Blackjack outcome
        outcome = body2.get("outcome")
        if outcome:
            outcome_map = {"win": "WIN ✅", "blackjack": "BLACKJACK! 🔥", "push": "PUSH 🤝", "lose": "LOSS ❌"}
            lines.append(f"  Outcome: {outcome_map.get(outcome, outcome.upper())}")
        # Show on-chain tx hashes (full — this is the point of the demo)
        bet_tx = body2.get("betTxHash")
        payout_tx = body2.get("payoutTxHash")
        if bet_tx or payout_tx:
            lines.append("")
            lines.append("  ⛓️  On-chain settlement:")
            if bet_tx:
                lines.append(f"     Bet tx:    {bet_tx}")
            if payout_tx:
                lines.append(f"     Payout tx: {payout_tx}")
        game_id = body2.get("game_id")
        if game_id:
            lines.append(f"  Game ID: {game_id}")
        fp = body2.get("fairness_proof")
        if fp and isinstance(fp, dict):
            verified = fp.get("verified", fp.get("valid", False))
            lines.append("")
            lines.append(f"🔐 Fairness: {'verified ✓' if verified else 'unverified'}")
            if game_id:
                lines.append(f"   → clawsino verify {game_id}")
    else:
        lines.append(f"  {json.dumps(body2, indent=2)}")

    lines.append(sep)

    # Bottom line summary
    if isinstance(body2, dict) and not body2.get("error"):
        outcome = body2.get("outcome")
        won = body2.get("won", outcome in ("win", "blackjack") if outcome else False)
        bet = data.get("bet", 0)
        payout = body2.get("payout", 0)
        pnl = payout - bet
        if outcome == "push":
            lines.append(f"🤝 PUSH — ${bet:.2f} returned")
        elif outcome == "blackjack":
            lines.append(f"🃏🔥 BLACKJACK! +${pnl:.2f} USDC")
        elif won:
            lines.append(f"✅ YOU WIN +${pnl:.2f} USDC")
        else:
            lines.append(f"❌ YOU LOSE -${bet:.2f} USDC")
    return "\n".join(lines)


def _network_label(network: str) -> str:
    if "8453" in network:
        return "Base"
    return network


def _get_local_usdc_address() -> str | None:
    """Probe the server's 402 response to get the local USDC contract address."""
    try:
        probe = requests.post(f"{wallet.get_server_url()}/api/coinflip",
            json={"choice": "heads", "bet": 0.01},
            headers={"Content-Type": "application/json"}, timeout=5)
        if probe.status_code == 402:
            reqs = probe.json().get("paymentRequirements", [])
            if reqs:
                return reqs[0].get("extra", {}).get("usdcAddress")
    except Exception:
        pass
    return None


def _demo_play(game_name: str, endpoint: str, data: dict) -> str:
    """Execute demo two-step flow and return formatted output."""
    # If onchain, show balance before/after
    rpc_url = os.environ.get("CLAWSINO_RPC_URL")
    balance_before = None
    balance_after = None
    usdc_addr = None

    if rpc_url:
        try:
            usdc_addr = _get_local_usdc_address()
            balance_before = wallet.get_usdc_balance(rpc_url=rpc_url, usdc_address=usdc_addr)
        except Exception:
            pass

    trace = client.demo_post(endpoint, data)

    if rpc_url:
        try:
            balance_after = wallet.get_usdc_balance(rpc_url=rpc_url, usdc_address=usdc_addr)
        except Exception:
            pass

    # Save to history so verify works
    if trace.get("steps") and len(trace["steps"]) > 1:
        body = trace["steps"][1].get("body", {})
        if isinstance(body, dict) and not body.get("error"):
            client._record_game(game_name.lower(), data, body)

    output = _demo_format(game_name, endpoint, data, trace)

    # Append balance info for onchain mode
    if balance_before is not None or balance_after is not None:
        lines = ["\n📊 On-Chain Balance:"]
        if balance_before is not None:
            lines.append(f"   Before: {balance_before:.2f} USDC")
        if balance_after is not None:
            lines.append(f"   After:  {balance_after:.2f} USDC")
        if balance_before is not None and balance_after is not None:
            delta = balance_after - balance_before
            lines.append(f"   Change: {delta:+.2f} USDC")
        output += "\n".join(lines)

    return output


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_games():
    """List available games."""
    data = client.list_games()
    print("🎰 Available Games\n")
    for g in data.get("games", []):
        bet = g.get("bet_range", [])
        bet_str = f"${bet[0]}–${bet[1]}" if len(bet) == 2 else "varies"
        print(f"  {g['name']}")
        print(f"    {g.get('description', '')}")
        print(f"    Bet: {bet_str}  |  Edge: {g.get('house_edge', 'n/a')}  |  Payout: {g.get('payout', 'varies')}")
        print()


def cmd_flip(args: list[str]):
    """Play coinflip."""
    if len(args) < 2:
        print("Usage: clawsino flip <heads|tails> <amount>")
        sys.exit(1)
    choice = args[0]
    if choice not in ("heads", "tails"):
        print("Choice must be 'heads' or 'tails'")
        sys.exit(1)
    amount = float(args[1])

    if DEMO_MODE:
        print(_demo_play("Coinflip", "/api/coinflip", {"choice": choice, "bet": amount}))
        return

    print(f"🪙 Flipping coin... {choice} for ${amount:.2f} USDC")
    result = client.play_coinflip(choice, amount)
    _print_result(result)


def cmd_dice(args: list[str]):
    """Play dice."""
    if len(args) < 3:
        print("Usage: clawsino dice <over|under> <target> <amount>")
        sys.exit(1)
    prediction = args[0]
    if prediction not in ("over", "under"):
        print("Prediction must be 'over' or 'under'")
        sys.exit(1)
    target = int(args[1])
    amount = float(args[2])

    if DEMO_MODE:
        print(_demo_play("Dice", "/api/dice", {"prediction": prediction, "target": target, "bet": amount}))
        return

    print(f"🎲 Rolling dice... {prediction} {target} for ${amount:.2f} USDC")
    result = client.play_dice(prediction, target, amount)
    _print_result(result)


def cmd_blackjack(args: list[str]):
    """Play blackjack."""
    if len(args) < 1:
        print("Usage: clawsino blackjack <amount>")
        sys.exit(1)
    amount = float(args[0])

    if DEMO_MODE:
        print(_demo_play("Blackjack", "/api/blackjack", {"bet": amount}))
        return

    print(f"🃏 Dealing blackjack... ${amount:.2f} USDC")
    result = client.play_blackjack(amount)
    _print_result(result)


def cmd_balance():
    """Check USDC balance."""
    addr = wallet.get_address()
    if not addr:
        print("❌ No wallet configured. Set CLAWSINO_PRIVATE_KEY.")
        sys.exit(1)
    try:
        rpc_url = wallet.get_rpc_url()
        usdc_addr = None
        # Try to get USDC address from server (for local/onchain mode)
        try:
            import requests as _req
            resp = _req.get(f"{wallet.get_server_url()}/health", timeout=5)
            if resp.status_code == 200:
                # Probe a game endpoint to get contract info from 402
                probe = _req.post(f"{wallet.get_server_url()}/api/coinflip",
                    json={"choice": "heads", "bet": 0.01},
                    headers={"Content-Type": "application/json"}, timeout=5)
                if probe.status_code == 402:
                    body = probe.json()
                    reqs = body.get("paymentRequirements", [])
                    if reqs:
                        extra = reqs[0].get("extra", {})
                        usdc_addr = extra.get("usdcAddress")
        except Exception:
            pass
        if rpc_url == "https://mainnet.base.org":
            rpc_url = None
        bal = wallet.get_usdc_balance(addr, rpc_url=rpc_url, usdc_address=usdc_addr)
        print(f"💰 Wallet: {addr}")
        print(f"   USDC Balance: ${bal:.4f}")
    except Exception as e:
        print(f"❌ Error checking balance: {e}")
        sys.exit(1)


def cmd_history():
    """Show recent game history."""
    games = client.get_history(20)
    if not games:
        print("No games played yet.")
        return
    print(f"📜 Recent Games ({len(games)})\n")
    for g in games:
        ts = time.strftime("%Y-%m-%d %H:%M", time.localtime(g.get("timestamp", 0)))
        result = g.get("result", {})
        won = "✅ WIN" if result.get("won") else "❌ LOSS"
        bet = g.get("request", {}).get("bet", 0)
        payout = result.get("payout", 0)
        pnl = payout - bet
        print(f"  [{ts}] {g['type']:10s} {won}  bet=${bet:.2f}  pnl={pnl:+.2f}  id={g.get('id', 'n/a')}")


def cmd_verify(args: list[str]):
    """Verify fairness proof for a game."""
    if len(args) < 1:
        print("Usage: clawsino verify <game_id>")
        sys.exit(1)
    game_id = args[0]
    game = client.get_game_by_id(game_id)
    if not game:
        print(f"❌ Game {game_id} not found in history.")
        sys.exit(1)

    proof = game.get("result", {}).get("fairness_proof")
    if not proof or not isinstance(proof, dict):
        print(f"⚠️  No fairness proof available for game {game_id}")
        sys.exit(1)

    valid = fairness.verify_game_proof(proof)
    if valid:
        print(f"✅ Game {game_id} fairness proof VERIFIED")
        print(f"   Algorithm: {proof.get('hash_algo', 'sha256')}")
        print(f"   Committed: {proof.get('committed_hash', 'n/a')[:16]}...")
    else:
        print(f"❌ Game {game_id} fairness proof FAILED — possible tampering!")


def cmd_stats():
    """Show win/loss stats."""
    stats = client.get_stats()
    if stats["games_played"] == 0:
        print("No games played yet.")
        return
    print("📊 Stats\n")
    print(f"  Games played: {stats['games_played']}")
    print(f"  Wins: {stats['wins']}  Losses: {stats['losses']}")
    print(f"  Win rate: {stats['win_rate']}%")
    print(f"  Total wagered: ${stats['total_wagered']:.4f}")
    print(f"  Total P&L: ${stats['total_pnl']:+.4f}")


def _format_card(card: dict) -> str:
    """Format a card dict as a nice string like 'K♠'."""
    return f"{card.get('rank','?')}{card.get('suit','')}"


def _format_hand(cards: list) -> str:
    """Format a list of card dicts into a hand string."""
    if not cards or not isinstance(cards, list):
        return "?"
    return "  ".join(_format_card(c) for c in cards)


def _print_result(result: dict):
    """Pretty-print a game result."""
    if result.get("error"):
        print(f"\n❌ {result.get('message', result['error'])}")
        return

    game = result.get("game", "")

    # Blackjack — show hands
    if game == "blackjack" or "playerHand" in result:
        outcome = result.get("outcome", "")
        emoji_map = {"win": "🎉", "blackjack": "🃏🔥", "push": "🤝", "lose": "😞"}
        label_map = {"win": "WIN", "blackjack": "BLACKJACK!", "push": "PUSH", "lose": "LOSS"}
        emoji = emoji_map.get(outcome, "🎰")
        label = label_map.get(outcome, outcome.upper())

        print(f"\n{emoji} {label}")
        print()
        player_hand = result.get("playerHand", [])
        dealer_hand = result.get("dealerHand", [])
        print(f"   Your hand:   {_format_hand(player_hand)}  ({result.get('playerTotal', '?')})")
        print(f"   Dealer hand: {_format_hand(dealer_hand)}  ({result.get('dealerTotal', '?')})")
        print()
        payout = result.get("payout", 0)
        bet = result.get("bet", 0)
        if outcome in ("win", "blackjack"):
            print(f"   💰 Payout: ${payout:.2f} USDC (+${payout - bet:.2f})")
        elif outcome == "push":
            print(f"   ↩️  Push — ${bet:.2f} returned")
        else:
            print(f"   💸 Lost ${bet:.2f} USDC")
    else:
        # Coinflip / Dice
        won = result.get("won", False)
        emoji = "🎉" if won else "😞"
        print(f"\n{emoji} {'WIN' if won else 'LOSS'}")
        payout = result.get("payout", 0)
        bet = result.get("bet", 0)
        if won:
            print(f"   💰 Payout: ${payout:.4f} USDC (+${payout - bet:.4f})")
        else:
            print(f"   💸 Lost ${bet:.4f} USDC")
        # Show game-specific details
        if "result" in result:
            print(f"   Result: {result['result']}")
        if "roll" in result:
            print(f"   Roll: {result['roll']}")

    if result.get("fairness_proof"):
        print(f"   🔐 Fairness proof included (verify with 'clawsino verify <game_id>')")
    if result.get("game_id"):
        print(f"   Game ID: {result['game_id']}")


COMMANDS = {
    "games": lambda args: cmd_games(),
    "flip": cmd_flip,
    "dice": cmd_dice,
    "blackjack": cmd_blackjack,
    "balance": lambda args: cmd_balance(),
    "history": lambda args: cmd_history(),
    "verify": cmd_verify,
    "stats": lambda args: cmd_stats(),
}


def main():
    global DEMO_MODE

    # Parse --demo flag from anywhere in argv
    args = list(sys.argv[1:])
    if "--demo" in args:
        DEMO_MODE = True
        args.remove("--demo")

    if len(args) < 1 or args[0] in ("-h", "--help", "help"):
        print("Usage: clawsino [--demo] <command> [args...]")
        print()
        print("Commands:")
        print("  games                          List available games")
        print("  flip <heads|tails> <amount>     Play coinflip")
        print("  dice <over|under> <target> <amount>  Play dice")
        print("  blackjack <amount>             Play blackjack")
        print("  balance                        Check USDC balance")
        print("  history                        Recent game results")
        print("  verify <game_id>               Verify fairness proof")
        print("  stats                          Win/loss statistics")
        print()
        print("Flags:")
        print("  --demo    Show full x402 payment flow (for demos/presentations)")
        sys.exit(0)

    cmd = args[0]
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}")
        print("Run 'clawsino help' for usage.")
        sys.exit(1)

    try:
        COMMANDS[cmd](args[1:])
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to game server at {wallet.get_server_url()}")
        print("   Is the server running? Check CLAWSINO_SERVER_URL.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    import requests.exceptions
    main()
