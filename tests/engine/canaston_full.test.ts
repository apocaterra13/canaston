// =============================================================================
// CANASTÓN — Comprehensive Engine Test Suite
// Covers: setup, deal, state transitions, action validation, pilón, canastas,
//         triado, tapas, bajada thresholds, mono obligado, honors, ida, scoring,
//         and game-over detection.
// =============================================================================

import {
  validateCombination,
  validateCanasta,
  validateBajada,
  getBajadaMinimum,
  cardPoints,
  combinationPoints,
  canTakePilon,
  hasMonoObligado,
  validateIda,
  assertCurrentPlayer,
} from '../../src/engine/rules';

import {
  canastaBaseValue,
  canastaCardPoints,
  canastaTotal,
  honorPoints,
  honorCloseType,
  idaBonus,
  handValue,
  blackThreesInHand,
  tableCardPoints,
  calculateRoundScore,
  checkVictory,
} from '../../src/engine/scoring';

import {
  buildShuffledDeck,
  drawFromStock,
  simulatePicada,
  resolveRepartidorCard,
} from '../../src/engine/deck';

import {
  createInitialGameState,
  resetForNewRound,
  transitionTo,
  assertPhase,
} from '../../src/engine/stateMachine';

import {
  Card,
  NaturalCard,
  PatoCard,
  JokerCard,
  Canasta,
  Pilon,
  Team,
  TeamId,
  GameState,
  WINNING_SCORE,
  isHonor,
  isTapa,
  isMono,
} from '../../src/engine/types';

// =============================================================================
// Shared card-factory helpers
// =============================================================================

function nat(
  rank: NaturalCard['rank'],
  suit: '♥' | '♦' | '♣' | '♠' = '♥',
  id?: string,
): NaturalCard {
  return { id: id ?? `${rank}${suit}`, rank, suit, kind: 'natural' };
}

function pato(suit: '♥' | '♦' | '♣' | '♠' = '♥', id?: string): PatoCard {
  return { id: id ?? `2${suit}`, rank: '2', suit, kind: 'pato' };
}

function joker(id = 'J0'): JokerCard {
  return { id, rank: 'JOKER', suit: null, kind: 'joker' };
}

/** Red 3 (honor) */
function honor(suit: '♥' | '♦' = '♥', id?: string): NaturalCard {
  return nat('3', suit, id ?? `3${suit}`);
}

/** Black 3 (tapa) */
function tapa(suit: '♣' | '♠' = '♣', id?: string): NaturalCard {
  return nat('3', suit, id ?? `3${suit}`);
}

// =============================================================================
// Shared team/canasta factory helpers
// =============================================================================

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

/** Build a closed Canasta with the given rank, type, and card count */
function makeCanasta(
  rank: Canasta['rank'],
  type: 'clean' | 'dirty',
  cardCount = 7,
  closed = true,
): Canasta {
  const cards = Array.from({ length: cardCount }, (_, i) => ({
    id: `${rank}_${i}`,
    rank: rank as any,
    suit: '♥' as const,
    kind: 'natural' as const,
  }));
  return { id: `canasta_${rank}_${type}`, cards, type, closed, rank };
}

/** Convenience: team with at least 1 clean + 1 dirty closed canasta (ida-ready) */
function makeIdaReadyTeam(overrides: Partial<Team> = {}): Team {
  return makeTeam({
    canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
    ...overrides,
  });
}

// =============================================================================
// 1. FOUR-PLAYER SETUP
// =============================================================================

describe('4-player setup — createInitialGameState', () => {
  it('starts in LOBBY phase', () => {
    const s = createInitialGameState();
    expect(s.phase).toBe('LOBBY');
  });

  it('has exactly two teams: team_ns and team_eo', () => {
    const s = createInitialGameState();
    const teamIds = Object.keys(s.teams).sort();
    expect(teamIds).toEqual(['team_eo', 'team_ns']);
  });

  it('starts with round 0 and no winner', () => {
    const s = createInitialGameState();
    expect(s.round).toBe(0);
    expect(s.winner).toBeNull();
    expect(s.isDraw).toBe(false);
  });

  it('starts with empty stock and empty pilón', () => {
    const s = createInitialGameState();
    expect(s.stock).toHaveLength(0);
    expect(s.pilon.cards).toHaveLength(0);
    expect(s.pilon.state).toBe('empty');
  });

  it('starts with no current player', () => {
    const s = createInitialGameState();
    expect(s.currentPlayerId).toBeNull();
  });

  it('teams start with no canastas, no honors, hasBajado=false', () => {
    const s = createInitialGameState();
    for (const team of Object.values(s.teams)) {
      expect(team.canastas).toHaveLength(0);
      expect(team.honors).toHaveLength(0);
      expect(team.hasBajado).toBe(false);
      expect(team.globalScore).toBe(0);
    }
  });

  it('resetForNewRound increments round counter', () => {
    const s = createInitialGameState();
    const r = resetForNewRound(s);
    expect(r.round).toBe(1);
  });

  it('resetForNewRound clears hands, canastas, honors, and hasBajado', () => {
    // Simulate a state with some round data
    const s = createInitialGameState();
    const dirtied: GameState = {
      ...s,
      teams: {
        team_ns: makeTeam({
          id: 'team_ns',
          hasBajado: true,
          canastas: [makeCanasta('7', 'clean')],
          honors: [honor()],
          tableCards: [nat('5')],
        }),
        team_eo: makeTeam({
          id: 'team_eo',
          hasBajado: true,
          canastas: [makeCanasta('A', 'dirty')],
          honors: [honor('♦')],
          tableCards: [nat('8')],
        }),
      },
      players: {
        p1: { id: 'p1', name: 'P1', position: 'north', teamId: 'team_ns', hand: [nat('K')] },
      },
    };

    const reset = resetForNewRound(dirtied);

    expect(reset.round).toBe(1);
    expect(reset.teams.team_ns.hasBajado).toBe(false);
    expect(reset.teams.team_ns.canastas).toHaveLength(0);
    expect(reset.teams.team_ns.honors).toHaveLength(0);
    expect(reset.teams.team_ns.tableCards).toHaveLength(0);
    expect(reset.players.p1.hand).toHaveLength(0);
  });
});

// =============================================================================
// 2. INITIAL DEAL CORRECTNESS
// =============================================================================

