// =============================================================================
// CANASTÓN — Game State Machine
// Enforces valid phase transitions and guards illegal actions.
// =============================================================================

import {
  GameState,
  GamePhase,
  PHASE_TRANSITIONS,
  ActionResult,
} from './types';

/** Attempt a phase transition. Returns error if transition is not in PHASE_TRANSITIONS. */
export function transitionTo(
  state: GameState,
  nextPhase: GamePhase,
): ActionResult {
  const allowed = PHASE_TRANSITIONS[state.phase];
  if (!allowed.includes(nextPhase)) {
    return {
      ok: false,
      error: `Transición inválida: ${state.phase} → ${nextPhase}. Permitidas: ${allowed.join(', ')}.`,
    };
  }
  return { ok: true, state: { ...state, phase: nextPhase } };
}

/** Assert that the game is in one of the expected phases. */
export function assertPhase(
  state: GameState,
  ...expectedPhases: GamePhase[]
): ActionResult {
  if (!expectedPhases.includes(state.phase)) {
    return {
      ok: false,
      error: `Acción no válida en fase ${state.phase}. Se esperaba: ${expectedPhases.join(' | ')}.`,
    };
  }
  return { ok: true, state };
}

/** Build a fresh initial GameState (before any players join) */
export function createInitialGameState(): GameState {
  return {
    phase: 'LOBBY',
    round: 0,
    players: {},
    teams: {
      team_ns: {
        id: 'team_ns',
        playerIds: ['' as any, '' as any],
        tableCards: [],
        canastas: [],
        honors: [],
        hasBajado: false,
        globalScore: 0,
      },
      team_eo: {
        id: 'team_eo',
        playerIds: ['' as any, '' as any],
        tableCards: [],
        canastas: [],
        honors: [],
        hasBajado: false,
        globalScore: 0,
      },
    },
    stock: [],
    pilon: { cards: [], state: 'empty' },
    currentPlayerId: null,
    dealerPlayerId: null,
    picadorPlayerId: null,
    roundHistory: [],
    winner: null,
    isDraw: false,
  };
}

/** Reset per-round fields (teams' bajada flag, canastas, etc.) for a new round. */
export function resetForNewRound(state: GameState): GameState {
  const teams = { ...state.teams };
  for (const key of Object.keys(teams) as Array<keyof typeof teams>) {
    teams[key] = {
      ...teams[key],
      tableCards: [],
      canastas: [],
      honors: [],
      hasBajado: false,
    };
  }
  const players = { ...state.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], hand: [] };
  }
  return {
    ...state,
    teams,
    players,
    stock: [],
    pilon: { cards: [], state: 'empty' },
    round: state.round + 1,
  };
}
