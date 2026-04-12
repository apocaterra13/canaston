import {
  validateCombination,
  validateCanasta,
  validateBajada,
  getBajadaMinimum,
  cardPoints,
  canTakePilon,
} from '../../src/engine/rules';
import { Card, NaturalCard, PatoCard, JokerCard, Pilon, Team } from '../../src/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nat(rank: NaturalCard['rank'], suit: '♥' | '♦' | '♣' | '♠' = '♥', id = ''): NaturalCard {
  return { id: id || `${rank}${suit}`, rank, suit, kind: 'natural' };
}
function pato(suit: '♥' | '♦' | '♣' | '♠' = '♥', id = ''): PatoCard {
  return { id: id || `2${suit}`, rank: '2', suit, kind: 'pato' };
}
function joker(id = 'J0'): JokerCard {
  return { id, rank: 'JOKER', suit: null, kind: 'joker' };
}

const makeTeam = (globalScore = 0, hasBajado = false): Team => ({
  id: 'team_ns',
  playerIds: ['p1', 'p2'],
  tableCards: [],
  canastas: [],
  honors: [],
  hasBajado,
  globalScore,
});

// ---------------------------------------------------------------------------
// cardPoints
// ---------------------------------------------------------------------------

describe('cardPoints', () => {
  it('gives 5 pts to low cards', () => expect(cardPoints(nat('4'))).toBe(5));
  it('gives 10 pts to face cards', () => expect(cardPoints(nat('K'))).toBe(10));
  it('gives 20 pts to Ace', () => expect(cardPoints(nat('A'))).toBe(20));
  it('gives 20 pts to pato (2)', () => expect(cardPoints(pato())).toBe(20));
  it('gives 50 pts to joker', () => expect(cardPoints(joker())).toBe(50));
  it('gives 0 pts to 3', () => expect(cardPoints(nat('3'))).toBe(0));
});

// ---------------------------------------------------------------------------
// validateCombination
// ---------------------------------------------------------------------------

describe('validateCombination', () => {
  it('accepts 3 natural cards of same rank', () => {
    const r = validateCombination([nat('7', '♥'), nat('7', '♦'), nat('7', '♣')]);
    expect(r.valid).toBe(true);
  });

  it('accepts 2 naturals + 1 pato', () => {
    const r = validateCombination([nat('A', '♥'), nat('A', '♦'), pato()]);
    expect(r.valid).toBe(true);
  });

  it('rejects 1 natural + 2 patos (not enough naturals per mono)', () => {
    const r = validateCombination([nat('A', '♥'), pato('♥'), pato('♦')]);
    expect(r.valid).toBe(false);
  });

  it('rejects cards of different ranks', () => {
    const r = validateCombination([nat('7'), nat('8'), nat('9')]);
    expect(r.valid).toBe(false);
  });

  it('rejects < 3 cards', () => {
    const r = validateCombination([nat('7'), nat('7')]);
    expect(r.valid).toBe(false);
  });

  it('rejects red 3s in combination', () => {
    const r = validateCombination([nat('3', '♥'), nat('3', '♦'), nat('3', '♥', '32')]);
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateCanasta
// ---------------------------------------------------------------------------

describe('validateCanasta', () => {
  const sevenCards = (rank: NaturalCard['rank']) =>
    Array.from({ length: 7 }, (_, i) => nat(rank, '♥', `${rank}_${i}`));

  it('accepts 7 natural cards (clean)', () => {
    const r = validateCanasta(sevenCards('7'));
    expect(r.valid).toBe(true);
    expect(r.type).toBe('clean');
  });

  it('accepts 5 naturals + 2 monos (dirty)', () => {
    const cards: Card[] = [
      ...Array.from({ length: 5 }, (_, i) => nat('A', '♥', `A_${i}`)),
      pato('♥', 'p1'),
      joker('j1'),
    ];
    const r = validateCanasta(cards);
    expect(r.valid).toBe(true);
    expect(r.type).toBe('dirty');
  });

  it('rejects 4 naturals + 3 monos', () => {
    const cards: Card[] = [
      ...Array.from({ length: 4 }, (_, i) => nat('A', '♥', `A_${i}`)),
      pato('♥', 'p1'), pato('♦', 'p2'), joker('j1'),
    ];
    const r = validateCanasta(cards);
    expect(r.valid).toBe(false);
  });

  it('rejects 6 cards', () => {
    const r = validateCanasta(sevenCards('7').slice(0, 6));
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBajadaMinimum
// ---------------------------------------------------------------------------

describe('getBajadaMinimum', () => {
  it('returns 50 at 0 points', () => expect(getBajadaMinimum(0)).toBe(50));
  it('returns 90 at 3000', () => expect(getBajadaMinimum(3000)).toBe(90));
  it('returns 120 at 5000', () => expect(getBajadaMinimum(5000)).toBe(120));
  it('returns 200 at 12000', () => expect(getBajadaMinimum(12000)).toBe(200));
});

// ---------------------------------------------------------------------------
// validateBajada
// ---------------------------------------------------------------------------

describe('validateBajada', () => {
  it('accepts valid bajada meeting minimum', () => {
    // 2 aces + 1 joker = 90 pts, minimum at 3000 pts is 90
    const combo = [nat('A', '♥'), nat('A', '♦'), joker()];
    const team = makeTeam(3000);
    expect(validateBajada([combo], team).valid).toBe(true);
  });

  it('rejects if team already bajado', () => {
    const combo = [nat('A', '♥'), nat('A', '♦'), nat('A', '♣')];
    const team = makeTeam(0, true);
    expect(validateBajada([combo], team).valid).toBe(false);
  });

  it('rejects if not enough points', () => {
    const combo = [nat('4', '♥'), nat('4', '♦'), nat('4', '♣')]; // 15 pts
    const team = makeTeam(0); // needs 50
    expect(validateBajada([combo], team).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canTakePilon
// ---------------------------------------------------------------------------

describe('canTakePilon', () => {
  const pilon: Pilon = {
    cards: [nat('7', '♥', 'vis')],
    state: 'normal',
  };

  it('allows taking with 2 matching cards', () => {
    const hand = [nat('7', '♦'), nat('7', '♣')];
    expect(canTakePilon(pilon, hand, false).allowed).toBe(true);
  });

  it('rejects if only 1 matching card', () => {
    const hand = [nat('7', '♦'), nat('K')];
    expect(canTakePilon(pilon, hand, false).allowed).toBe(false);
  });

  it('blocks when tapa active', () => {
    const tapaPilon: Pilon = { cards: [nat('3', '♣')], state: 'tapa' };
    expect(canTakePilon(tapaPilon, [nat('7'), nat('7')], false).allowed).toBe(false);
  });

  it('requires 3 matching cards when triado', () => {
    const triadoPilon: Pilon = { cards: [nat('7', '♥')], state: 'triado' };
    const hand2 = [nat('7', '♦'), nat('7', '♣')];
    expect(canTakePilon(triadoPilon, hand2, false).allowed).toBe(false);

    const hand3 = [nat('7', '♦'), nat('7', '♣'), nat('7', '♠')];
    expect(canTakePilon(triadoPilon, hand3, false).allowed).toBe(true);
  });
});
