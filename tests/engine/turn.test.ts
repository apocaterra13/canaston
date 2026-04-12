import { takePilon } from '../../engine/turn';
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

function makeCard(id: string, rank: Card['rank'], suit: Card['suit'] = 'hearts'): Card {
  return {
    id,
    rank,
    suit,
    category: 'NORMAL',
    points: 5,
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
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
    });

    takePilon(game, 'p1', [match1.id, match2.id]);

    expect(game.turn!.tookPilon).toBe(true);
    expect(game.turn!.phase).toBe('TOOK_PILON');
    expect(game.turn!.drawnCards).toContain(topCard);
  });
});
