import { takePilon, layMeld, commitBajada, discard, addToMeld } from '../../engine/turn';
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
  hasBajado?: boolean;
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

  if (overrides.hasBajado) {
    game.teams['TEAM_NS'].hasBajado = true;
  }

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

describe('takePilon — mandatory meld created and cards routed correctly', () => {
  it('auto-meld contains match cards + top card', () => {
    const topCard = makeCard('top_7h', '7', 'hearts');
    const mid     = makeCard('mid_Kh', 'K', 'hearts');
    const bottom  = makeCard('bot_Ah', 'A', 'hearts');
    const match1  = makeCard('m1_7d', '7', 'diamonds');
    const match2  = makeCard('m2_7c', '7', 'clubs');

    const game = makeGame({
      pilon: [bottom, mid, topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
      hasBajado: true, // bypass bajada minimum check for mechanics test
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const meld = result.data.autoMeld;
    expect(meld.rank).toBe('7');
    expect(meld.cards).toContain(topCard);
    expect(meld.cards).toContain(match1);
    expect(meld.cards).toContain(match2);
    expect(meld.cards).toHaveLength(3);
  });

  it('meld is placed on the team table', () => {
    const topCard = makeCard('top_7h', '7', 'hearts');
    const match1  = makeCard('m1_7d', '7', 'diamonds');
    const match2  = makeCard('m2_7c', '7', 'clubs');

    const game = makeGame({ pilon: [topCard], pilonState: 'NORMAL', hand: [match1, match2], hasBajado: true });
    takePilon(game, 'p1', [match1.id, match2.id]);

    const team = game.teams['TEAM_NS'];
    expect(team.table.melds).toHaveLength(1);
    expect(team.table.melds[0].rank).toBe('7');
  });

  it('only sub-top pilon cards go to hand (top card goes to meld)', () => {
    const topCard = makeCard('top_7h', '7', 'hearts');
    const mid     = makeCard('mid_Kh', 'K', 'hearts');
    const bottom  = makeCard('bot_Ah', 'A', 'hearts');
    const match1  = makeCard('m1_7d', '7', 'diamonds');
    const match2  = makeCard('m2_7c', '7', 'clubs');

    const game = makeGame({
      pilon: [bottom, mid, topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
      hasBajado: true,
    });

    takePilon(game, 'p1', [match1.id, match2.id]);

    const hand = game.players['p1'].hand;
    // mid and bottom go to hand
    expect(hand).toContain(mid);
    expect(hand).toContain(bottom);
    // top card goes to meld, NOT hand
    expect(hand).not.toContain(topCard);
    // match cards go to meld, NOT hand
    expect(hand.find(c => c.id === match1.id)).toBeUndefined();
    expect(hand.find(c => c.id === match2.id)).toBeUndefined();
  });

  it('result.pilonCards contains only the sub-top cards (what went to hand)', () => {
    const topCard = makeCard('top_5h', '5', 'hearts');
    const other   = makeCard('oth_5d', '5', 'diamonds');
    const match1  = makeCard('m1_5c', '5', 'clubs');
    const match2  = makeCard('m2_5s', '5', 'spades');

    const game = makeGame({
      pilon: [other, topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
      hasBajado: true,
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only 'other' went to hand; topCard went to autoMeld
      expect(result.data.pilonCards).toHaveLength(1);
      expect(result.data.pilonCards).toContainEqual(other);
      expect(result.data.pilonCards).not.toContainEqual(topCard);
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
      hasBajado: true,
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
      hasBajado: true,
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
      hasBajado: true,
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id, match3.id]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // topCard goes into the auto-meld, not the hand
      expect(result.data.autoMeld.cards).toContain(topCard);
      expect(game.players['p1'].hand).not.toContain(topCard);
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
      hasBajado: true,
    });

    takePilon(game, 'p1', [match1.id, match2.id]);

    expect(game.turn!.tookPilon).toBe(true);
    expect(game.turn!.phase).toBe('TOOK_PILON');
    // drawnCards contains sub-top pilon cards (what went to hand); topCard went to autoMeld
    expect(game.turn!.drawnCards).not.toContain(topCard);
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

// ---------------------------------------------------------------------------
// Bajada deadlock fix — player can extend their own pending bajada melds
// ---------------------------------------------------------------------------

describe('bajada deadlock — extending a pending bajada meld before commitBajada', () => {
  /** 3-card meld worth pts-per-card × 3 */
  function trio(rank: Card['rank'], prefix: string, pts = 20): Card[] {
    return [
      makeCard(`${prefix}_1`, rank, 'hearts', pts),
      makeCard(`${prefix}_2`, rank, 'diamonds', pts),
      makeCard(`${prefix}_3`, rank, 'clubs', pts),
    ];
  }
  function single(rank: Card['rank'], id: string, pts = 20): Card {
    return makeCard(id, rank, 'spades', pts);
  }

  it('allows adding cards to a pending bajada meld (NO_BAJADA no longer blocks)', () => {
    // Lay a meld worth 15 pts — below the 50-pt minimum
    const fives = trio('5', 'f', 5);
    const extra = single('5', 'f_extra', 5);
    const game  = makeDrawnGame({ hand: [...fives, extra] });

    const layResult = layMeld(game, 'p1', { cardIds: fives.map(c => c.id) });
    expect(layResult.ok).toBe(true);
    if (!layResult.ok) return;

    const meldId = layResult.data.meld.id;

    // Before fix this returned NO_BAJADA and deadlocked the game
    const addResult = addToMeld(game, 'p1', meldId, [extra.id]);
    expect(addResult.ok).toBe(true);
  });

  it('added cards count toward bajada total in commitBajada', () => {
    // 3 × 5-pt fives = 15 pts, then add 3 more fives (5 pts each) → still 30 pts < 50
    const fives = trio('5', 'ff', 5);
    const more  = trio('5', 'ff2', 5);
    const extra = makeCard('disc_K', 'K', 'hearts', 10);

    const game = makeDrawnGame({ hand: [...fives, ...more, extra] });

    const layResult = layMeld(game, 'p1', { cardIds: fives.map(c => c.id) });
    expect(layResult.ok).toBe(true);
    if (!layResult.ok) return;
    const meldId = layResult.data.meld.id;

    const addResult = addToMeld(game, 'p1', meldId, more.map(c => c.id));
    expect(addResult.ok).toBe(true);

    // 6 × 5-pts = 30 pts — still below 50
    const commitFail = commitBajada(game, 'p1');
    expect(commitFail.ok).toBe(false);
    if (!commitFail.ok) expect(commitFail.error.code).toBe('BAJADA_MINIMUM_NOT_MET');
  });

  it('commitBajada succeeds once enough cards are in the bajada meld', () => {
    const aces  = trio('A', 'ace', 20);
    const extra = makeCard('disc_K', 'K', 'hearts', 10);

    const game = makeDrawnGame({ hand: [...aces, extra] });
    layMeld(game, 'p1', { cardIds: aces.map(c => c.id) });

    const result = commitBajada(game, 'p1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.totalPoints).toBe(60);
  });

  it('non-bajada meld still requires hasBajado (cannot extend a meld from a previous turn)', () => {
    const aces  = trio('A', 'prev', 20);
    const extra = makeCard('ext_A', 'A', 'spades', 20);

    const game = makeDrawnGame({ hand: [extra] });
    // Manually put a meld on the table that is NOT tracked in bajadaMeldIds
    game.teams['TEAM_NS'].table.melds.push({ id: 'old_meld', rank: 'A', cards: aces });

    const result = addToMeld(game, 'p1', 'old_meld', [extra.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NO_BAJADA');
  });
});

// ---------------------------------------------------------------------------
// takePilon + bajada — player must declare additional melds to meet minimum
// ---------------------------------------------------------------------------

describe('takePilon — bajada requirement when team has not yet bajado', () => {
  /**
   * Build cards of a given rank (all NORMAL category).
   * 20 pts each so 3 cards = 60 pts, clearing the default 50-pt minimum.
   */
  function naturalCards(rank: Card['rank'], prefix: string, count: number, pts = 20): Card[] {
    return Array.from({ length: count }, (_, i) =>
      makeCard(`${prefix}_${i}`, rank, 'hearts', pts),
    );
  }

  it('fails when auto-meld points alone are below the minimum', () => {
    // topCard = 5 pts, 2 match cards = 5 pts each → auto-meld = 15 pts < 50
    const topCard = makeCard('top_5h', '5', 'hearts', 5);
    const match1  = makeCard('m1_5d', '5', 'diamonds', 5);
    const match2  = makeCard('m2_5c', '5', 'clubs', 5);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
      // hasBajado intentionally NOT set — team must meet minimum
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_BAJADA_MINIMUM_NOT_MET');
  });

  it('fails when match cards have enough points but no additional melds are declared', () => {
    // match cards (20 pts each) + topCard (20 pts) would be 60 pts total,
    // but match cards do NOT count toward bajada — so additionalPts = 0 < 50.
    const topCard = makeCard('top_7h', '7', 'hearts', 20);
    const match1  = makeCard('m1_7d', '7', 'diamonds', 20);
    const match2  = makeCard('m2_7c', '7', 'clubs', 20);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_BAJADA_MINIMUM_NOT_MET');
  });

  it('succeeds when additional meld group bridges the gap to the minimum', () => {
    // auto-meld: topCard (5) + 2 match cards (5 each) = 15 pts
    // additional meld: 3 aces (20 each) = 60 pts → total = 75 pts ≥ 50
    const topCard = makeCard('top_5h', '5', 'hearts', 5);
    const match1  = makeCard('m1_5d', '5', 'diamonds', 5);
    const match2  = makeCard('m2_5c', '5', 'clubs', 5);
    const aces    = naturalCards('A', 'a', 3, 20);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, ...aces],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id], [aces.map(c => c.id)]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(game.teams['TEAM_NS'].hasBajado).toBe(true);
      expect(result.data.additionalMelds).toHaveLength(1);
      expect(result.data.additionalMelds[0].rank).toBe('A');
      // Additional meld cards removed from hand
      for (const ace of aces) {
        expect(game.players['p1'].hand.find(c => c.id === ace.id)).toBeUndefined();
      }
      // Auto-meld and additional meld appear on team table
      expect(game.teams['TEAM_NS'].table.melds).toHaveLength(2);
    }
  });

  it('rejects when additional meld group has fewer than 3 cards (invalid meld)', () => {
    const topCard = makeCard('top_5h', '5', 'hearts', 5);
    const match1  = makeCard('m1_5d', '5', 'diamonds', 5);
    const match2  = makeCard('m2_5c', '5', 'clubs', 5);
    const onlyTwo = naturalCards('A', 'a', 2, 20);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, ...onlyTwo],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id], [onlyTwo.map(c => c.id)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_BAJADA_INVALID_MELD');
  });

  it('merges an additional group of the same rank as the auto-meld into a single meld', () => {
    // Auto-meld = Aces (pilon top A + 2 match As). Additional group also Aces →
    // all cards merged into one Ace meld (no duplicate meld created).
    const topCard  = makeCard('top_Ah', 'A', 'hearts', 20);
    const match1   = makeCard('m1_Ad', 'A', 'diamonds', 20);
    const match2   = makeCard('m2_Ac', 'A', 'clubs', 20);
    const moreAces = naturalCards('A', 'extra', 3, 20);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, ...moreAces],
    });

    const result = takePilon(game, 'p1', [match1.id, match2.id], [moreAces.map(c => c.id)]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only one Ace meld on table (merged, not two separate melds)
      const aceMelds = game.teams['TEAM_NS'].table.melds.filter(m => m.rank === 'A');
      expect(aceMelds).toHaveLength(1);
      // That meld has all 6 cards (2 match + topCard + 3 extra)
      expect(aceMelds[0].cards).toHaveLength(6);
    }
  });

  it('rejects when two additional meld groups share the same rank', () => {
    const topCard = makeCard('top_5h', '5', 'hearts', 5);
    const match1  = makeCard('m1_5d', '5', 'diamonds', 5);
    const match2  = makeCard('m2_5c', '5', 'clubs', 5);
    const aces1   = naturalCards('A', 'a1', 3, 20);
    const aces2   = naturalCards('A', 'a2', 3, 20);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, ...aces1, ...aces2],
    });

    const result = takePilon(
      game, 'p1',
      [match1.id, match2.id],
      [aces1.map(c => c.id), aces2.map(c => c.id)],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DUPLICATE_RANK_MELD');
  });

  it('rejects when a card appears in both match cards and an additional meld group', () => {
    const topCard = makeCard('top_7h', '7', 'hearts', 20);
    const match1  = makeCard('m1_7d', '7', 'diamonds', 20);
    const match2  = makeCard('m2_7c', '7', 'clubs', 20);
    const aces    = naturalCards('A', 'a', 3, 20);

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, ...aces],
    });

    // match1 used in both matchCardIds and the additional group — duplicate
    const result = takePilon(
      game,
      'p1',
      [match1.id, match2.id],
      [[match1.id, ...aces.map(c => c.id)]],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PILON_BAJADA_DUPLICATE_CARD');
  });

  it('hasBajado is set after successful pilon take pre-bajada (with sufficient additional melds)', () => {
    // Match cards don't count — need 3 aces (20 pts each = 60 pts) as additional meld
    const topCard = makeCard('top_7h', '7', 'hearts', 5);
    const match1  = makeCard('m1_7d', '7', 'diamonds', 5);
    const match2  = makeCard('m2_7c', '7', 'clubs', 5);
    const aces    = naturalCards('A', 'b', 3, 20); // 60 pts ≥ 50

    const game = makeGame({
      pilon: [topCard],
      pilonState: 'NORMAL',
      hand: [match1, match2, ...aces],
    });

    expect(game.teams['TEAM_NS'].hasBajado).toBe(false);
    const result = takePilon(game, 'p1', [match1.id, match2.id], [aces.map(c => c.id)]);
    expect(result.ok).toBe(true);
    expect(game.teams['TEAM_NS'].hasBajado).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quemar — burning cards into a closed canasta
// ---------------------------------------------------------------------------

describe('quemar — burning cards into a closed canasta', () => {
  function makeClosedCanasta(rank: Card['rank'], id: string): import('../../engine/types').Canasta {
    const cards = Array.from({ length: 7 }, (_, i): Card => ({
      id: `${id}_card${i}`, rank, suit: 'hearts', category: 'NORMAL', points: 10, deckIndex: 0,
    }));
    return { id, rank, cards, type: 'LIMPIA', closed: true, burned: [] };
  }

  it('cannot open a new meld of a rank that is already an open meld', () => {
    const aces = [
      makeCard('a1', 'A', 'hearts', 20),
      makeCard('a2', 'A', 'diamonds', 20),
      makeCard('a3', 'A', 'clubs', 20),
    ];
    const extra = [
      makeCard('a4', 'A', 'spades', 20),
      makeCard('a5', 'A', 'hearts', 20),
      makeCard('a6', 'A', 'diamonds', 20),
    ];
    const game = makeDrawnGame({ hand: [...aces, ...extra], hasBajado: true });

    // First meld succeeds
    const r1 = layMeld(game, 'p1', { cardIds: aces.map(c => c.id) });
    expect(r1.ok).toBe(true);

    // Second meld of same rank must be rejected
    const r2 = layMeld(game, 'p1', { cardIds: extra.map(c => c.id) });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('DUPLICATE_RANK_MELD');
  });

  it('cannot open a new meld of a rank that already has a canasta', () => {
    const newAces = [
      makeCard('na1', 'A', 'hearts', 20),
      makeCard('na2', 'A', 'diamonds', 20),
      makeCard('na3', 'A', 'clubs', 20),
    ];
    const game = makeDrawnGame({ hand: newAces, hasBajado: true });

    // Manually place a closed canasta of Aces on the team table
    game.teams['TEAM_NS'].table.canastas.push(makeClosedCanasta('A', 'cana_A'));

    const result = layMeld(game, 'p1', { cardIds: newAces.map(c => c.id) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DUPLICATE_RANK_MELD');
  });

  it('burning natural cards of same rank into a closed canasta succeeds', () => {
    const burnCard = makeCard('burn_A', 'A', 'spades', 20);
    const game = makeDrawnGame({ hand: [burnCard], hasBajado: true });

    game.teams['TEAM_NS'].table.canastas.push(makeClosedCanasta('A', 'cana_A'));

    const result = store_addToCanasta(game, burnCard);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const canasta = game.teams['TEAM_NS'].table.canastas[0];
      expect(canasta.burned).toHaveLength(1);
      expect(canasta.burned[0].id).toBe('burn_A');
    }
  });

  it('burning a wildcard into a closed canasta is rejected', () => {
    const joker: Card = { id: 'j1', rank: 'JOKER', suit: 'hearts', category: 'JOKER', points: 50, deckIndex: 0 };
    const game = makeDrawnGame({ hand: [joker], hasBajado: true });

    game.teams['TEAM_NS'].table.canastas.push(makeClosedCanasta('A', 'cana_A'));

    const result = store_addToCanasta(game, joker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CANASTA_CLOSED_NO_WILDS');
  });
});

// Helper: call addToCanasta directly (simulates store action)
function store_addToCanasta(game: GameStateData, card: Card) {
  const { addToCanasta } = require('../../engine/turn');
  const canastaId = game.teams['TEAM_NS'].table.canastas[0].id;
  return addToCanasta(game, 'p1', canastaId, [card.id]);
}