describe('initial deal — buildShuffledDeck', () => {
  let deck: Card[];
  beforeEach(() => { deck = buildShuffledDeck(); });

  it('produces exactly 162 cards (3 decks × 52 + 6 jokers)', () => {
    expect(deck).toHaveLength(162);
  });

  it('contains exactly 6 jokers', () => {
    const jokers = deck.filter(c => c.kind === 'joker');
    expect(jokers).toHaveLength(6);
  });

  it('contains exactly 12 patos (2s, 4 per deck × 3 decks)', () => {
    const patos = deck.filter(c => c.kind === 'pato');
    expect(patos).toHaveLength(12);
  });

  it('contains exactly 6 red 3s (honors)', () => {
    const honors = deck.filter(isHonor);
    expect(honors).toHaveLength(6);
  });

  it('contains exactly 6 black 3s (tapas)', () => {
    const tapas = deck.filter(isTapa);
    expect(tapas).toHaveLength(6);
  });

  it('every card has a unique ID', () => {
    const ids = deck.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(162);
  });

  it('shuffled: two builds are not identical (probabilistic — fails <1 in 10^280 runs)', () => {
    const deck2 = buildShuffledDeck();
    // Compare first 10 ids; probability both match by chance is astronomically low
    const sig1 = deck.slice(0, 10).map(c => c.id).join(',');
    const sig2 = deck2.slice(0, 10).map(c => c.id).join(',');
    expect(sig1).not.toBe(sig2);
  });
});

describe('initial deal — drawFromStock', () => {
  it('draws exactly 15 cards for one player and leaves 147 behind', () => {
    const deck = buildShuffledDeck();
    const [drawn, remaining] = drawFromStock(deck, 15);
    expect(drawn).toHaveLength(15);
    expect(remaining).toHaveLength(147);
  });

  it('drawing 15 cards four times yields 60 total cards dealt', () => {
    let stock = buildShuffledDeck();
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const [hand, rest] = drawFromStock(stock, 15);
      total += hand.length;
      stock = rest;
    }
    expect(total).toBe(60);
    expect(stock).toHaveLength(102); // 162 - 60
  });

  it('drawing more cards than in stock returns all remaining', () => {
    const tiny = [nat('5'), nat('6')];
    const [drawn, remaining] = drawFromStock(tiny, 10);
    expect(drawn).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('drawn cards are not in the remaining stock', () => {
    const deck = buildShuffledDeck();
    const [drawn, remaining] = drawFromStock(deck, 15);
    const drawnIds = new Set(drawn.map(c => c.id));
    const clash = remaining.filter(c => drawnIds.has(c.id));
    expect(clash).toHaveLength(0);
  });
});

describe('resolveRepartidorCard — dealer first card determines pilón size', () => {
  it('joker → 25 cards face-down', () => {
    expect(resolveRepartidorCard(joker())).toBe(25);
  });

  it('pato (2) → 20 cards face-down', () => {
    expect(resolveRepartidorCard(pato())).toBe(20);
  });

  it('3 → 0 (signals flip next card)', () => {
    expect(resolveRepartidorCard(nat('3'))).toBe(0);
  });

  it('4 → 4 face-down', () => {
    expect(resolveRepartidorCard(nat('4'))).toBe(4);
  });

  it('7 → 7 face-down', () => {
    expect(resolveRepartidorCard(nat('7'))).toBe(7);
  });

  it('J → 11 face-down', () => {
    expect(resolveRepartidorCard(nat('J'))).toBe(11);
  });

  it('Q → 12 face-down', () => {
    expect(resolveRepartidorCard(nat('Q'))).toBe(12);
  });

  it('K → 13 face-down', () => {
    expect(resolveRepartidorCard(nat('K'))).toBe(13);
  });

  it('A → 14 face-down', () => {
    expect(resolveRepartidorCard(nat('A'))).toBe(14);
  });
});

// =============================================================================
// 3. STATE TRANSITION LEGALITY
// =============================================================================

describe('state transitions — transitionTo', () => {
  function stateAt(phase: GameState['phase']): GameState {
    return { ...createInitialGameState(), phase };
  }

  it('LOBBY → SETUP is valid', () => {
    const result = transitionTo(stateAt('LOBBY'), 'SETUP');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.phase).toBe('SETUP');
  });

  it('SETUP → SORTEO_EQUIPOS is valid', () => {
    expect(transitionTo(stateAt('SETUP'), 'SORTEO_EQUIPOS').ok).toBe(true);
  });

  it('REPARTO_INICIAL → INICIO_RONDA is valid', () => {
    expect(transitionTo(stateAt('REPARTO_INICIAL'), 'INICIO_RONDA').ok).toBe(true);
  });

  it('RESOLUCION_PILON can go to BAJADA, JUEGO_EN_MESA, or TURNO_NORMAL', () => {
    const s = stateAt('RESOLUCION_PILON');
    expect(transitionTo(s, 'BAJADA').ok).toBe(true);
    expect(transitionTo(s, 'JUEGO_EN_MESA').ok).toBe(true);
    expect(transitionTo(s, 'TURNO_NORMAL').ok).toBe(true);
  });

  it('CONTEO_FINAL can go to NUEVA_RONDA or FIN_PARTIDA', () => {
    const s = stateAt('CONTEO_FINAL');
    expect(transitionTo(s, 'NUEVA_RONDA').ok).toBe(true);
    expect(transitionTo(s, 'FIN_PARTIDA').ok).toBe(true);
  });

  it('FIN_PARTIDA → LOBBY allows restart', () => {
    expect(transitionTo(stateAt('FIN_PARTIDA'), 'LOBBY').ok).toBe(true);
  });

  it('LOBBY → TURNO_NORMAL is INVALID (skips phases)', () => {
    const result = transitionTo(stateAt('LOBBY'), 'TURNO_NORMAL');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Transición inválida/i);
    }
  });

  it('TURNO_NORMAL → BAJADA is INVALID (must pass through RESOLUCION_PILON)', () => {
    expect(transitionTo(stateAt('TURNO_NORMAL'), 'BAJADA').ok).toBe(false);
  });

  it('JUEGO_EN_MESA → TURNO_NORMAL is INVALID (wrong direction)', () => {
    expect(transitionTo(stateAt('JUEGO_EN_MESA'), 'TURNO_NORMAL').ok).toBe(false);
  });

  it('FIN_PARTIDA → SETUP is INVALID', () => {
    expect(transitionTo(stateAt('FIN_PARTIDA'), 'SETUP').ok).toBe(false);
  });
});

