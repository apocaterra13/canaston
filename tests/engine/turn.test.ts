import { takePilon, layMeld, commitBajada, discard } from '../../engine/turn';
import type {
  Card,
  GameStateData,
  Player,
  RoundState,
  Team,
  TurnContext,
} from '../../engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(id: string, rank: Card['rank'], suit: Card['suit'] = 'hearts', points = 5): Card {
  return {
    id,
    rank,
    suit,
    category: 'NORMAL',
    points,
    deckIndex: 0,
  };
}

function makePlayer(id: string, hand: Card[]): Player {
  return { id, name: id, hand, sorteoCard: null };
}

function makeTeam(id: 'TEAM_NS' | 'TEAM_EW', p1: string, p2: string): Team {
  return {
    id,
    name: id,
    playerIds: [p1, p2],
    globalScore: 0,
    hasBajado: false,
    monoObligado: false,
    table: { melds: [], canastas: [], honors: [] },
  };
}

function makeRound(overrides: Partial<RoundState> = {}): RoundState {
  return {
    roundNumber: 1,
    turnOrder: ['p1', 'p2', 'p3', 'p4'],
    currentTurnIndex: 0,
    picadorIndex: 0,
    repartidorIndex: 1,
    stock: [],
    pilon: [],
    pilonState: 'EMPTY',
    tapaActive: false,
    idaPlayerId: null,
    picadaSpecialCards: [],
    ...overrides,
  };
}

function makeTurnContext(playerId: string): TurnContext {
  return {
    playerId,
    phase: 'WAITING_DRAW',
    drawnCards: [],
    tookPilon: false,
    pilonMatchCards: [],
    bajadaMeldIds: [],
  };
}

function makeGame(overrides: {
  pilon?: Card[];
  pilonState?: RoundState['pilonState'];
  tapaActive?: boolean;
  hand?: Card[];
  currentPlayerId?: string;
}): GameStateData {
  const playerId = overrides.currentPlayerId ?? 'p1';
  const hand     = overrides.hand ?? [];

  const game: GameStateData = {
    gameId: 'test',
    state: 'TURNO_NORMAL',
    players: {
      p1: makePlayer('p1', playerId === 'p1' ? hand : []),
      p2: makePlayer('p2', []),
      p3: makePlayer('p3', []),
      p4: makePlayer('p4', []),
    },
    seatOrder: ['p1', 'p2', 'p3', 'p4'],
    teams: {
      TEAM_NS: makeTeam('TEAM_NS', 'p1', 'p3'),
      TEAM_EW: makeTeam('TEAM_EW', 'p2', 'p4'),
    },
    playerTeam: { p1: 'TEAM_NS', p2: 'TEAM_EW', p3: 'TEAM_NS', p4: 'TEAM_EW' },
    round: makeRound({
      pilon:      overrides.pilon      ?? [],
      pilonState: overrides.pilonState ?? 'NORMAL',
      tapaActive: overrides.tapaActive ?? false,
      currentTurnIndex: 0,
      turnOrder: ['p1', 'p2', 'p3', 'p4'],
    }),
    turn: makeTurnContext(playerId),
    scoreHistory: [],
    winner: null,
  };

  return game;
}

/** Build a game where the current player has already drawn (ready to lay melds). */
function makeDrawnGame(opts: {
  playerId?: string;
  hand: Card[];
  hasBajado?: boolean;
  stock?: Card[];
}): GameStateData {
  const playerId = opts.playerId ?? 'p1';
  const game = makeGame({ hand: opts.hand, currentPlayerId: playerId });
  game.turn!.phase = 'DRAWN_FROM_STOCK';
  if (opts.hasBajado) {
    game.teams['TEAM_NS'].hasBajado = true;
  }
  if (opts.stock) {
    game.round!.stock = opts.stock;
  }
  return game;
}

// ---------------------------------------------------------------------------
// takePilon — core: cards must be added to hand
// ---------------------------------------------------------------------------

