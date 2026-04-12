import { buildShuffledDeck, drawFromStock, simulatePicada } from '../../src/engine/deck';
import { isMono, isHonor } from '../../src/engine/types';

describe('buildShuffledDeck', () => {
  it('produces exactly 162 cards', () => {
    const deck = buildShuffledDeck();
    expect(deck).toHaveLength(162);
  });

  it('contains exactly 6 jokers', () => {
    const deck = buildShuffledDeck();
    const jokers = deck.filter(c => c.kind === 'joker');
    expect(jokers).toHaveLength(6);
  });

  it('contains exactly 12 patos (2s)', () => {
    const deck = buildShuffledDeck();
    const patos = deck.filter(c => c.kind === 'pato');
    expect(patos).toHaveLength(12); // 4 suits × 3 decks
  });

  it('has all unique IDs', () => {
    const deck = buildShuffledDeck();
    const ids = deck.map(c => c.id);
    expect(new Set(ids).size).toBe(162);
  });

  it('contains 6 red 3s (honors)', () => {
    const deck = buildShuffledDeck();
    const honors = deck.filter(isHonor);
    expect(honors).toHaveLength(6); // 2 red suits × 3 decks
  });

  it('contains 6 black 3s (tapas)', () => {
    const deck = buildShuffledDeck();
    const tapas = deck.filter(c => c.kind === 'natural' && c.rank === '3' && (c.suit === '♣' || c.suit === '♠'));
    expect(tapas).toHaveLength(6);
  });
});

describe('drawFromStock', () => {
  it('draws the correct number of cards', () => {
    const deck = buildShuffledDeck();
    const [drawn, remaining] = drawFromStock(deck, 15);
    expect(drawn).toHaveLength(15);
    expect(remaining).toHaveLength(147);
  });

  it('handles drawing more than available', () => {
    const tiny = buildShuffledDeck().slice(0, 3);
    const [drawn, remaining] = drawFromStock(tiny, 10);
    expect(drawn).toHaveLength(3);
    expect(remaining).toHaveLength(0);
  });
});

describe('simulatePicada', () => {
  it('returns special cards found in cut', () => {
    const deck = buildShuffledDeck();
    const { specialCards, newStock } = simulatePicada(deck);
    // specialCards must all be mono or honor
    for (const card of specialCards) {
      expect(isMono(card) || isHonor(card)).toBe(true);
    }
    // total cards must still be 162
    expect(specialCards.length + newStock.length).toBe(162);
  });
});
