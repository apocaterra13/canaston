import { validateMeld, validateAddToMeld } from '../../engine/validation';
import type { Card, Meld } from '../../engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nat(rank: Card['rank'], id?: string): Card {
  return { id: id ?? `nat_${rank}`, rank, suit: 'hearts', category: 'NORMAL', points: 10, deckIndex: 0 };
}

function pato(id?: string): Card {
  return { id: id ?? 'pato', rank: '2', suit: 'hearts', category: 'PATO', points: 20, deckIndex: 0 };
}

function joker(id?: string): Card {
  return { id: id ?? 'joker', rank: 'JOKER', suit: null, category: 'JOKER', points: 50, deckIndex: 0 };
}

function makeMeld(rank: Card['rank'], cards: Card[]): Meld {
  return { id: 'meld_1', rank, cards };
}

// ---------------------------------------------------------------------------
// validateMeld — standard mixed combinations
// ---------------------------------------------------------------------------

describe('validateMeld — standard (mixed) combinations', () => {
  it('accepts 3 naturals of same rank', () => {
    const r = validateMeld([nat('7', 'a'), nat('7', 'b'), nat('7', 'c')]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rank).toBe('7');
  });

  it('accepts 2 naturals + 1 wild', () => {
    const r = validateMeld([nat('A', 'a'), nat('A', 'b'), pato()]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.wildCount).toBe(1);
  });

  it('accepts 2 naturals + 2 wilds (max allowed)', () => {
    const r = validateMeld([nat('K', 'a'), nat('K', 'b'), pato('p1'), joker('j1')]);
    expect(r.ok).toBe(true);
  });

  it('rejects 1 natural + 2 wilds (INSUFFICIENT_NATURALS)', () => {
    const r = validateMeld([nat('Q', 'a'), pato('p1'), joker('j1')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INSUFFICIENT_NATURALS');
  });

  it('rejects 2 naturals + 3 wilds (TOO_MANY_WILDS)', () => {
    const r = validateMeld([nat('J', 'a'), nat('J', 'b'), pato('p1'), pato('p2'), joker('j1')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('TOO_MANY_WILDS');
  });

  it('rejects mixed natural ranks', () => {
    const r = validateMeld([nat('7', 'a'), nat('8', 'b'), nat('9', 'c')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('MIXED_RANKS');
  });

  it('rejects fewer than 3 cards', () => {
    const r = validateMeld([nat('7', 'a'), nat('7', 'b')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('MELD_TOO_SHORT');
  });
});

// ---------------------------------------------------------------------------
// validateMeld — mono-only combinations (canasta de monos)
// ---------------------------------------------------------------------------

describe('validateMeld — mono-only (canasta de monos)', () => {
  it('accepts 3 patos (all 2s)', () => {
    const r = validateMeld([pato('p1'), pato('p2'), pato('p3')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rank).toBe('2');
      expect(r.data.wildCount).toBe(3);
    }
  });

  it('accepts 3 jokers', () => {
    const r = validateMeld([joker('j1'), joker('j2'), joker('j3')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rank).toBe('JOKER');
      expect(r.data.wildCount).toBe(3);
    }
  });

  it('accepts a mix of patos and jokers', () => {
    const r = validateMeld([pato('p1'), pato('p2'), joker('j1')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Joker is present → rank is JOKER
      expect(r.data.rank).toBe('JOKER');
      expect(r.data.wildCount).toBe(3);
    }
  });

  it('accepts 7 monos (full canasta de monos)', () => {
    const cards: Card[] = [
      pato('p1'), pato('p2'), pato('p3'), pato('p4'),
      joker('j1'), joker('j2'), joker('j3'),
    ];
    const r = validateMeld(cards);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.rank).toBe('JOKER');
      expect(r.data.wildCount).toBe(7);
    }
  });

  it('still rejects fewer than 3 cards even if all are monos', () => {
    const r = validateMeld([pato('p1'), joker('j1')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('MELD_TOO_SHORT');
  });
});

// ---------------------------------------------------------------------------
// validateAddToMeld — mono meld wild cap is not enforced
// ---------------------------------------------------------------------------

describe('validateAddToMeld — adding to a mono meld', () => {
  it('allows adding a 4th wild to a mono meld (rank "2")', () => {
    const existing = makeMeld('2', [pato('p1'), pato('p2'), pato('p3')]);
    const r = validateAddToMeld(existing, [pato('p4')]);
    expect(r.ok).toBe(true);
  });

  it('allows adding a 4th wild to a mono meld (rank "JOKER")', () => {
    const existing = makeMeld('JOKER', [joker('j1'), joker('j2'), joker('j3')]);
    const r = validateAddToMeld(existing, [pato('p1')]);
    expect(r.ok).toBe(true);
  });

  it('allows burning a pato into a closed mono canasta ranked JOKER', () => {
    const canasta: import('../../engine/types').Canasta = {
      id: 'c1', rank: 'JOKER',
      cards: [joker('j1'), joker('j2'), joker('j3'), pato('p1'), pato('p2'), pato('p3'), joker('j4')],
      type: 'MONO', closed: true, burned: [],
    };
    const r = validateAddToMeld(canasta, [pato('p4')]);
    expect(r.ok).toBe(true);
  });

  it('allows burning a joker into a closed mono canasta ranked "2"', () => {
    const canasta: import('../../engine/types').Canasta = {
      id: 'c2', rank: '2',
      cards: [pato('p1'), pato('p2'), pato('p3'), pato('p4'), joker('j1'), joker('j2'), joker('j3')],
      type: 'MONO', closed: true, burned: [],
    };
    const r = validateAddToMeld(canasta, [joker('j4')]);
    expect(r.ok).toBe(true);
  });

  it('rejects adding a natural card to a mono meld', () => {
    const existing = makeMeld('JOKER', [joker('j1'), joker('j2'), pato('p1')]);
    const r = validateAddToMeld(existing, [nat('K', 'k1')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('MONO_MELD_ONLY_WILDS');
  });

  it('still enforces the 2-wild cap on normal melds', () => {
    const existing = makeMeld('K', [nat('K', 'a'), nat('K', 'b'), pato('p1'), joker('j1')]);
    const r = validateAddToMeld(existing, [pato('p2')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('TOO_MANY_WILDS');
  });

  it('still blocks wilds from being burned into a closed normal canasta', () => {
    const canasta: import('../../engine/types').Canasta = {
      id: 'c3', rank: 'K',
      cards: [nat('K','a'), nat('K','b'), nat('K','c'), nat('K','d'), nat('K','e'), nat('K','f'), nat('K','g')],
      type: 'LIMPIA', closed: true, burned: [],
    };
    const r = validateAddToMeld(canasta, [pato('p1')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CANASTA_CLOSED_NO_WILDS');
  });
});
