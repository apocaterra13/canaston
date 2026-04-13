import { sortHand } from '../../engine/deck';
import type { Card } from '../../engine/types';

function card(rank: Card['rank'], category: Card['category'], id?: string): Card {
  return {
    id: id ?? `${rank}_${category}`,
    rank,
    suit: 'hearts',
    category,
    points: 0,
    deckIndex: 0,
  };
}

describe('sortHand', () => {
  it('places black 3s (TAPA) first', () => {
    const hand = [
      card('A', 'NORMAL', 'a'),
      card('3', 'TAPA', 't'),
      card('K', 'NORMAL', 'k'),
    ];
    const sorted = sortHand(hand);
    expect(sorted[0].category).toBe('TAPA');
  });

  it('places Jokers last', () => {
    const hand = [
      card('JOKER', 'JOKER', 'j'),
      card('A', 'NORMAL', 'a'),
      card('2', 'PATO', 'p'),
    ];
    const sorted = sortHand(hand);
    expect(sorted[sorted.length - 1].category).toBe('JOKER');
  });

  it('places 2s (PATO) just before Jokers', () => {
    const hand = [
      card('JOKER', 'JOKER', 'j'),
      card('K', 'NORMAL', 'k'),
      card('2', 'PATO', 'p'),
    ];
    const sorted = sortHand(hand);
    expect(sorted[sorted.length - 2].category).toBe('PATO');
    expect(sorted[sorted.length - 1].category).toBe('JOKER');
  });

  it('orders normal ranks: A, 4–K', () => {
    const ranks: Card['rank'][] = ['K', '7', 'A', '4', 'J', '10', '5'];
    const hand = ranks.map(r => card(r, 'NORMAL', r));
    const sorted = sortHand(hand);
    const sortedRanks = sorted.map(c => c.rank);
    expect(sortedRanks).toEqual(['A', '4', '5', '7', '10', 'J', 'K']);
  });

  it('full hand sorted correctly: TAPA, A, 4–K, PATO, JOKER', () => {
    const hand: Card[] = [
      card('JOKER', 'JOKER', 'j'),
      card('2', 'PATO', 'p'),
      card('K', 'NORMAL', 'K'),
      card('3', 'TAPA', 't'),
      card('A', 'NORMAL', 'A'),
      card('4', 'NORMAL', '4'),
    ];
    const sorted = sortHand(hand);
    expect(sorted.map(c => c.id)).toEqual(['t', 'A', '4', 'K', 'p', 'j']);
  });

  it('does not mutate the original array', () => {
    const hand = [card('K', 'NORMAL', 'k'), card('A', 'NORMAL', 'a')];
    const original = [...hand];
    sortHand(hand);
    expect(hand.map(c => c.id)).toEqual(original.map(c => c.id));
  });
});