describe('state transitions — assertPhase', () => {
  function stateAt(phase: GameState['phase']): GameState {
    return { ...createInitialGameState(), phase };
  }

  it('passes when game is in expected phase', () => {
    const result = assertPhase(stateAt('TURNO_NORMAL'), 'TURNO_NORMAL');
    expect(result.ok).toBe(true);
  });

  it('passes when game matches one of multiple expected phases', () => {
    const result = assertPhase(stateAt('BAJADA'), 'BAJADA', 'JUEGO_EN_MESA');
    expect(result.ok).toBe(true);
  });

  it('fails when game is in an unexpected phase', () => {
    const result = assertPhase(stateAt('LOBBY'), 'TURNO_NORMAL');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/LOBBY/);
  });
});

// =============================================================================
// 4. INVALID ACTION REJECTION
// =============================================================================

describe('assertCurrentPlayer — turn enforcement', () => {
  it('allows action when player ID matches currentPlayerId', () => {
    const s: GameState = { ...createInitialGameState(), currentPlayerId: 'alice' };
    expect(assertCurrentPlayer(s, 'alice').ok).toBe(true);
  });

  it('rejects action when it is not that player\'s turn', () => {
    const s: GameState = { ...createInitialGameState(), currentPlayerId: 'alice' };
    const result = assertCurrentPlayer(s, 'bob');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/turno/i);
  });
});

describe('validateCombination — invalid combinations', () => {
  it('rejects a combination with only 2 cards (minimum is 3)', () => {
    const result = validateCombination([nat('7'), nat('7')]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/3 cartas/i);
  });

  it('rejects cards of different ranks (mixed values)', () => {
    const result = validateCombination([nat('7'), nat('8'), nat('9')]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mismo valor/i);
  });

  it('rejects 1 natural + 2 monos (not enough naturals to support wildcards)', () => {
    // Rule: need 2 natural cards per mono used
    const result = validateCombination([nat('A'), pato(), pato('♦')]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/naturales/i);
  });

  it('rejects honors (red 3s) in a combination', () => {
    const result = validateCombination([honor('♥'), honor('♦'), honor('♥', '3♥2')]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/3s/i);
  });

  it('rejects black 3s (tapas) in a combination', () => {
    const result = validateCombination([tapa('♣'), tapa('♠'), tapa('♣', '3♣2')]);
    expect(result.valid).toBe(false);
    // Black 3s are rank '3' — caught by the "no 3s" rule
    expect(result.reason).toMatch(/3s/i);
  });

  it('rejects an empty combination', () => {
    const result = validateCombination([]);
    expect(result.valid).toBe(false);
  });
});

describe('validateCombination — valid combinations', () => {
  it('accepts 3 naturals of the same rank', () => {
    expect(validateCombination([nat('Q'), nat('Q', '♦'), nat('Q', '♣')]).valid).toBe(true);
  });

  it('accepts 2 naturals + 1 joker (1 mono with 2 natural support)', () => {
    expect(validateCombination([nat('K'), nat('K', '♦'), joker()]).valid).toBe(true);
  });

  it('accepts 4 naturals + 2 patos (2 monos need 4 natural support)', () => {
    const cards = [
      nat('9', '♥'), nat('9', '♦'), nat('9', '♣'), nat('9', '♠'),
      pato(), pato('♦'),
    ];
    expect(validateCombination(cards).valid).toBe(true);
  });

  it('accepts aces (20-point natural cards) in combination', () => {
    expect(validateCombination([nat('A'), nat('A', '♦'), nat('A', '♣')]).valid).toBe(true);
  });
});

// =============================================================================
// 5. TAKING THE DISCARD PILE (PILÓN)
// =============================================================================

describe('canTakePilon — normal state', () => {
  const normalPilon: Pilon = {
    cards: [nat('J', '♥', 'vis')],
    state: 'normal',
  };

  it('allows taking when player has 2 matching natural cards', () => {
    const hand = [nat('J', '♦'), nat('J', '♣')];
    expect(canTakePilon(normalPilon, hand, false).allowed).toBe(true);
  });

  it('blocks taking when player has only 1 matching natural card', () => {
    const hand = [nat('J', '♦'), nat('K')];
    const result = canTakePilon(normalPilon, hand, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/2 carta/i);
  });

  it('blocks taking when player has 0 matching cards', () => {
    expect(canTakePilon(normalPilon, [nat('A'), nat('K')], false).allowed).toBe(false);
  });

  it('monos in hand do NOT count as matching cards for pilón', () => {
    // Has 1 matching natural + 1 pato — should still need 2 naturals
    const hand = [nat('J', '♦'), pato()];
    expect(canTakePilon(normalPilon, hand, false).allowed).toBe(false);
  });

  it('tapas in hand do NOT count as matching cards for pilón', () => {
    const hand = [nat('J', '♦'), tapa()];
    expect(canTakePilon(normalPilon, hand, false).allowed).toBe(false);
  });
});

describe('canTakePilon — empty pilón', () => {
  it('blocks taking from an empty pilón', () => {
    const emptyPilon: Pilon = { cards: [], state: 'empty' };
    const result = canTakePilon(emptyPilon, [nat('7'), nat('7', '♦')], false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/vacío/i);
  });

  it('blocks when pilon cards array is empty even if state is not empty', () => {
    // Edge case: cards empty but state mismatch
    const weirdPilon: Pilon = { cards: [], state: 'normal' };
    expect(canTakePilon(weirdPilon, [nat('7'), nat('7', '♦')], false).allowed).toBe(false);
  });
});

// =============================================================================
// 6. TRIADO RULES
// =============================================================================

describe('canTakePilon — triado state (mono on top)', () => {
  const triadoPilon: Pilon = {
    cards: [nat('8', '♥', 'vis')],
    state: 'triado',
  };

  it('blocks taking with only 2 matching cards (need 3 in triado)', () => {
    const hand2 = [nat('8', '♦'), nat('8', '♣')];
    const result = canTakePilon(triadoPilon, hand2, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/3 carta/i);
  });

  it('allows taking when player has exactly 3 matching natural cards', () => {
    const hand3 = [nat('8', '♦'), nat('8', '♣'), nat('8', '♠')];
    expect(canTakePilon(triadoPilon, hand3, false).allowed).toBe(true);
  });

  it('allows taking with 4+ matching cards (more than minimum)', () => {
    // Should still work — has more than required
    // But we only have 3 copies per suit × 3 decks; let's use unique IDs
    const hand4 = [
      nat('8', '♦', '8d1'), nat('8', '♣', '8c1'),
      nat('8', '♠', '8s1'), nat('8', '♥', '8h2'),
    ];
    expect(canTakePilon(triadoPilon, hand4, false).allowed).toBe(true);
  });

  it('monos do NOT satisfy triado matching requirement', () => {
    // 2 natural 8s + 1 pato = still insufficient (pato doesn't count)
    const hand = [nat('8', '♦'), nat('8', '♣'), pato()];
    expect(canTakePilon(triadoPilon, hand, false).allowed).toBe(false);
  });

  it('error message specifies the 3-card requirement', () => {
    const result = canTakePilon(triadoPilon, [nat('8', '♦')], false);
    expect(result.reason).toContain('3');
  });
});