describe('takePilon — pilon cards added to hand', () => {
  it('adds all pilon cards to the player hand', () => {
    const topCard   = makeCard('top_7h', '7', 'hearts');
    const mid       = makeCard('mid_Kh', 'K', 'hearts');
    const bottom    = makeCard('bot_Ah', 'A', 'hearts');
    const match1    = makeCard('m1_7d', '7', 'diamonds');
    const match2    = makeCard('m2_7c', '7', 'clubs');

    const game = makeGame({
      pilon:  [bottom, mid, topCard],  // topCard is last element (top of pile)
      pilonState: 'NORMAL',
      hand: [match1, match2],
    });

    const handBefore = game.players['p1'].hand.length;
    const result = takePilon(game, 'p1', [match1.id, match2.id]);

    expect(result.ok).toBe(true);
    // Hand grows by: pilon cards (3) minus match cards removed (2) = +1
    const handAfter = game.players['p1'].hand;
    expect(handAfter.length).toBe(handBefore - 2 + 3); // removed 2 match, added 3 pilon
    expect(handAfter).toContain(topCard);
    expect(handAfter).toContain(mid);
    expect(handAfter).toContain(bottom);
  });

  it('returns the pilon cards in the result payload', () => {
    const topCard = makeCard('top_5h', '5', 'hearts');
    const other   = makeCard('oth_5d', '5', 'diamonds');
    const match1  = makeCard('m1_5c', '5', 'clubs');
    const match2  = makeCard('m2_5s', '5', 'spades');

    const game = makeGame({
      pilon: [other, topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pilonCards).toHaveLength(2);
      expect(result.data.pilonCards).toContainEqual(topCard);
      expect(result.data.pilonCards).toContainEqual(other);
    }
  });

  it('clears the pilon after being taken', () => {
    const topCard = makeCard('top_Qh', 'Q', 'hearts');
    const match1  = makeCard('m1_Qd', 'Q', 'diamonds');
    const match2  = makeCard('m2_Qc', 'Q', 'clubs');

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
    });

    takePilon(game, 'p1', [match1.id, match2.id]);

    expect(game.round!.pilon).toHaveLength(0);
    expect(game.round!.pilonState).toBe('EMPTY');
  });

  it('removes the match cards from hand (they are NOT duplicated)', () => {
    const topCard = makeCard('top_Jh', 'J', 'hearts');
    const match1  = makeCard('m1_Jd', 'J', 'diamonds');
    const match2  = makeCard('m2_Jc', 'J', 'clubs');
    const other   = makeCard('oth_4h', '4', 'hearts');

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, other],
    });

    takePilon(game, 'p1', [match1.id, match2.id]);

    const hand = game.players['p1'].hand;
    expect(hand.find(c => c.id === match1.id)).toBeUndefined();
    expect(hand.find(c => c.id === match2.id)).toBeUndefined();
    // other card is still there
    expect(hand.find(c => c.id === other.id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// takePilon — triado (needs 3 matching cards)
// ---------------------------------------------------------------------------

describe('takePilon — triado state', () => {
  it('requires 3 match cards when pilon is TRIADO', () => {
    const topCard = makeCard('top_Ah', 'A', 'hearts');
    const match1  = makeCard('m1_Ad', 'A', 'diamonds');
    const match2  = makeCard('m2_Ac', 'A', 'clubs');
    const match3  = makeCard('m3_As', 'A', 'spades');

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'TRIADO',
      hand: [match1, match2, match3],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id, match3.id]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(game.players['p1'].hand).toContain(topCard);
    }
  });

  it('rejects only 2 match cards when pilon is TRIADO', () => {
    const topCard = makeCard('top_Kh', 'K', 'hearts');
    const match1  = makeCard('m1_Kd', 'K', 'diamonds');
    const match2  = makeCard('m2_Kc', 'K', 'clubs');

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'TRIADO',
      hand: [match1, match2],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PILON_WRONG_MATCH_COUNT');
    }
  });
});

