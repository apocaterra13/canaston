import {
  createGame,
  addPlayer,
  startSetup,
  startSorteo,
  resolveSorteo,
  executePicada,
  executeReparto,
  executeInicioRonda,
} from '../../engine/setup';
import type { Card, GameStateData } from '../../engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed the sorteo cards directly so we control team assignment. */
function seedSorteoCards(
  game: GameStateData,
  cards: Record<string, Card>,
) {
  for (const [pid, card] of Object.entries(cards)) {
    game.players[pid].sorteoCard = card;
  }
}

function makeCard(rank: Card['rank'], id: string): Card {
  return { id, rank, suit: 'hearts', category: 'NORMAL', points: 10, deckIndex: 0 };
}

/** Build a game with 4 players seated N, E, S, O and advance to SORTEO_EQUIPOS. */
function buildSorteoGame() {
  const game = createGame('test');
  addPlayer(game, 'norte', 'Norte');
  addPlayer(game, 'este',  'Este');
  addPlayer(game, 'sur',   'Sur');
  addPlayer(game, 'oeste', 'Oeste');
  startSetup(game);
  startSorteo(game, () => 0.5); // rng not used for turn-order logic
  // Override sorteo cards to get deterministic results
  return game;
}

// ---------------------------------------------------------------------------
// Turn order alternates teams regardless of sorteo outcome
// ---------------------------------------------------------------------------

describe('resolveSorteo — turn order always alternates teams', () => {
  it('alternates teams when top 2 scorers are adjacent seats (potential bug case)', () => {
    // norte and este are adjacent in seatOrder yet end up on the same team
    // if sorteo gives norte > este > sur > oeste
    const game = buildSorteoGame();
    seedSorteoCards(game, {
      norte: makeCard('A', 'c_norte'), // highest → picador, TEAM_NS
      este:  makeCard('K', 'c_este'),  // second  → TEAM_NS  (adjacent to norte!)
      sur:   makeCard('Q', 'c_sur'),   // third   → TEAM_EW
      oeste: makeCard('J', 'c_oeste'), // lowest  → TEAM_EW
    });

    const result = resolveSorteo(game);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { turnOrder } = result.data;
    expect(turnOrder).toHaveLength(4);

    // Every adjacent pair must be from different teams
    for (let i = 0; i < 4; i++) {
      const a = game.playerTeam[turnOrder[i]];
      const b = game.playerTeam[turnOrder[(i + 1) % 4]];
      expect(a).not.toBe(b);
    }
  });

  it('alternates teams when top 2 scorers are non-adjacent (opposite seats)', () => {
    // norte and sur are partners — non-adjacent in seatOrder [N,E,S,O]
    const game = buildSorteoGame();
    seedSorteoCards(game, {
      norte: makeCard('A', 'c_norte'), // picador, TEAM_NS
      sur:   makeCard('K', 'c_sur'),   // TEAM_NS
      este:  makeCard('Q', 'c_este'),  // TEAM_EW
      oeste: makeCard('J', 'c_oeste'), // TEAM_EW
    });

    const result = resolveSorteo(game);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { turnOrder } = result.data;
    for (let i = 0; i < 4; i++) {
      const a = game.playerTeam[turnOrder[i]];
      const b = game.playerTeam[turnOrder[(i + 1) % 4]];
      expect(a).not.toBe(b);
    }
  });

  it('picador is always first in the turn order', () => {
    const game = buildSorteoGame();
    seedSorteoCards(game, {
      sur:   makeCard('A', 'c_sur'),   // picador
      oeste: makeCard('K', 'c_oeste'),
      norte: makeCard('Q', 'c_norte'),
      este:  makeCard('J', 'c_este'),
    });

    const result = resolveSorteo(game);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.turnOrder[0]).toBe(result.data.picadorId);
  });

  it('turn order is [picador, opponent, partner, other_opponent]', () => {
    // norte is picador (TEAM_NS). este is seat-adjacent → should be firstOpponent.
    // sur is partner. oeste is secondOpponent.
    const game = buildSorteoGame();
    seedSorteoCards(game, {
      norte: makeCard('A', 'c_norte'), // picador → TEAM_NS
      este:  makeCard('K', 'c_este'),  // TEAM_NS (top 2)
      sur:   makeCard('Q', 'c_sur'),   // TEAM_EW
      oeste: makeCard('J', 'c_oeste'), // TEAM_EW
    });

    const result = resolveSorteo(game);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [p0, p1, p2, p3] = result.data.turnOrder;
    // p0 and p2 must be on the same team (TEAM_NS)
    expect(game.playerTeam[p0]).toBe(game.playerTeam[p2]);
    // p1 and p3 must be on the same team (TEAM_EW)
    expect(game.playerTeam[p1]).toBe(game.playerTeam[p3]);
    // Teams must differ
    expect(game.playerTeam[p0]).not.toBe(game.playerTeam[p1]);
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for executeInicioRonda tests
// ---------------------------------------------------------------------------

/** Build a game ready for executeInicioRonda with a controlled stock. */
function buildReadyGame(stockCards: Card[]) {
  const game = buildSorteoGame();
  seedSorteoCards(game, {
    norte: makeCard('A', 'c_norte'),
    este:  makeCard('K', 'c_este'),
    sur:   makeCard('Q', 'c_sur'),
    oeste: makeCard('J', 'c_oeste'),
  });
  const r1 = resolveSorteo(game);
  if (!r1.ok) throw new Error('resolveSorteo failed');
  const { turnOrder, picadorId, repartidorId } = r1.data;
  const r2 = executePicada(game, turnOrder, picadorId, repartidorId);
  if (!r2.ok) throw new Error('executePicada failed');
  const r3 = executeReparto(game);
  if (!r3.ok) throw new Error('executeReparto failed');

  game.round!.stock = stockCards;
  game.state = 'INICIO_RONDA';
  return game;
}

function card3red(id: string): Card {
  return { id, rank: '3', suit: 'hearts', category: 'HONOR', points: 0, deckIndex: 0 };
}

function card3black(id: string): Card {
  return { id, rank: '3', suit: 'spades', category: 'TAPA', points: 0, deckIndex: 0 };
}

function cardNormal(rank: Card['rank'], id: string): Card {
  return { id, rank, suit: 'hearts', category: 'NORMAL', points: 10, deckIndex: 0 };
}

// ---------------------------------------------------------------------------
// executeInicioRonda — initial pilon card can never be a 3
// ---------------------------------------------------------------------------

describe('executeInicioRonda — initial pilon card', () => {

  it('uses the first card when it is a normal card', () => {
    // Stock is drawn from the end (LIFO), so the target card must be last.
    const seven = cardNormal('7', 'seven');
    const game  = buildReadyGame([cardNormal('K', 'k'), seven]);

    const result = executeInicioRonda(game);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // flippedCard is the opener; it sits on top (last element) of round.pilon
      expect(result.data.flippedCard.id).toBe('seven');
      const pilon = game.round!.pilon;
      expect(pilon[pilon.length - 1].id).toBe('seven');
    }
  });

  it('skips a red 3 (HONOR) and uses the next card', () => {
    const red3  = card3red('r3');
    const eight = cardNormal('8', 'eight');
    // stock: [eight, red3] → red3 is drawn first (pop from end)
    const game  = buildReadyGame([eight, red3]);

    const result = executeInicioRonda(game);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.flippedCard.category).not.toBe('HONOR');
      expect(game.round!.pilon[0].category).not.toBe('HONOR');
    }
  });

  it('skips a black 3 (TAPA) and uses the next card', () => {
    const black3 = card3black('b3');
    const nine   = cardNormal('9', 'nine');
    const game   = buildReadyGame([nine, black3]);

    const result = executeInicioRonda(game);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.flippedCard.category).not.toBe('TAPA');
      expect(game.round!.pilon[0].category).not.toBe('TAPA');
    }
  });

  it('skips multiple consecutive 3s to find the first valid card', () => {
    const jack   = cardNormal('J', 'jack');
    const game   = buildReadyGame([jack, card3black('b3b'), card3red('r3a'), card3red('r3b')]);

    const result = executeInicioRonda(game);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const pilonTop = game.round!.pilon[0];
      expect(pilonTop.rank).not.toBe('3');
    }
  });
});

