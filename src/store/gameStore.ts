// =============================================================================
// CANASTÓN — Game Store (Zustand)
// Bridges the pure engine with React Native UI.
// All game-logic decisions go through the engine — store never validates moves.
// =============================================================================

import { create } from 'zustand';

import type {
  ActionResult,
  ActionErr,
  Card,
  GameStateData,
  Meld,
  Canasta,
  Player,
  PlayerId,
  Team,
  TeamId,
  TurnPhase,
  PilonState,
  RoundScore,
} from '../../engine/types';

import {
  createGame,
  addPlayer as engineAddPlayer,
  startSetup,
  startSorteo,
  resolveSorteo,
  executePicada,
  executeReparto,
  executeInicioRonda,
  beginNewRound as engineBeginNewRound,
  beginTurn,
  forceLayHonors,
  drawFromStock as engineDrawFromStock,
  takePilon as engineTakePilon,
  layMeld as engineLayMeld,
  cancelBajada as engineCancelBajada,
  commitBajada as engineCommitBajada,
  addToMeld as engineAddToMeld,
  addToCanasta as engineAddToCanasta,
  discard as engineDiscard,
  finalizeRound as engineFinalizeRound,
  getBajadaMinimum,
} from '../../engine';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface GameStore {
  game: GameStateData | null;
  /** Is the active player's hand currently visible on screen? */
  handVisible: boolean;
  /** Show "pass the device" modal between turns */
  passDeviceVisible: boolean;
  /** Last engine error message, cleared by clearError() */
  lastError: string | null;
  /**
   * Honors (red 3s) the current player just received from the stock or pilon
   * and must acknowledge before continuing their turn.
   */
  pendingHonors: Card[];

  // ── Initialization ───────────────────────────────────────────────────────
  createNewGame: (names: [string, string, string, string]) => void;

  // ── Turn actions — all delegate validation to the engine ─────────────────
  playerDrawFromStock: () => ActionResult<{ drawn: Card[] }>;
  playerTakePilon: (matchCardIds: string[], additionalMeldGroups?: string[][]) => ActionResult<{ pilonCards: Card[] }>;
  playerLayMeld: (cardIds: string[], isBajadaInitial?: boolean) => ActionResult<{ meld: Meld; isBajada: boolean; pointsLaid: number }>;
  playerCommitBajada: () => ActionResult<{ totalPoints: number; minimum: number }>;
  playerCancelBajada: () => ActionResult<{ cardsReturned: Card[] }>;
  playerAddToMeld: (meldId: string, cardIds: string[]) => ActionResult<{ meld: Meld; closed: boolean; canasta?: Canasta }>;
  playerAddToCanasta: (canastaId: string, cardIds: string[]) => ActionResult<{ canasta: Canasta }>;
  playerDiscard: (cardId: string) => ActionResult<{ discardedCard: Card; pilonState: PilonState; roundEnded: boolean }>;
  /** Player acknowledges their pending honors: lays them on the table and draws replacements. */
  acknowledgePendingHonors: () => void;

  // ── Round / game lifecycle ────────────────────────────────────────────────
  playerFinalizeRound: () => ActionResult<{ gameOver: boolean; winner: TeamId | 'DRAW' | null }>;
  playerBeginNewRound: () => void;

  // ── UI state ──────────────────────────────────────────────────────────────
  showHand: () => void;
  hideHand: () => void;
  acknowledgePassDevice: () => void;
  clearError: () => void;
  resetGame: () => void;

  // ── Derived helpers ───────────────────────────────────────────────────────
  getCurrentPlayer: () => Player | null;
  getCurrentTeam: () => Team | null;
  getTeam: (teamId: TeamId) => Team | null;
  getPlayerTeam: (playerId: PlayerId) => Team | null;
  getBajadaMinForCurrentTeam: () => number;
  getPilonTopCard: () => Card | null;
  getPilonMatchesNeeded: () => number;
  getStockCount: () => number;
  getTurnPhase: () => TurnPhase | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function forceRerender(game: GameStateData) {
  return { ...game };
}

function autoLayHonors(game: GameStateData) {
  if (!game.round || !game.turn) return;
  const player = game.players[game.turn.playerId];
  const hasHonors = player.hand.some((c) => c.category === 'HONOR');
  if (hasHonors) {
    forceLayHonors(game, game.turn.playerId);
  }
}

/**
 * Returns any honors (red 3s) currently in the active player's hand.
 * Used after drawing/taking pilon to detect honors that need to be
 * acknowledged by the player before they continue.
 */
function collectPendingHonors(game: GameStateData): Card[] {
  if (!game.turn) return [];
  const player = game.players[game.turn.playerId];
  return player?.hand.filter((c) => c.category === 'HONOR') ?? [];
}

function noGameErr<T = never>(): ActionResult<T> {
  const err: ActionErr = {
    ok: false,
    error: { code: 'NO_GAME', message: 'No hay partida activa.' },
  };
  return err;
}

function noTurnErr<T = never>(): ActionResult<T> {
  const err: ActionErr = {
    ok: false,
    error: { code: 'NO_TURN', message: 'No hay turno activo.' },
  };
  return err;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  handVisible: false,
  passDeviceVisible: false,
  lastError: null,
  pendingHonors: [],

  // ── Initialization ───────────────────────────────────────────────────────

  createNewGame(names) {
    const game = createGame(`game_${Date.now()}`);

    // Add 4 players
    const playerIds: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
    for (let i = 0; i < 4; i++) {
      const r = engineAddPlayer(game, playerIds[i], names[i]);
      if (!r.ok) {
        set({ lastError: r.error.message });
        return;
      }
    }

    // startSetup
    const r1 = startSetup(game);
    if (!r1.ok) { set({ lastError: r1.error.message }); return; }

    // startSorteo
    const r2 = startSorteo(game);
    if (!r2.ok) { set({ lastError: r2.error.message }); return; }

    // resolveSorteo → sets teams + turn order
    const r3 = resolveSorteo(game);
    if (!r3.ok) { set({ lastError: r3.error.message }); return; }
    const { turnOrder, picadorId, repartidorId } = r3.data;

    // executePicada
    const r4 = executePicada(game, turnOrder, picadorId, repartidorId);
    if (!r4.ok) { set({ lastError: r4.error.message }); return; }

    // executeReparto
    const r5 = executeReparto(game);
    if (!r5.ok) { set({ lastError: r5.error.message }); return; }

    // executeInicioRonda
    const r6 = executeInicioRonda(game);
    if (!r6.ok) { set({ lastError: r6.error.message }); return; }

    // beginTurn for first player
    const r7 = beginTurn(game);
    if (!r7.ok) { set({ lastError: r7.error.message }); return; }

    // Auto-lay any honors in first player's hand
    autoLayHonors(game);

    set({
      game: forceRerender(game),
      handVisible: false,
      passDeviceVisible: true, // show "pass device" to first player
      lastError: null,
    });
  },

  // ── Turn actions ─────────────────────────────────────────────────────────

  playerDrawFromStock() {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineDrawFromStock(game, game.turn.playerId);
    if (result.ok) {
      // Surface any honors received so the player must acknowledge them.
      const honors = collectPendingHonors(game);
      set({ game: forceRerender(game), pendingHonors: honors });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerTakePilon(matchCardIds, additionalMeldGroups = []) {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineTakePilon(game, game.turn.playerId, matchCardIds, additionalMeldGroups);
    if (result.ok) {
      // Surface any honors found in the pilon cards.
      const honors = collectPendingHonors(game);
      set({ game: forceRerender(game), pendingHonors: honors });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  acknowledgePendingHonors() {
    const game = get().game;
    if (!game?.turn) return;
    forceLayHonors(game, game.turn.playerId);
    set({ game: forceRerender(game), pendingHonors: [] });
  },

  playerLayMeld(cardIds, isBajadaInitial = false) {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineLayMeld(game, game.turn.playerId, { cardIds, isBajadaInitial });
    if (result.ok) {
      set({ game: forceRerender(game) });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerCommitBajada() {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineCommitBajada(game, game.turn.playerId);
    if (result.ok) {
      set({ game: forceRerender(game) });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerCancelBajada() {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineCancelBajada(game, game.turn.playerId);
    if (result.ok) {
      set({ game: forceRerender(game) });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerAddToMeld(meldId, cardIds) {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineAddToMeld(game, game.turn.playerId, meldId, cardIds);
    if (result.ok) {
      set({ game: forceRerender(game) });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerAddToCanasta(canastaId, cardIds) {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const result = engineAddToCanasta(game, game.turn.playerId, canastaId, cardIds);
    if (result.ok) {
      set({ game: forceRerender(game) });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerDiscard(cardId) {
    const game = get().game;
    if (!game) return noGameErr();
    if (!game.turn) return noTurnErr();

    const playerId = game.turn.playerId;
    const result = engineDiscard(game, playerId, cardId);

    if (result.ok) {
      if (result.data.roundEnded) {
        // Round ended — navigation handled by screen
        set({ game: forceRerender(game), handVisible: false });
      } else {
        // Start next player's turn
        const br = beginTurn(game);
        if (br.ok) {
          autoLayHonors(game);
        }
        set({
          game: forceRerender(game),
          handVisible: false,
          passDeviceVisible: true, // ask to pass device
        });
      }
    } else {
      set({ lastError: result.error.message });
    }

    return result;
  },

  // ── Round / game lifecycle ────────────────────────────────────────────────

  playerFinalizeRound() {
    const game = get().game;
    if (!game) return noGameErr();

    const result = engineFinalizeRound(game);
    if (result.ok) {
      set({ game: forceRerender(game) });
    } else {
      set({ lastError: result.error.message });
    }
    return result;
  },

  playerBeginNewRound() {
    const game = get().game;
    if (!game || !game.round) return;

    // Save turn order + compute new picador BEFORE clearing round
    const prevRound = game.round;
    const prevOrder = prevRound.turnOrder;
    const newPicIdx = (prevRound.picadorIndex + 1) % 4;
    const newTurnOrder = [
      ...prevOrder.slice(newPicIdx),
      ...prevOrder.slice(0, newPicIdx),
    ];
    const newPicadorId = newTurnOrder[0];
    const newRepartidorId = newTurnOrder[1];

    // Engine transitions to PICADA_INICIAL, clears round
    const r1 = engineBeginNewRound(game);
    if (!r1.ok) { set({ lastError: r1.error.message }); return; }

    // Re-run setup pipeline with new picador
    const r2 = executePicada(game, newTurnOrder, newPicadorId, newRepartidorId);
    if (!r2.ok) { set({ lastError: r2.error.message }); return; }

    const r3 = executeReparto(game);
    if (!r3.ok) { set({ lastError: r3.error.message }); return; }

    const r4 = executeInicioRonda(game);
    if (!r4.ok) { set({ lastError: r4.error.message }); return; }

    const r5 = beginTurn(game);
    if (!r5.ok) { set({ lastError: r5.error.message }); return; }

    autoLayHonors(game);

    set({
      game: forceRerender(game),
      handVisible: false,
      passDeviceVisible: true,
      lastError: null,
    });
  },

  // ── UI state ──────────────────────────────────────────────────────────────

  showHand() { set({ handVisible: true }); },
  hideHand()  { set({ handVisible: false }); },
  acknowledgePassDevice() { set({ passDeviceVisible: false }); },
  clearError() { set({ lastError: null }); },
  resetGame()  { set({ game: null, handVisible: false, passDeviceVisible: false, lastError: null, pendingHonors: [] }); },

  // ── Derived helpers ───────────────────────────────────────────────────────

  getCurrentPlayer() {
    const { game } = get();
    if (!game?.turn) return null;
    return game.players[game.turn.playerId] ?? null;
  },

  getCurrentTeam() {
    const { game } = get();
    if (!game?.turn) return null;
    const teamId = game.playerTeam[game.turn.playerId];
    return teamId ? (game.teams[teamId] ?? null) : null;
  },

  getTeam(teamId) {
    return get().game?.teams[teamId] ?? null;
  },

  getPlayerTeam(playerId) {
    const { game } = get();
    if (!game) return null;
    const teamId = game.playerTeam[playerId];
    return teamId ? (game.teams[teamId] ?? null) : null;
  },

  getBajadaMinForCurrentTeam() {
    const team = get().getCurrentTeam();
    return team ? getBajadaMinimum(team.globalScore) : 50;
  },

  getPilonTopCard() {
    const pilon = get().game?.round?.pilon;
    if (!pilon || pilon.length === 0) return null;
    return pilon[pilon.length - 1];
  },

  getPilonMatchesNeeded() {
    const { game } = get();
    if (!game?.round) return 2;
    const topCard = game.round.pilon.length > 0
      ? game.round.pilon[game.round.pilon.length - 1]
      : null;
    if (topCard && game.turn) {
      const teamId = game.playerTeam[game.turn.playerId];
      const team   = teamId ? game.teams[teamId] : null;
      if (team?.table.canastas.some((c) => c.rank === topCard.rank && c.closed)) {
        return 0; // free take — team has a closed canasta of this rank
      }
    }
    return game.round.pilonState === 'TRIADO' ? 3 : 2;
  },

  getStockCount() {
    return get().game?.round?.stock?.length ?? 0;
  },

  getTurnPhase() {
    return get().game?.turn?.phase ?? null;
  },
}));
