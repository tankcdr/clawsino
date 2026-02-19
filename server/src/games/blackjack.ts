import {
  generateServerSeed,
  generateNonce,
  generateFairRandom,
  createFairnessProof,
  type FairnessProof,
} from "../utils/fairness.js";

export interface BlackjackRequest {
  bet: number;
  action?: "hit" | "stand";
  clientSeed?: string;
}

export interface Card {
  rank: string;
  suit: string;
  value: number;
}

export interface BlackjackResult {
  game: "blackjack";
  playerHand: Card[];
  dealerHand: Card[];
  playerTotal: number;
  dealerTotal: number;
  outcome: "win" | "lose" | "push" | "blackjack";
  bet: number;
  payout: number;
  multiplier: number;
  fairness_proof: FairnessProof;
}

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];

function cardValue(rank: string): number {
  if (["J", "Q", "K"].includes(rank)) return 10;
  if (rank === "A") return 11;
  return parseInt(rank);
}

function handTotal(hand: Card[]): number {
  let total = hand.reduce((sum, c) => sum + c.value, 0);
  let aces = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/**
 * Deal a card from a provably fair "infinite deck" (each card independent).
 */
function dealCard(serverSeed: string, clientSeed: string, nonce: string, index: number): Card {
  const r1 = generateFairRandom(serverSeed, clientSeed, nonce + `:card${index}r`);
  const r2 = generateFairRandom(serverSeed, clientSeed, nonce + `:card${index}s`);
  const rank = RANKS[Math.floor(r1 * RANKS.length)];
  const suit = SUITS[Math.floor(r2 * SUITS.length)];
  return { rank, suit, value: cardValue(rank) };
}

export function playBlackjack(request: BlackjackRequest): BlackjackResult {
  const { bet, clientSeed = "default" } = request;

  const serverSeed = generateServerSeed();
  const nonce = generateNonce();
  let cardIndex = 0;

  const deal = () => dealCard(serverSeed, clientSeed, nonce, cardIndex++);

  // Deal initial hands
  const playerHand: Card[] = [deal(), deal()];
  const dealerHand: Card[] = [deal(), deal()];

  // Check for natural blackjack
  const playerNatural = handTotal(playerHand) === 21;
  const dealerNatural = handTotal(dealerHand) === 21;

  if (playerNatural || dealerNatural) {
    let outcome: BlackjackResult["outcome"];
    let multiplier: number;
    if (playerNatural && dealerNatural) {
      outcome = "push";
      multiplier = 1;
    } else if (playerNatural) {
      outcome = "blackjack";
      multiplier = 2.5; // 3:2 payout
    } else {
      outcome = "lose";
      multiplier = 0;
    }
    return {
      game: "blackjack",
      playerHand,
      dealerHand,
      playerTotal: handTotal(playerHand),
      dealerTotal: handTotal(dealerHand),
      outcome,
      bet,
      payout: parseFloat((bet * multiplier).toFixed(6)),
      multiplier,
      fairness_proof: createFairnessProof(serverSeed, clientSeed, nonce),
    };
  }

  // Player auto-plays basic strategy: hit on < 17, stand on >= 17
  while (handTotal(playerHand) < 17) {
    playerHand.push(deal());
  }

  const playerTotal = handTotal(playerHand);

  // Player busted
  if (playerTotal > 21) {
    return {
      game: "blackjack",
      playerHand,
      dealerHand,
      playerTotal,
      dealerTotal: handTotal(dealerHand),
      outcome: "lose",
      bet,
      payout: 0,
      multiplier: 0,
      fairness_proof: createFairnessProof(serverSeed, clientSeed, nonce),
    };
  }

  // Dealer plays: hit on < 17
  while (handTotal(dealerHand) < 17) {
    dealerHand.push(deal());
  }

  const dealerTotal = handTotal(dealerHand);

  let outcome: BlackjackResult["outcome"];
  let multiplier: number;

  if (dealerTotal > 21 || playerTotal > dealerTotal) {
    outcome = "win";
    multiplier = 2;
  } else if (playerTotal === dealerTotal) {
    outcome = "push";
    multiplier = 1;
  } else {
    outcome = "lose";
    multiplier = 0;
  }

  return {
    game: "blackjack",
    playerHand,
    dealerHand,
    playerTotal,
    dealerTotal,
    outcome,
    bet,
    payout: parseFloat((bet * multiplier).toFixed(6)),
    multiplier,
    fairness_proof: createFairnessProof(serverSeed, clientSeed, nonce),
  };
}
