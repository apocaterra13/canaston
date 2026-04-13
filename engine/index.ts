// =============================================================================
// CANASTON ENGINE — index.ts
// Public API surface. Import from here only.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  ActionErr,
  ActionOk,
  ActionResult,
  Canasta,
  CanastaType,
  Card,
  CardCategory,
  GameState,
  GameStateData,
  Meld,
  PilonState,
  Player,
  PlayerId,
  Rank,
  RoundScore,
  RoundState,
  Suit,
  Team,
  TeamId,
  TeamRoundScore,
  TeamTable,
  TurnContext,
  TurnPhase,
} from "./types";

export { BAJADA_MINIMUMS, WIN_THRESHOLD } from "./types";

// ---------------------------------------------------------------------------
// Deck / card utilities
// ---------------------------------------------------------------------------

export {
  buildFullDeck,
  canastaBaseScore,
  drawCards,
  getBajadaMinimum,
  isMono,
  isHonor,
  isTapa,
  isWild,
  RANK_POINTS,
  rankValue,
  shuffle,
  sumCardPoints,
} from "./deck";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export {
  canIr,
  canastaEffectiveType,
  countMono,
  err,
  isCleanCanasta,
  isCanastaCloseable,
  isSuciCanasta,
  ok,
  requireCardsInHand,
  requireCurrentPlayer,
  requireState,
  requireTurnPhase,
  validateAddToMeld,
  validateMeld,
} from "./validation";

// ---------------------------------------------------------------------------
// Setup & round start
// ---------------------------------------------------------------------------

export {
  addPlayer,
  beginNewRound,
  createGame,
  executeInicioRonda,
  executePicada,
  executeReparto,
  resolveSorteo,
  startSetup,
  startSorteo,
} from "./setup";

export type { InicioRondaResult, PicadaResult } from "./setup";

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export {
  addToCanasta,
  addToMeld,
  beginTurn,
  burnCards,
  commitBajada,
  discard,
  drawFromStock,
  forceLayHonors,
  layMeld,
  takePilon,
} from "./turn";

export type { LayMeldOptions } from "./turn";

// ---------------------------------------------------------------------------
// Scoring & end of game
// ---------------------------------------------------------------------------

export {
  checkEndOfGame,
  computeRoundScore,
  finalizeRound,
  handleStockExhausted,
} from "./scoring";

export type { EndOfGameResult } from "./scoring";

// ---------------------------------------------------------------------------
// State transition guard
// ---------------------------------------------------------------------------

import type { GameState } from "./types";

const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  LOBBY:             ["SETUP"],
  SETUP:             ["SORTEO_EQUIPOS"],
  SORTEO_EQUIPOS:    ["PICADA_INICIAL"],
  PICADA_INICIAL:    ["REPARTO_INICIAL"],
  REPARTO_INICIAL:   ["INICIO_RONDA"],
  INICIO_RONDA:      ["TURNO_NORMAL"],
  TURNO_NORMAL:      ["RESOLUCION_PILON", "CIERRE_RONDA"],
  RESOLUCION_PILON:  ["BAJADA", "JUEGO_EN_MESA", "TURNO_NORMAL"],
  BAJADA:            ["JUEGO_EN_MESA"],
  JUEGO_EN_MESA:     ["CIERRE_RONDA"],
  CIERRE_RONDA:      ["CONTEO_FINAL"],
  CONTEO_FINAL:      ["NUEVA_RONDA", "FIN_PARTIDA"],
  NUEVA_RONDA:       ["PICADA_INICIAL"],
  FIN_PARTIDA:       ["LOBBY"],
};

export function isValidTransition(from: GameState, to: GameState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export { VALID_TRANSITIONS };

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** Deep-clone the full game state to a JSON-safe object. */
export function serializeGame(game: import("./types").GameStateData): string {
  return JSON.stringify(game);
}

/** Restore game state from a JSON string. */
export function deserializeGame(json: string): import("./types").GameStateData {
  const data = JSON.parse(json) as import("./types").GameStateData;
  // Basic integrity check
  if (!data.gameId || !data.state) {
    throw new Error("INVALID_SERIALIZED_STATE: missing gameId or state");
  }
  return data;
}
