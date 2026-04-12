// =============================================================================
// CANASTON ENGINE — deck.ts
// Card construction, deck building, shuffling, and card-utility functions.
// =============================================================================

import type { Card, CardCategory, Rank, Suit } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

const STANDARD_RANKS: Rank[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];

/** Point value of each rank as defined in section 2.1. */
export const RANK_POINTS: Record<Rank, number> = {
  "2":    20,
  "3":     0,  // red-3 = honor (special); black-3 = tapa (special) — 0 face value
  "4":     5,
  "5":     5,
  "6":     5,
  "7":     5,
  "8":    10,
  "9":    10,
  "10":   10,
  "J":    10,
  "Q":    10,
  "K":    10,
  "A":    20,
  "JOKER": 50,
};

// ---------------------------------------------------------------------------
// Card helpers
// ---------------------------------------------------------------------------

function cardCategory(rank: Rank, suit: Suit | null): CardCategory {
  if (rank === "JOKER") return "JOKER";
  if (rank === "2")     return "PATO";
  if (rank === "3") {
    return suit === "hearts" || suit === "diamonds" ? "HONOR" : "TAPA";
  }
  return "NORMAL";
}

export function isMono(card: Card): boolean {
  return card.category === "JOKER" || card.category === "PATO";
}

export function isHonor(card: Card): boolean {
  return card.category === "HONOR";
}

export function isTapa(card: Card): boolean {
  return card.category === "TAPA";
}

export function isWild(card: Card): boolean {
  return isMono(card);
}

/** Returns numeric rank value for comparison (used in sorteo). */
export function rankValue(rank: Rank): number {
  const map: Record<Rank, number> = {
    "2":  2,  "3": 3,  "4":  4,  "5":  5,
    "6":  6,  "7": 7,  "8":  8,  "9":  9,
    "10": 10, "J": 11, "Q": 12,  "K": 13,
    "A":  14, "JOKER": 0,
  };
  return map[rank] ?? 0;
}

// ---------------------------------------------------------------------------
// Build one standard 52-card deck + jokers
// ---------------------------------------------------------------------------

function buildSingleDeck(deckIndex: 0 | 1 | 2): Card[] {
  const cards: Card[] = [];

  for (const rank of STANDARD_RANKS) {
    for (const suit of SUITS) {
      const cat = cardCategory(rank, suit);
      cards.push({
        id:        `d${deckIndex}_${rank}_${suit}`,
        rank,
        suit,
        category:  cat,
        points:    RANK_POINTS[rank],
        deckIndex,
      });
    }
  }

  // 2 jokers per deck
  for (let j = 0; j < 2; j++) {
    cards.push({
      id:        `d${deckIndex}_JOKER_${j}`,
      rank:      "JOKER",
      suit:      null,
      category:  "JOKER",
      points:    50,
      deckIndex,
    });
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Build the full 162-card Canastón deck (3 × 52 + 6 jokers)
// ---------------------------------------------------------------------------

export function buildFullDeck(): Card[] {
  return [
    ...buildSingleDeck(0),
    ...buildSingleDeck(1),
    ...buildSingleDeck(2),
  ];
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle (returns a NEW array)
// ---------------------------------------------------------------------------

export function shuffle(cards: Card[], rng: () => number = Math.random): Card[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Utility: draw N cards from the top of a mutable stack (mutates the array)
// ---------------------------------------------------------------------------

export function drawCards(stock: Card[], count: number): Card[] {
  if (stock.length < count) {
    throw new Error(`DECK_EXHAUSTED: need ${count} but only ${stock.length} left`);
  }
  return stock.splice(stock.length - count, count);
}

// ---------------------------------------------------------------------------
// Canasta scoring helpers (section 10)
// ---------------------------------------------------------------------------

/** Base bonus for closing a canasta (before adding individual card points). */
export function canastaBaseScore(rank: Rank, isClean: boolean): number {
  if (rank === "JOKER") return isClean ? 4000 : 2000;
  if (rank === "2")     return isClean ? 3000 : 2000;
  if (rank === "A")     return isClean ? 1000 : 500;
  // everything else (4-K)
  return isClean ? 500 : 300;
}

/** Sum of individual card points in a list. */
export function sumCardPoints(cards: Card[]): number {
  return cards.reduce((acc, c) => acc + c.points, 0);
}

// ---------------------------------------------------------------------------
// Bajada minimum helper (section 9.1)
// ---------------------------------------------------------------------------

import { BAJADA_MINIMUMS } from "./types";

export function getBajadaMinimum(globalScore: number): number {
  for (const entry of BAJADA_MINIMUMS) {
    if (globalScore <= entry.upTo) return entry.minimum;
  }
  return 200; // >= 15000 (shouldn't happen in normal play)
}