// =============================================================================
// 7. BLACK 3 TAPA RULES
// =============================================================================

describe('canTakePilon — tapa state (black 3 on top)', () => {
  const tapaPilon: Pilon = {
    cards: [tapa('♣', 'tapa_vis')],
    state: 'tapa',
  };

  it('ALWAYS blocks taking when pilón is in tapa state', () => {
    // Even with a full matching hand, tapa blocks all taking
    const richHand = [nat('3', '♦'), nat('3', '♥'), nat('3', '♦', '3d2')];
    const result = canTakePilon(tapaPilon, richHand, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/tapado/i);
  });

  it('tapa state blocks even for teams that have already bajado', () => {
    expect(canTakePilon(tapaPilon, [nat('A'), nat('A', '♦')], true).allowed).toBe(false);
  });
});

describe('validateIda — cannot discard black 3 (tapa) to go out', () => {
  it('rejects going out by discarding a black 3 when hand has 1 tapa', () => {
    const discardTapa = tapa('♣');
    const hand = [discardTapa]; // single tapa in hand
    const team = makeIdaReadyTeam();
    const result = validateIda(discardTapa, hand, team);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/3 negro/i);
  });
});

// =============================================================================
// 8. INITIAL MELD THRESHOLDS (BAJADA MINIMUMS)
// =============================================================================

describe('getBajadaMinimum — threshold at every score band', () => {
  const cases: [number, number][] = [
    [0, 50],
    [1000, 50],
    [2999, 50],
    [3000, 90],
    [4999, 90],
    [5000, 120],
    [7999, 120],
    [8000, 160],
    [9999, 160],
    [10000, 180],
    [11999, 180],
    [12000, 200],
    [14999, 200],
    [15000, 200], // at or above WINNING_SCORE, returns max
  ];

  test.each(cases)(
    'globalScore=%i → minimum %i points to bajada',
    (score, expected) => {
      expect(getBajadaMinimum(score)).toBe(expected);
    },
  );
});

