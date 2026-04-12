import { canastaBaseValue, canastaTotal, honorPoints, idaBonus, checkVictory } from '../../src/engine/scoring';
import { Canasta, Team, TeamId } from '../../src/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCanasta(rank: Canasta['rank'], type: 'clean' | 'dirty', cardCount = 7): Canasta {
  // Build minimal cards for scoring purposes
  const cards = Array.from({ length: cardCount }, (_, i) => ({
    id: `${rank}_${i}`,
    rank: rank as any,
    suit: '♥' as const,
    kind: 'natural' as const,
  }));
  return { id: 'c1', cards, type, closed: true, rank };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team_ns',
    playerIds: ['p1', 'p2'],
    tableCards: [],
    canastas: [],
    honors: [],
    hasBajado: false,
    globalScore: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// canastaBaseValue
// ---------------------------------------------------------------------------

describe('canastaBaseValue', () => {
  it('500 for clean low-rank canasta', () => {
    expect(canastaBaseValue(makeCanasta('7', 'clean'))).toBe(500);
  });
  it('300 for dirty low-rank canasta', () => {
    expect(canastaBaseValue(makeCanasta('7', 'dirty'))).toBe(300);
  });
  it('1000 for clean ace canasta', () => {
    expect(canastaBaseValue(makeCanasta('A', 'clean'))).toBe(1000);
  });
  it('3000 for clean twos canasta', () => {
    expect(canastaBaseValue(makeCanasta('2', 'clean'))).toBe(3000);
  });
  it('4000 for clean joker canasta', () => {
    expect(canastaBaseValue(makeCanasta('JOKER', 'clean'))).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// canastaTotal — readme example: clean 7s = 500 + 35 = 535
// ---------------------------------------------------------------------------

describe('canastaTotal', () => {
  it('matches readme example: 7 clean sevens = 535', () => {
    const canasta: Canasta = {
      id: 'c1',
      type: 'clean',
      closed: true,
      rank: '7',
      cards: Array.from({ length: 7 }, (_, i) => ({
        id: `7_${i}`, rank: '7' as const, suit: '♥' as const, kind: 'natural' as const,
      })),
    };
    expect(canastaTotal(canasta)).toBe(535); // 500 + 7*5
  });
});

// ---------------------------------------------------------------------------
// honorPoints
// ---------------------------------------------------------------------------

describe('honorPoints', () => {
  function honor(suit: '♥' | '♦') {
    return { id: `3${suit}`, rank: '3' as const, suit, kind: 'natural' as const };
  }

  it('+100 for 1 honor with clean+dirty', () => {
    const team = makeTeam({
      honors: [honor('♥')],
      canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
    });
    expect(honorPoints(team)).toBe(100);
  });

  it('0 for 1 honor with only clean', () => {
    const team = makeTeam({
      honors: [honor('♥')],
      canastas: [makeCanasta('7', 'clean')],
    });
    expect(honorPoints(team)).toBe(0);
  });

  it('-200 for 1 honor with no clean canastas', () => {
    const team = makeTeam({
      honors: [honor('♥')],
      canastas: [],
    });
    expect(honorPoints(team)).toBe(-200);
  });

  it('+600 for 3 honors with clean+dirty', () => {
    const team = makeTeam({
      honors: [honor('♥'), honor('♦'), honor('♥')],
      canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
    });
    expect(honorPoints(team)).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// idaBonus
// ---------------------------------------------------------------------------

describe('idaBonus', () => {
  it('300 for 0 black 3s', () => expect(idaBonus(0)).toBe(300));
  it('600 for 3 black 3s', () => expect(idaBonus(3)).toBe(600));
  it('900 for 6 black 3s', () => expect(idaBonus(6)).toBe(900));
});

// ---------------------------------------------------------------------------
// checkVictory
// ---------------------------------------------------------------------------

describe('checkVictory', () => {
  it('no winner when both under 15000', () => {
    const r = checkVictory({ team_ns: 12000, team_eo: 14000 });
    expect(r.winner).toBeNull();
    expect(r.isDraw).toBe(false);
  });

  it('team_ns wins when over 15000', () => {
    const r = checkVictory({ team_ns: 16000, team_eo: 14000 });
    expect(r.winner).toBe('team_ns');
  });

  it('draw when both equal at 15000+', () => {
    const r = checkVictory({ team_ns: 16000, team_eo: 16000 });
    expect(r.isDraw).toBe(true);
    expect(r.winner).toBeNull();
  });

  it('higher score wins when both over 15000', () => {
    const r = checkVictory({ team_ns: 15100, team_eo: 15500 });
    expect(r.winner).toBe('team_eo');
  });
});