// ---------------------------------------------------------------------------
// executeInicioRonda — burying count matches card value
// ---------------------------------------------------------------------------

describe('executeInicioRonda — cards buried under pilon equals card value', () => {
  /** Stock drawn LIFO — opener must be the last element. */
  function stockWith(openerRank: Card['rank'], openerCategory: Card['category']): Card[] {
    const opener: Card = {
      id: `opener_${openerRank}`,
      rank: openerRank,
      suit: 'hearts',
      category: openerCategory,
      points: 10,
      deckIndex: 0,
    };
    // Provide 30 filler cards so Math.min never caps the bury count (max is 25 for JOKER).
    const fillers: Card[] = Array.from({ length: 30 }, (_, i): Card => ({
      id: `filler_${i}`,
      rank: '4',
      suit: 'hearts',
      category: 'NORMAL',
      points: 5,
      deckIndex: 0,
    }));
    return [...fillers, opener]; // opener is last → drawn first
  }

  const cases: Array<{ rank: Card['rank']; category: Card['category']; buried: number }> = [
    { rank: '4',     category: 'NORMAL', buried: 4  },
    { rank: '5',     category: 'NORMAL', buried: 5  },
    { rank: '6',     category: 'NORMAL', buried: 6  },
    { rank: '7',     category: 'NORMAL', buried: 7  },
    { rank: '8',     category: 'NORMAL', buried: 8  },
    { rank: '9',     category: 'NORMAL', buried: 9  },
    { rank: '10',    category: 'NORMAL', buried: 10 },
    { rank: 'J',     category: 'NORMAL', buried: 11 },
    { rank: 'Q',     category: 'NORMAL', buried: 12 },
    { rank: 'K',     category: 'NORMAL', buried: 13 },
    { rank: 'A',     category: 'NORMAL', buried: 14 },
    { rank: '2',     category: 'PATO',   buried: 20 },
    { rank: 'JOKER', category: 'JOKER',  buried: 25 },
  ];

  it.each(cases)('rank $rank buries $buried cards — pilon total = $buried + 1', ({ rank, category, buried }) => {
    const game = buildReadyGame(stockWith(rank, category));
    const result = executeInicioRonda(game);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.flippedCard.rank).toBe(rank);
      expect(result.data.cardsBuriedUnderPilon).toBe(buried);
      // Pilon array = buried cards (bottom) + opener (top) = buried + 1
      expect(game.round!.pilon).toHaveLength(buried + 1);
      // Opener is the last element
      expect(game.round!.pilon[game.round!.pilon.length - 1].rank).toBe(rank);
    }
  });
});