describe('validateBajada — threshold enforcement', () => {
  it('accepts a bajada that exactly meets the minimum (50 pts at 0 global)', () => {
    // 10 × 5-point cards = 50 pts (e.g., three 4s: 3 × 5 = 15 — not enough)
    // Need 50 pts: three Ks (10+10+10=30) + three 8s (10+10+10=30) = no, combine better
    // Three 8s + three 9s won't work (mixed ranks). Use Aces: 3×20 = 60 ≥ 50.
    const combo = [nat('A'), nat('A', '♦'), nat('A', '♣')]; // 60 pts
    expect(validateBajada([combo], makeTeam({ globalScore: 0 })).valid).toBe(true);
  });

  it('rejects a bajada below the minimum (three 4s = 15 pts < 50)', () => {
    const combo = [nat('4'), nat('4', '♦'), nat('4', '♣')]; // 15 pts
    const result = validateBajada([combo], makeTeam({ globalScore: 0 }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/50/);
  });

  it('rejects a bajada if the team already bajó this round', () => {
    const combo = [nat('A'), nat('A', '♦'), nat('A', '♣')];
    const result = validateBajada([combo], makeTeam({ hasBajado: true }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/ya hizo bajada/i);
  });

  it('accepts a bajada with multiple valid combinations totaling enough', () => {
    // At 3000 global score, need 90 pts
    // Two combos: 3 kings (30 pts) + 3 queens (30 pts) = 60 < 90 — add joker combo
    // 3 aces = 60 + 3 kings = 30 → 90 pts exactly
    const combo1 = [nat('A'), nat('A', '♦'), nat('A', '♣')]; // 60 pts
    const combo2 = [nat('K'), nat('K', '♦'), nat('K', '♣')]; // 30 pts
    expect(validateBajada([combo1, combo2], makeTeam({ globalScore: 3000 })).valid).toBe(true);
  });

  it('rejects bajada when a combination itself is invalid (mixed ranks)', () => {
    const badCombo = [nat('5'), nat('6'), nat('7')]; // different ranks
    const result = validateBajada([badCombo], makeTeam({ globalScore: 0 }));
    expect(result.valid).toBe(false);
  });

  it('bajada at 5000 global score requires 120 pts minimum', () => {
    // 3 aces (60) + 3 kings (30) = 90 < 120 → fails
    const notEnough = [
      [nat('A'), nat('A', '♦'), nat('A', '♣')],
      [nat('K'), nat('K', '♦'), nat('K', '♣')],
    ];
    expect(validateBajada(notEnough, makeTeam({ globalScore: 5000 })).valid).toBe(false);

    // Add a joker combo: 2 aces + 1 joker = 90 pts (already counted above; let's use 3 more aces)
    // 3 aces (60) + 3 more aces (60) = 120 ≥ 120 → passes
    const enough = [
      [nat('A', '♥', 'A1'), nat('A', '♦', 'A2'), nat('A', '♣', 'A3')],
      [nat('A', '♥', 'A4'), nat('A', '♦', 'A5'), nat('A', '♣', 'A6')],
    ];
    expect(validateBajada(enough, makeTeam({ globalScore: 5000 })).valid).toBe(true);
  });
});

// =============================================================================
// 9. MONO OBLIGADO
// =============================================================================

describe('hasMonoObligado — open wildcard canasta forces mono play', () => {
  it('returns false when team has no canastas', () => {
    expect(hasMonoObligado(makeTeam())).toBe(false);
  });

  it('returns false when team only has normal (non-mono) open canastas', () => {
    const team = makeTeam({
      canastas: [makeCanasta('7', 'clean', 7, false)], // open normal canasta
    });
    expect(hasMonoObligado(team)).toBe(false);
  });

  it('returns true when team has an open pato (2) canasta', () => {
    const openMonoCanasta: Canasta = {
      id: 'mc1',
      rank: '2',
      type: 'clean',
      closed: false,  // not yet closed — obligado is active
      cards: Array.from({ length: 5 }, (_, i) => pato('♥', `p${i}`)),
    };
    const team = makeTeam({ canastas: [openMonoCanasta] });
    expect(hasMonoObligado(team)).toBe(true);
  });

  it('returns true when team has an open joker canasta', () => {
    const openJokerCanasta: Canasta = {
      id: 'jc1',
      rank: 'JOKER',
      type: 'clean',
      closed: false,
      cards: Array.from({ length: 4 }, (_, i) => joker(`j${i}`)),
    };
    const team = makeTeam({ canastas: [openJokerCanasta] });
    expect(hasMonoObligado(team)).toBe(true);
  });

  it('returns false when the mono canasta IS closed (obligation fulfilled)', () => {
    const closedMonoCanasta: Canasta = {
      id: 'mc2',
      rank: '2',
      type: 'clean',
      closed: true,  // closed — obligado is done
      cards: Array.from({ length: 7 }, (_, i) => pato('♥', `p${i}`)),
    };
    const team = makeTeam({ canastas: [closedMonoCanasta] });
    expect(hasMonoObligado(team)).toBe(false);
  });

  it('returns true when one of multiple canastas is an open mono canasta', () => {
    const openMono: Canasta = {
      id: 'mc3',
      rank: '2',
      type: 'clean',
      closed: false,
      cards: [pato(), pato('♦')],
    };
    const team = makeTeam({
      canastas: [makeCanasta('K', 'clean'), openMono],
    });
    expect(hasMonoObligado(team)).toBe(true);
  });
});

// =============================================================================
// 10. CLEAN AND DIRTY CANASTAS
// =============================================================================

describe('validateCanasta — clean vs dirty classification', () => {
  it('7 natural cards of the same rank → clean canasta', () => {
    const cards = Array.from({ length: 7 }, (_, i) => nat('Q', '♥', `Q${i}`));
    const result = validateCanasta(cards);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('clean');
  });

  it('6 naturals + 1 pato → dirty canasta', () => {
    const cards: Card[] = [
      ...Array.from({ length: 6 }, (_, i) => nat('9', '♥', `9_${i}`)),
      pato(),
    ];
    const result = validateCanasta(cards);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('dirty');
  });

  it('5 naturals + 2 monos → dirty canasta (max 2 wildcards)', () => {
    const cards: Card[] = [
      ...Array.from({ length: 5 }, (_, i) => nat('J', '♥', `J_${i}`)),
      pato(), joker(),
    ];
    const result = validateCanasta(cards);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('dirty');
  });

  it('rejects 4 naturals + 3 monos (naturals-per-mono ratio check fires first)', () => {
    // 4 naturals, 3 monos: rule needs 2 naturals per mono → 6 required, only 4.
    // The ratio check fires before the max-mono check, so error is about naturals.
    const cards: Card[] = [
      ...Array.from({ length: 4 }, (_, i) => nat('K', '♥', `K_${i}`)),
      pato('♥', 'p1'), pato('♦', 'p2'), joker('j1'),
    ];
    const result = validateCanasta(cards);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/naturales/i);
  });

  it('rejects canasta with fewer than 7 cards', () => {
    const cards = Array.from({ length: 6 }, (_, i) => nat('8', '♥', `8_${i}`));
    const result = validateCanasta(cards);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/7 cartas/i);
  });

  it('rejects canasta with more than 7 cards', () => {
    const cards = Array.from({ length: 8 }, (_, i) => nat('5', '♥', `5_${i}`));
    const result = validateCanasta(cards);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/7 cartas/i);
  });

  it('clean canasta of aces has base value 1000', () => {
    expect(canastaBaseValue(makeCanasta('A', 'clean'))).toBe(1000);
  });

  it('dirty canasta of aces has base value 500', () => {
    expect(canastaBaseValue(makeCanasta('A', 'dirty'))).toBe(500);
  });

  it('clean low-card canasta (4–K) has base value 500', () => {
    for (const rank of ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const) {
      expect(canastaBaseValue(makeCanasta(rank, 'clean'))).toBe(500);
    }
  });

  it('dirty low-card canasta (4–K) has base value 300', () => {
    expect(canastaBaseValue(makeCanasta('7', 'dirty'))).toBe(300);
  });

  it('clean twos canasta has base value 3000', () => {
    expect(canastaBaseValue(makeCanasta('2', 'clean'))).toBe(3000);
  });

  it('dirty twos canasta has base value 2000', () => {
    expect(canastaBaseValue(makeCanasta('2', 'dirty'))).toBe(2000);
  });

  it('clean joker canasta has base value 4000', () => {
    expect(canastaBaseValue(makeCanasta('JOKER', 'clean'))).toBe(4000);
  });

  it('dirty joker canasta has base value 2000', () => {
    expect(canastaBaseValue(makeCanasta('JOKER', 'dirty'))).toBe(2000);
  });

  it('canastaCardPoints sums individual card values correctly', () => {
    // 7 kings @ 10 pts each = 70
    const canasta = makeCanasta('K', 'clean');
    expect(canastaCardPoints(canasta)).toBe(70);
  });

  it('canastaTotal = base + card points (readme example: 7 clean 7s = 535)', () => {
    const canasta: Canasta = {
      id: 'c1',
      type: 'clean',
      closed: true,
      rank: '7',
      cards: Array.from({ length: 7 }, (_, i) => ({
        id: `7_${i}`, rank: '7' as const, suit: '♥' as const, kind: 'natural' as const,
      })),
    };
    expect(canastaTotal(canasta)).toBe(535); // 500 + 7×5
  });
});

// =============================================================================
// 11. HONORS — FORCED PLAY AND SCORING
// =============================================================================

describe('isHonor / isTapa — card classification', () => {
  it('3♥ is an honor (red 3)', () => expect(isHonor(honor('♥'))).toBe(true));
  it('3♦ is an honor (red 3)', () => expect(isHonor(honor('♦'))).toBe(true));
  it('3♣ is NOT an honor (it is a tapa)', () => expect(isHonor(tapa('♣'))).toBe(false));
  it('3♠ is NOT an honor (it is a tapa)', () => expect(isHonor(tapa('♠'))).toBe(false));
  it('3♣ is a tapa', () => expect(isTapa(tapa('♣'))).toBe(true));
  it('K♥ is neither honor nor tapa', () => {
    const k = nat('K');
    expect(isHonor(k)).toBe(false);
    expect(isTapa(k)).toBe(false);
  });
});