// ---------------------------------------------------------------------------
// takePilon — guard conditions
// ---------------------------------------------------------------------------

describe('takePilon — guard conditions', () => {
  it('rejects when pilon is empty', () => {
    const game = makeGame({ pilon: [], pilonState: 'EMPTY' });
    const result = takePilon(game, 'p1', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_EMPTY');
  });

  it('rejects when tapa is active', () => {
    const topCard = makeCard('top_3s', '3', 'spades');
    const match1  = makeCard('m1_3d', '3', 'diamonds');
    const match2  = makeCard('m2_3c', '3', 'clubs');

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'TAPA',
      tapaActive: true,
      hand: [match1, match2],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_TAPA');
  });

  it('rejects when match cards have wrong rank', () => {
    const topCard = makeCard('top_7h', '7', 'hearts');
    const wrong1  = makeCard('w1_8d', '8', 'diamonds');
    const wrong2  = makeCard('w2_8c', '8', 'clubs');

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [wrong1, wrong2],
    });

    const result = takePilon(game, 'p1', [wrong1.id, wrong2.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_RANK_MISMATCH');
  });

  it('rejects when it is not the player\'s turn', () => {
    const topCard = makeCard('top_9h', '9', 'hearts');
    const match1  = makeCard('m1_9d', '9', 'diamonds');
    const match2  = makeCard('m2_9c', '9', 'clubs');

    // Game is p1's turn, but we try to act as p2
    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [],
    });
    game.players['p2'].hand = [match1, match2];

    const result = takePilon(game, 'p2', [match1.id, match2.id]);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// takePilon — turn context updated correctly
// ---------------------------------------------------------------------------

describe('takePilon — turn context', () => {
  it('sets tookPilon flag and phase to TOOK_PILON', () => {
    const topCard = makeCard('top_6h', '6', 'hearts');
    const match1  = makeCard('m1_6d', '6', 'diamonds');
    const match2  = makeCard('m2_6c', '6', 'clubs');

    const game = makeGame({
      pilon:      [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
    });

    takePilon(game, 'p1', [match1.id, match2.id]);

    expect(game.turn!.tookPilon).toBe(true);
    expect(game.turn!.phase).toBe('TOOK_PILON');
    expect(game.turn!.drawnCards).toContain(topCard);
  });
});

// ---------------------------------------------------------------------------
// Bajada — only the first team member faces the point restriction
// ---------------------------------------------------------------------------

describe('bajada — team-level flag, only one member must meet the minimum', () => {
  /**
   * Build three natural cards of the same rank.
   * Default points=20 so three cards = 60 pts, clearing the 50-pt bajada minimum.
   */
  function trio(rank: Card['rank'], prefix: string, pts = 20): Card[] {
    return [
      makeCard(`${prefix}_1`, rank, 'hearts', pts),
      makeCard(`${prefix}_2`, rank, 'diamonds', pts),
      makeCard(`${prefix}_3`, rank, 'clubs', pts),
    ];
  }

  it('commitBajada sets team.hasBajado to true', () => {
    const aces = trio('A', 'a');
    const game = makeDrawnGame({ hand: aces });
    layMeld(game, 'p1', { cardIds: aces.map(c => c.id) });
    const result = commitBajada(game, 'p1');
    expect(result.ok).toBe(true);
    expect(game.teams['TEAM_NS'].hasBajado).toBe(true);
  });

  it('after p1 bajadas, p3 (partner) can lay melds without any point check', () => {
    // p1 bajadas first
    const acesP1 = trio('A', 'ap1');
    const gameP1 = makeDrawnGame({ hand: acesP1 });
    layMeld(gameP1, 'p1', { cardIds: acesP1.map(c => c.id) });
    commitBajada(gameP1, 'p1');

    // Now simulate p3's turn on the same shared game object.
    // p3 is also TEAM_NS — hasBajado should already be true.
    const kingsP3 = trio('K', 'kp3');
    gameP1.players['p3'].hand = kingsP3;
    gameP1.round!.currentTurnIndex = 2; // p3 is at index 2
    gameP1.turn = {
      playerId: 'p3',
      phase: 'DRAWN_FROM_STOCK',
      drawnCards: [],
      tookPilon: false,
      pilonMatchCards: [],
      bajadaMeldIds: [],
    };

    // p3 should be free to lay melds with only 3×10 = 30 pts (below the 50-pt minimum)
    const r = layMeld(gameP1, 'p3', { cardIds: kingsP3.map(c => c.id) });
    expect(r.ok).toBe(true);

    // p3 should NOT need to call commitBajada
    const commitResult = commitBajada(gameP1, 'p3');
    expect(commitResult.ok).toBe(false);
    if (!commitResult.ok) expect(commitResult.error.code).toBe('ALREADY_BAJADO');
  });

  it('commitBajada only counts melds laid this turn, not a partner\'s melds from a previous turn', () => {
    // p3 lays a meld in turn 1 but does NOT commit
    const kingsP3 = trio('K', 'kp3_prev');
    const game    = makeDrawnGame({ hand: [] });
    game.players['p3'].hand = kingsP3;
    game.round!.currentTurnIndex = 2;
    game.turn = {
      playerId: 'p3',
      phase: 'DRAWN_FROM_STOCK',
      drawnCards: [],
      tookPilon: false,
      pilonMatchCards: [],
      bajadaMeldIds: [],
    };
    layMeld(game, 'p3', { cardIds: kingsP3.map(c => c.id) });
    // p3 does NOT call commitBajada — those melds are on the table but uncommitted

    // Now it's p1's turn — cards worth only 5 pts each: 3×5 = 15 pts < 50 minimum
    const fivesP1 = trio('5', '5p1', 5);
    game.players['p1'].hand = fivesP1;
    game.round!.currentTurnIndex = 0;
    game.turn = {
      playerId: 'p1',
      phase: 'DRAWN_FROM_STOCK',
      drawnCards: [],
      tookPilon: false,
      pilonMatchCards: [],
      bajadaMeldIds: [],
    };
    layMeld(game, 'p1', { cardIds: fivesP1.map(c => c.id) });

    // p1 has 3×5 = 15 pts this turn. Partner's kings (30 pts) must NOT count.
    // Minimum is 50 at globalScore=0, so this should FAIL.
    const result = commitBajada(game, 'p1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BAJADA_MINIMUM_NOT_MET');
  });

  it('discard is blocked when bajada melds are pending and not yet committed', () => {
    const aces  = trio('A', 'discard_a');
    const extra = makeCard('extra_K', 'K', 'hearts');
    const game  = makeDrawnGame({ hand: [...aces, extra] });
    layMeld(game, 'p1', { cardIds: aces.map(c => c.id) });
    // Do NOT call commitBajada

    const result = discard(game, 'p1', extra.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BAJADA_NOT_COMMITTED');
  });

  it('discard succeeds once bajada is committed', () => {
    const aces   = trio('A', 'dc_a');
    // Two extra cards so the hand is not empty after discarding one — avoids the ida path.
    const extra1 = makeCard('dc_K1', 'K', 'hearts');
    const extra2 = makeCard('dc_K2', 'K', 'diamonds');
    const game   = makeDrawnGame({ hand: [...aces, extra1, extra2] });
    game.round!.pilon      = [makeCard('pile_top', '7', 'hearts')];
    game.round!.pilonState = 'NORMAL';

    layMeld(game, 'p1', { cardIds: aces.map(c => c.id) });
    commitBajada(game, 'p1');

    const result = discard(game, 'p1', extra1.id);
    expect(result.ok).toBe(true);
  });
});
