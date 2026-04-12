// =============================================================================
// CANASTÓN — Deck Management
// 3 standard decks (52 cards each) + 6 jokers = 162 cards total (section 2.1)
// =============================================================================

import { Card, NaturalCard, PatoCard, JokerCard, NaturalRank, Suit, isMono, isHonor } from './types';

const SUITS: Suit[] = ['♥', '♦', '♣', '♠'];
const NATURAL_RANKS: NaturalRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const NUM_DECKS = 3;
const NUM_JOKERS = 6;

/** Build a full shuffled deck of 162 cards */
export function buildShuffledDeck(): Card[] {
  const cards: Card[] = [];

  for (let deckIdx = 0; deckIdx < NUM_DECKS; deckIdx++) {
    // Natural ranks (3–A)
    for (const rank of NATURAL_RANKS) {
      for (const suit of SUITS) {
        const card: NaturalCard = {
          id: `${rank}${suit}_d${deckIdx}`,
          rank,
          suit,
          kind: 'natural',
        };
        cards.push(card);
      }
    }
    // Patos (2s)
    for (const suit of SUITS) {
      const card: PatoCard = {
        id: `2${suit}_d${deckIdx}`,
        rank: '2',
        suit,
        kind: 'pato',
      };
      cards.push(card);
    }
  }

  // Jokers
  for (let i = 0; i < NUM_JOKERS; i++) {
    const card: JokerCard = {
      id: `JOKER_${i}`,
      rank: 'JOKER',
      suit: null,
      kind: 'joker',
    };
    cards.push(card);
  }

  return shuffle(cards);
}

/** Fisher-Yates shuffle — returns new array */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Draw `n` cards from the top of the stock. Returns [drawn, remaining]. */
export function drawFromStock(stock: Card[], n: number): [Card[], Card[]] {
  if (stock.length < n) {
    return [stock, []];
  }
  return [stock.slice(0, n), stock.slice(n)];
}

/**
 * Simulate the PICADA INICIAL (section 6.1):
 * The system cuts the deck at a random point and reveals the bottom 3 cards
 * of the cut portion. Returns the special cards found and the updated stock.
 */
export function simulatePicada(stock: Card[]): {
  specialCards: Card[];
  newStock: Card[];
} {
  if (stock.length < 3) {
    return { specialCards: [], newStock: stock };
  }

  // Random cut point — at least 3 cards from bottom, 3 from top
  const cutPoint = Math.floor(Math.random() * (stock.length - 6)) + 3;
  const topPile = stock.slice(0, cutPoint);
  const bottomPile = stock.slice(cutPoint);

  // Reveal last 3 cards of the top pile
  const revealed = topPile.slice(-3);
  const specialCards = revealed.filter(c => isMono(c) || isHonor(c));

  let newStock: Card[];
  if (specialCards.length > 0) {
    // Special cards go to the picador's hand.
    // Non-special revealed cards stay in play — placed at the END of the stock.
    const remainingTop = topPile.slice(0, -3);
    const nonSpecialRevealed = revealed.filter(c => !isMono(c) && !isHonor(c));
    newStock = [...bottomPile, ...remainingTop, ...nonSpecialRevealed];
  } else {
    // No special cards — put revealed cards back under the deck
    newStock = [...topPile.slice(0, -3), ...revealed, ...bottomPile];
  }

  return { specialCards, newStock };
}

/**
 * Resolve the first visible card of the repartidor (section 6.3).
 * Returns how many cards to place face-down on the pilon.
 */
export function resolveRepartidorCard(card: Card): number {
  if (card.kind === 'joker') return 25;
  if (card.kind === 'pato') return 20;

  switch (card.rank) {
    case '3': return 0;  // special: flip next card (handled at call site)
    case '4': return 4;
    case '5': return 5;
    case '6': return 6;
    case '7': return 7;
    case '8': return 8;
    case '9': return 9;
    case '10': return 10;
    case 'J': return 11;
    case 'Q': return 12;
    case 'K': return 13;
    case 'A': return 14;
    default: return 0;
  }
}