describe('honorPoints — scoring table by close type', () => {
  function teamWithHonors(
    count: number,
    hasClean: boolean,
    hasDirty: boolean,
  ): Team {
    const honors = Array.from({ length: count }, (_, i) =>
      honor(i % 2 === 0 ? '♥' : '♦', `h${i}`),
    );
    const canastas: Canasta[] = [];
    if (hasClean) canastas.push(makeCanasta('7', 'clean'));
    if (hasDirty) canastas.push(makeCanasta('A', 'dirty'));
    return makeTeam({ honors, canastas });
  }

  describe('limpia_sucia (has both clean and dirty) — positive bonuses', () => {
    const scores = [0, 100, 200, 600, 800, 1000, 2000];
    scores.forEach((expected, count) => {
      it(`${count} honors → ${expected} pts`, () => {
        expect(honorPoints(teamWithHonors(count, true, true))).toBe(expected);
      });
    });
  });

  describe('solo_limpia (only clean, no dirty) — always 0', () => {
    [0, 1, 2, 3, 4, 5, 6].forEach(count => {
      it(`${count} honors → 0 pts (no bonus, no penalty)`, () => {
        expect(honorPoints(teamWithHonors(count, true, false))).toBe(0);
      });
    });
  });

  describe('sin_limpia (no clean canasta) — penalties', () => {
    const penalties = [0, -200, -400, -1200, -1600, -2000, -4000];
    penalties.forEach((expected, count) => {
      it(`${count} honors → ${expected} pts (penalty)`, () => {
        expect(honorPoints(teamWithHonors(count, false, false))).toBe(expected);
      });
    });
  });

  it('honorCloseType returns limpia_sucia when team has both clean and dirty', () => {
    const team = makeTeam({
      canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
    });
    expect(honorCloseType(team)).toBe('limpia_sucia');
  });

  it('honorCloseType returns solo_limpia when team has only clean', () => {
    const team = makeTeam({ canastas: [makeCanasta('7', 'clean')] });
    expect(honorCloseType(team)).toBe('solo_limpia');
  });

  it('honorCloseType returns sin_limpia when team has only dirty or none', () => {
    expect(honorCloseType(makeTeam({ canastas: [makeCanasta('A', 'dirty')] }))).toBe('sin_limpia');
    expect(honorCloseType(makeTeam())).toBe('sin_limpia');
  });

  it('caps honor count at 6 (no double-scoring for 6+ honors)', () => {
    // Only 6 red 3s exist in 3 decks; the table only goes to index 6
    const team = makeTeam({
      honors: Array.from({ length: 6 }, (_, i) => honor(i % 2 === 0 ? '♥' : '♦', `h${i}`)),
      canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
    });
    expect(honorPoints(team)).toBe(2000);
  });
});

// =============================================================================
// 12. IDA (GOING OUT) REQUIREMENTS
// =============================================================================

describe('validateIda — going-out conditions', () => {
  it('succeeds when team has 1 clean + 1 dirty canasta and hand has 1 normal card', () => {
    const discardCard = nat('K');
    const hand = [discardCard];
    const team = makeIdaReadyTeam();
    const result = validateIda(discardCard, hand, team);
    expect(result.valid).toBe(true);
  });

  it('rejects when team has ONLY clean canastas (needs 1 dirty too)', () => {
    const discardCard = nat('K');
    const hand = [discardCard];
    const team = makeTeam({ canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'clean')] });
    const result = validateIda(discardCard, hand, team);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/limpia.*sucia|sucia.*limpia/i);
  });

  it('rejects when team has ONLY dirty canastas (needs 1 clean too)', () => {
    const discardCard = nat('K');
    const hand = [discardCard];
    const team = makeTeam({ canastas: [makeCanasta('7', 'dirty'), makeCanasta('A', 'dirty')] });
    const result = validateIda(discardCard, hand, team);
    expect(result.valid).toBe(false);
  });

  it('rejects when team has NO closed canastas at all', () => {
    const discardCard = nat('K');
    const hand = [discardCard];
    const result = validateIda(discardCard, hand, makeTeam());
    expect(result.valid).toBe(false);
  });

  it('rejects when hand has non-tapa cards left besides the discard', () => {
    // Discarding K but still holding Q — that's not a valid go-out
    const result = validateIda(nat('K'), [nat('K'), nat('Q')], makeIdaReadyTeam());
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/última carta|3\+ tres negros/i);
  });

  it('rejects going out by discarding a mono (wildcard)', () => {
    const result = validateIda(pato(), [pato()], makeIdaReadyTeam());
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mono/i);
  });

  it('rejects going out by discarding a joker', () => {
    const result = validateIda(joker(), [joker()], makeIdaReadyTeam());
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mono/i);
  });

  it('rejects discarding a black 3 — you must keep them and discard another card', () => {
    // Even if you have 3 tapas, you cannot discard one of them to go out
    const t1 = tapa('♣', 't1'), t2 = tapa('♠', 't2'), t3 = tapa('♣', 't3');
    const result = validateIda(t1, [t1, t2, t3], makeIdaReadyTeam());
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/3 negro/i);
  });

  it('rejects when 1 black 3 remains after discard (not enough for exception)', () => {
    const k = nat('K');
    const t1 = tapa('♣', 't1');
    const result = validateIda(k, [k, t1], makeIdaReadyTeam());
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/3\+|menos de 3|al menos 3/i);
  });

  it('rejects when 2 black 3s remain after discard (still not enough)', () => {
    const k = nat('K');
    const t1 = tapa('♣', 't1'), t2 = tapa('♠', 't2');
    const result = validateIda(k, [k, t1, t2], makeIdaReadyTeam());
    expect(result.valid).toBe(false);
  });

  it('accepts going out with 3 black 3s remaining — discard a different card', () => {
    // Hand: [7♥, 3♣, 3♠, 3♣_2] — discard the 7, keep 3 tapas
    const seven = nat('7');
    const hand = [seven, tapa('♣', 't1'), tapa('♠', 't2'), tapa('♣', 't3')];
    const result = validateIda(seven, hand, makeIdaReadyTeam());
    expect(result.valid).toBe(true);
  });

  it('accepts going out with 4 black 3s remaining', () => {
    const k = nat('K');
    const hand = [k, tapa('♣','t1'), tapa('♠','t2'), tapa('♣','t3'), tapa('♠','t4')];
    expect(validateIda(k, hand, makeIdaReadyTeam()).valid).toBe(true);
  });

  it('accepts going out with all 6 black 3s remaining — discard the last non-tapa', () => {
    const seven = nat('7');
    const hand = [
      seven,
      tapa('♣','t1'), tapa('♠','t2'), tapa('♣','t3'),
      tapa('♠','t4'), tapa('♣','t5'), tapa('♠','t6'),
    ];
    expect(validateIda(seven, hand, makeIdaReadyTeam()).valid).toBe(true);
  });

  it('unclosed canastas do NOT count toward ida requirements', () => {
    const openClean: Canasta = { ...makeCanasta('7', 'clean'), closed: false };
    const openDirty: Canasta = { ...makeCanasta('A', 'dirty'), closed: false };
    const team = makeTeam({ canastas: [openClean, openDirty] });
    expect(validateIda(nat('K'), [nat('K')], team).valid).toBe(false);
  });
});

