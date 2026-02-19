#!/usr/bin/env python3
"""Clawsino CLI — play casino games with USDC on Base via x402."""

import json
import sys
import time

# Allow running from skill/ directory
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib import client, wallet, fairness


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
    print(f"🎲 Rolling dice... {prediction} {target} for ${amount:.2f} USDC")
    result = client.play_dice(prediction, target, amount)
    _print_result(result)


def cmd_blackjack(args: list[str]):
    """Play blackjack."""
    if len(args) < 1:
        print("Usage: clawsino blackjack <amount>")
        sys.exit(1)
    amount = float(args[0])
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
        bal = wallet.get_usdc_balance(addr)
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


def _print_result(result: dict):
    """Pretty-print a game result."""
    if result.get("error"):
        print(f"\n❌ {result.get('message', result['error'])}")
        return
    won = result.get("won", False)
    emoji = "🎉" if won else "😞"
    print(f"\n{emoji} {'WIN' if won else 'LOSS'}")
    payout = result.get("payout", 0)
    if won:
        print(f"   Payout: ${payout:.4f} USDC")
    # Show result details
    for key in ("result", "roll", "total", "player_hand", "dealer_hand"):
        if key in result:
            print(f"   {key}: {result[key]}")
    if result.get("fairness_proof"):
        print(f"   Fairness proof: included (verify with 'clawsino verify <game_id>')")
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
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print("Usage: clawsino <command> [args...]")
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
        sys.exit(0)

    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}")
        print("Run 'clawsino help' for usage.")
        sys.exit(1)

    try:
        COMMANDS[cmd](sys.argv[2:])
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
