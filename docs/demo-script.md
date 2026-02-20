# Clawsino — Claws Out Demo Script (9 minutes)

**Category:** 🤖 Best Autonomous Agent
**Presenter:** Chris Madison
**Setup:** Laptop with two windows visible — terminal (left) and browser dashboard (right)

---

## Pre-Demo Checklist

```bash
# Start everything
cd ~/dev/2026/clawsino
docker compose up -d --build game-api

# Activate the skill
cd skill
source .venv/bin/activate

# Open dashboard in browser
open http://localhost:3000/dashboard

# Clear history for clean demo
rm -f ~/.openclaw/clawsino/history.json

# Test one game to make sure everything works
clawsino --demo flip heads 0.10
```

- [ ] Terminal font size cranked up (⌘+ a few times)
- [ ] Browser zoomed to ~125% on dashboard
- [ ] Dashboard visible, event feed empty
- [ ] Terminal clear and ready

---

## The Script

### [0:00–1:30] The Hook

> "AI agents are getting wallets. They can hold money, sign transactions, and make decisions. So what happens when an agent walks into a casino?
>
> I'm Chris Madison. I'm a fractional CTO, and this week I built Clawsino — an agent-native casino where AI agents play games, pay with real money using the x402 payment protocol, and cryptographically verify the house isn't cheating.
>
> No frontend. No login page. No human clicking buttons. An agent hits an API, negotiates a payment, plays a game, and verifies the result. All autonomously.
>
> Let me show you."

### [1:30–2:30] Explain x402 (30 seconds, keep it tight)

> "Quick context on x402 — it's HTTP 402, the payment required status code that's been reserved since 1999. x402 finally gives it a protocol. The agent makes a request, the server says 'pay me first' with a 402 response, the agent signs a USDC payment, resends the request, and gets served.
>
> It turns any API into a paywall that machines can negotiate. That's what powers Clawsino."

*Point to the dashboard:*

> "This dashboard shows every request and response in real-time. You'll see the full x402 flow as I play."

### [2:30–4:30] First Game — Coinflip

*In terminal:*
```bash
clawsino --demo flip heads 0.25
```

*As it runs, narrate what appears on the dashboard:*

> "Watch the dashboard. First — the agent sends a POST to the coinflip endpoint. Bet: 25 cents, heads.
>
> Server comes back with 402 Payment Required. Right there in the JSON — it's telling the agent exactly what to pay: 0.25 USDC, to this address, on Base.
>
> Now the agent signs the payment. X-PAYMENT header goes out.
>
> And we get our result. [pause for result] 
>
> [If win]: Heads. 49 cents back. The payout, the fairness proof, the game ID — all in one response.
> [If lose]: Tails. Lost the quarter. But look — the fairness proof is right there. The server committed to the outcome before the game. Let me prove it."

### [4:30–5:30] Verify Fairness

*Copy the game ID from the output:*
```bash
clawsino verify <game_id>
```

> "This is the part that matters. Before every game, the server commits to a random seed by publishing its hash. After the game, it reveals the seed. The client checks that the hash matches.
>
> If the server tried to change the outcome after seeing my bet, the hashes wouldn't match. Provably fair — no trust required.
>
> We also have a Solidity contract, FairnessVerifier.sol, that can do this verification on-chain. Permanent, immutable proof."

### [5:30–7:00] Blackjack — Show the Cards

```bash
clawsino --demo blackjack 1.00
```

> "Let's play some blackjack. One dollar.
>
> Same flow — 402, payment, result. But now look at the detail panel on the dashboard.
>
> [Point to the JSON] There are the hands. Player cards, dealer cards, totals.
>
> [Read the result] [If win]: Twenty beats seventeen. Two dollars back.
> [If blackjack]: Natural blackjack! Two-fifty payout on a dollar bet.
> [If lose]: Dealer wins this one. That's gambling.
>
> Every game — coinflip, dice, blackjack — same x402 flow. Same fairness proofs. The agent doesn't need to know the rules. It discovers them at GET /api/games, picks one, and plays."

*Optional — if time feels good, fire off a quick dice game:*
```bash
clawsino --demo dice over 7 0.50
```

### [7:00–8:30] The Bigger Picture

> "So what's actually happening here? An AI agent is:
>
> One — discovering available games through an API.
> Two — negotiating payment using a standard HTTP protocol.
> Three — making a decision and placing a bet.
> Four — verifying the result cryptographically.
>
> No human in the loop. No custom integration. Any agent with a wallet and an HTTP client can walk into this casino right now.
>
> That's the point. x402 turns APIs into marketplaces. Clawsino is a casino, but the same pattern works for any agent-to-service transaction. Data feeds. Compute. Storage. Anything.
>
> We built this as an OpenClaw skill — so any OpenClaw agent can play in natural language. 'Hey, flip a coin, 25 cents on heads.' The skill handles the rest.
>
> The contracts are on Base. The server is open source. The code is live on GitHub right now."

### [8:30–9:00] Close

> "Clawsino. Agents play. Agents pay. Agents verify. No trust required.
>
> The repo is at github.com/tankcdr/clawsino. Thank you."

---

## Recovery Plans

**Server crashes mid-demo:**
> "Live demos, right? Let me restart." → `docker compose up -d` → continue

**Game takes too long:**
Skip the dice game, go straight to the bigger picture section.

**Dashboard doesn't load:**
Demo still works from terminal — the `--demo` flag output tells the whole story. Just narrate from the CLI output.

**All games lose:**
> "The house always wins — that's the business model." (gets a laugh, move on)

**Someone asks about real money:**
> "Right now this is running on a local chain with demo payments. Flipping it to production is a config change — real USDC on Base, real contract deployments. The protocol flow is identical."

---

## Key Talking Points (if judges ask)

- **Why x402?** It's the native payment protocol for the machine web. REST APIs already return status codes — 402 makes payment a first-class citizen.
- **Why provable fairness?** Agents can't "look at the dealer." They need cryptographic guarantees. Commit-reveal solves this without trust.
- **Why Base?** Low gas, fast finality, USDC native. Agent microtransactions need sub-cent fees.
- **Business model?** 2% house edge. Scale with agent adoption. Revenue funds token buybacks.
- **What's next?** Multi-token support (EVERY token), on-chain settlement, agent-vs-agent poker.