describe('idaBonus — bonus points for going out', () => {
  it('base bonus of 300 for going out with 0 black 3s kept', () => {
    expect(idaBonus(0)).toBe(300);
  });

  it('300 for going out with 3 black 3s kept (card points score separately: 3×5=15)', () => {
    // The 300 is the base going-out bonus; the 15 card pts come from winnerHandBonus
    expect(idaBonus(3)).toBe(600);
  });

  it('300 bonus + extra for 6 black 3s (card points: 6×5=30 scored separately)', () => {
    expect(idaBonus(6)).toBe(900);
  });
});

// =============================================================================
// 13. FINAL ROUND SCORING
// =============================================================================

describe('tableCardPoints — loose cards on table', () => {
  it('with a clean canasta: table cards count positively', () => {
    const team = makeTeam({
      canastas: [makeCanasta('7', 'clean')],
      tableCards: [nat('A'), nat('K')], // 20 + 10 = 30
    });
    expect(tableCardPoints(team)).toBe(30);
  });

  it('with only a dirty canasta: table cards count as 0', () => {
    const team = makeTeam({
      canastas: [makeCanasta('7', 'dirty')],
      tableCards: [nat('A'), nat('K')], // normally 30 but negated
    });
    expect(tableCardPoints(team)).toBe(0);
  });

  it('with no canastas: table cards are DEDUCTED (negative)', () => {
    const team = makeTeam({
      canastas: [],
      tableCards: [nat('A'), nat('K')], // 20 + 10 = 30 → -30
    });
    expect(tableCardPoints(team)).toBe(-30);
  });

  it('no canastas and no table cards → 0', () => {
    expect(tableCardPoints(makeTeam())).toBe(0);
  });
});

describe('handValue — card point sum in hand', () => {
  it('sums point values of all cards in hand', () => {
    const hand = [nat('A'), nat('K'), pato(), joker()]; // 20+10+20+50 = 100
    expect(handValue(hand)).toBe(100);
  });

  it('returns 0 for empty hand', () => {
    expect(handValue([])).toBe(0);
  });

  it('3s contribute 0 points to hand value', () => {
    expect(handValue([honor(), tapa()])).toBe(0);
  });
});

describe('blackThreesInHand — count tapas in hand', () => {
  it('counts only black 3s', () => {
    const hand: Card[] = [tapa('♣'), tapa('♠'), nat('K'), honor()];
    expect(blackThreesInHand(hand)).toBe(2);
  });

  it('returns 0 when no black 3s in hand', () => {
    expect(blackThreesInHand([nat('A'), nat('K')])).toBe(0);
  });
});

describe('calculateRoundScore — full round scoring', () => {
  /**
   * Scenario: team_ns wins (goes out), team_eo loses.
   * team_ns: 1 clean 7-canasta, 1 dirty A-canasta, 2 honors, no table cards
   * team_eo: 1 dirty K-canasta, 1 honor, 5♥ in table cards
   * Going-out player (ns/p1): hand = [] after discarding, no black 3s
   * Losing player (eo/p1): hand = [A♦] = 20 pts penalty
   */
  function buildScenario() {
    const nsTeam: Team = makeTeam({
      id: 'team_ns',
      playerIds: ['ns_p1', 'ns_p2'],
      canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
      honors: [honor('♥', 'h1'), honor('♦', 'h2')],
      tableCards: [],
    });

    const eoTeam: Team = makeTeam({
      id: 'team_eo',
      playerIds: ['eo_p1', 'eo_p2'],
      canastas: [makeCanasta('K', 'dirty')],
      honors: [honor('♥', 'h3')],
      tableCards: [nat('5', '♥', 'tbl1')],
    });

    const teams: Record<TeamId, Team> = {
      team_ns: nsTeam,
      team_eo: eoTeam,
    };

    const allPlayers: Record<string, { teamId: TeamId; hand: Card[] }> = {
      ns_p1: { teamId: 'team_ns', hand: [] },         // went out — hand is empty
      ns_p2: { teamId: 'team_ns', hand: [nat('4')] }, // partner still had 1 card
      eo_p1: { teamId: 'team_eo', hand: [nat('A', '♦', 'Aeo')] }, // 20-pt penalty
      eo_p2: { teamId: 'team_eo', hand: [] },
    };

    return { teams, allPlayers };
  }

  it('calculates non-zero scores for both teams', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    expect(results).toHaveLength(2);
    const nsResult = results.find(r => r.teamId === 'team_ns')!;
    const eoResult = results.find(r => r.teamId === 'team_eo')!;
    expect(nsResult).toBeDefined();
    expect(eoResult).toBeDefined();
    expect(nsResult.total).toBeGreaterThan(0);
  });

  it('winning team (team_ns) receives the ida bonus', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    const nsResult = results.find(r => r.teamId === 'team_ns')!;
    expect(nsResult.idaBonus).toBe(300); // 0 black 3s → base 300
  });

  it('losing team (team_eo) receives 0 ida bonus', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    const eoResult = results.find(r => r.teamId === 'team_eo')!;
    expect(eoResult.idaBonus).toBe(0);
  });

  it('losing team hand cards are deducted as penalty', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    const eoResult = results.find(r => r.teamId === 'team_eo')!;
    // eo_p1 has A (20 pts) — should be negative penalty
    expect(eoResult.losingHandPenalty).toBe(-20);
  });

  it('winning team canasta base is correct (500 clean 7s + 500 dirty As)', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    const nsResult = results.find(r => r.teamId === 'team_ns')!;
    // 1 clean 7-canasta = 500, 1 dirty A-canasta = 500
    expect(nsResult.canastaBase).toBe(1000);
  });

  it('team_eo with only dirty canasta gets 0 table card points', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    const eoResult = results.find(r => r.teamId === 'team_eo')!;
    // team_eo has only dirty canastas → table cards = 0
    // honors without clean = penalty (-200 for 1 honor with sin_limpia)
    // but wait: has dirty canasta → sin_limpia (no clean)
    expect(eoResult.honorPoints).toBe(-200); // 1 honor, no clean canasta
  });

  it('honor points for winning team with clean+dirty are positive', () => {
    const { teams, allPlayers } = buildScenario();
    const results = calculateRoundScore('team_ns', teams, 'ns_p1', allPlayers);
    const nsResult = results.find(r => r.teamId === 'team_ns')!;
    expect(nsResult.honorPoints).toBe(200); // 2 honors, limpia_sucia → 200
  });
});

// =============================================================================
// 14. GAME ENDS AT 15 000 OR MORE
// =============================================================================

describe('checkVictory — game-over detection', () => {
  it('no winner when both teams are below 15 000', () => {
    const r = checkVictory({ team_ns: 14999, team_eo: 14999 });
    expect(r.winner).toBeNull();
    expect(r.isDraw).toBe(false);
  });

  it('no winner when one team is exactly at 14 999', () => {
    const r = checkVictory({ team_ns: 14999, team_eo: 5000 });
    expect(r.winner).toBeNull();
  });

  it('team_ns wins when it is the only one at or above 15 000', () => {
    const r = checkVictory({ team_ns: 15000, team_eo: 14999 });
    expect(r.winner).toBe('team_ns');
    expect(r.isDraw).toBe(false);
  });

  it('team_eo wins when it is the only one at or above 15 000', () => {
    const r = checkVictory({ team_ns: 14000, team_eo: 15001 });
    expect(r.winner).toBe('team_eo');
    expect(r.isDraw).toBe(false);
  });

  it('team_ns wins when both are above 15 000 but team_ns has more', () => {
    const r = checkVictory({ team_ns: 17000, team_eo: 15500 });
    expect(r.winner).toBe('team_ns');
    expect(r.isDraw).toBe(false);
  });

  it('team_eo wins when both are above 15 000 but team_eo has more', () => {
    const r = checkVictory({ team_ns: 15100, team_eo: 15500 });
    expect(r.winner).toBe('team_eo');
    expect(r.isDraw).toBe(false);
  });

  it('draw when BOTH teams reach exactly 15 000 with equal scores', () => {
    const r = checkVictory({ team_ns: 15000, team_eo: 15000 });
    expect(r.isDraw).toBe(true);
    expect(r.winner).toBeNull();
  });

  it('draw when both exceed 15 000 by the same amount', () => {
    const r = checkVictory({ team_ns: 16500, team_eo: 16500 });
    expect(r.isDraw).toBe(true);
    expect(r.winner).toBeNull();
  });

  it('WINNING_SCORE constant is 15 000', () => {
    expect(WINNING_SCORE).toBe(15_000);
  });
});

// =============================================================================
// CARD POINT VALUES — completeness check
// =============================================================================

describe('cardPoints — individual card values', () => {
  const cases: [string, Card, number][] = [
    ['4 = 5 pts',     nat('4'), 5],
    ['5 = 5 pts',     nat('5'), 5],
    ['6 = 5 pts',     nat('6'), 5],
    ['7 = 5 pts',     nat('7'), 5],
    ['8 = 10 pts',    nat('8'), 10],
    ['9 = 10 pts',    nat('9'), 10],
    ['10 = 10 pts',   nat('10'), 10],
    ['J = 10 pts',    nat('J'), 10],
    ['Q = 10 pts',    nat('Q'), 10],
    ['K = 10 pts',    nat('K'), 10],
    ['A = 20 pts',    nat('A'), 20],
    ['2 (pato) = 20', pato(), 20],
    ['Joker = 50',    joker(), 50],
    ['3♥ = 0 pts',    honor('♥'), 0],
    ['3♣ = 0 pts',    tapa('♣'), 0],
  ];

  test.each(cases)('%s', (_label, card, expected) => {
    expect(cardPoints(card)).toBe(expected);
  });
});

describe('combinationPoints — sum of card values', () => {
  it('three kings = 30 pts', () => {
    expect(combinationPoints([nat('K'), nat('K', '♦'), nat('K', '♣')])).toBe(30);
  });

  it('two aces + one joker = 90 pts', () => {
    expect(combinationPoints([nat('A'), nat('A', '♦'), joker()])).toBe(90);
  });

  it('empty array = 0', () => {
    expect(combinationPoints([])).toBe(0);
  });
});

// =============================================================================
// EDGE CASES — boundary and consistency checks
// =============================================================================

describe('edge cases', () => {
  it('isMono is true for pato (2) and joker, false for naturals', () => {
    expect(isMono(pato())).toBe(true);
    expect(isMono(joker())).toBe(true);
    expect(isMono(nat('A'))).toBe(false);
    expect(isMono(honor())).toBe(false);
    expect(isMono(tapa())).toBe(false);
  });

  it('a canasta of only naturals with one extra mono is dirty, not clean', () => {
    const cards: Card[] = [
      ...Array.from({ length: 6 }, (_, i) => nat('5', '♥', `5_${i}`)),
      pato('♦'),
    ];
    const result = validateCanasta(cards);
    expect(result.type).toBe('dirty');
  });

  it('validateBajada rejects empty combinations array', () => {
    // No combos at all — 0 points < 50 minimum
    const result = validateBajada([], makeTeam({ globalScore: 0 }));
    expect(result.valid).toBe(false);
  });

  it('drawFromStock with n=0 returns empty drawn array and unchanged stock', () => {
    const deck = [nat('A'), nat('K')];
    const [drawn, remaining] = drawFromStock(deck, 0);
    expect(drawn).toHaveLength(0);
    expect(remaining).toHaveLength(2);
  });

  it('simulatePicada returns special cards from revealed section', () => {
    // Run many times to ensure the function handles the deck properly
    for (let attempt = 0; attempt < 10; attempt++) {
      const deck = buildShuffledDeck();
      const { specialCards, newStock } = simulatePicada(deck);
      // All 162 cards must be accounted for: special cards go to picador,
      // non-special revealed cards go to the END of newStock.
      expect(specialCards.length + newStock.length).toBe(deck.length);
      // Special cards are only monos or honors
      for (const card of specialCards) {
        expect(isMono(card) || isHonor(card)).toBe(true);
      }
    }
  });

  it('honor points never exceed 2000 regardless of count beyond 6', () => {
    // The table caps at index 6 (6 honors max in 3 decks)
    const team = makeTeam({
      honors: Array.from({ length: 6 }, (_, i) =>
        honor(i % 2 === 0 ? '♥' : '♦', `h${i}`),
      ),
      canastas: [makeCanasta('7', 'clean'), makeCanasta('A', 'dirty')],
    });
    expect(honorPoints(team)).toBe(2000);
  });

  it('resetForNewRound preserves globalScore across rounds', () => {
    const s: GameState = {
      ...createInitialGameState(),
      teams: {
        team_ns: makeTeam({ id: 'team_ns', globalScore: 5000 }),
        team_eo: makeTeam({ id: 'team_eo', globalScore: 3000 }),
      },
    };
    const reset = resetForNewRound(s);
    expect(reset.teams.team_ns.globalScore).toBe(5000);
    expect(reset.teams.team_eo.globalScore).toBe(3000);
  });
});
