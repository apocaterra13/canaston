// =============================================================================
// CANASTÓN — Core Domain Types
// Source of truth: readme.md (game rules specification)
// Engine is intentionally pure: no React, no UI, no side effects.
// =============================================================================

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type Suit = '♥' | '♦' | '♣' | '♠';

/** Natural card ranks (no wildcards) */
export type NaturalRank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

/** 2s (patos) act as wildcards (monos) */
export type PatoRank = '2';

/** Jokers also act as wildcards (monos) */
export type JokerRank = 'JOKER';

export type CardRank = NaturalRank | PatoRank | JokerRank;

export interface NaturalCard {
  id: string;         // unique ID across all 162 cards, e.g. "7♥_1"
  rank: NaturalRank;
  suit: Suit;
  kind: 'natural';
}

export interface PatoCard {
  id: string;
  rank: PatoRank;
  suit: Suit;
  kind: 'pato';       // 2 — acts as mono (wildcard)
}

export interface JokerCard {
  id: string;
  rank: JokerRank;
  suit: null;
  kind: 'joker';      // Joker — acts as mono (wildcard)
}

export type Card = NaturalCard | PatoCard | JokerCard;

/** Red 3s (♥ or ♦) are Honors — special scoring cards */
export function isHonor(card: Card): card is NaturalCard {
  return card.kind === 'natural' && card.rank === '3' && (card.suit === '♥' || card.suit === '♦');
}

/** Black 3s (♣ or ♠) are Tapas — block the discard pile */
export function isTapa(card: Card): card is NaturalCard {
  return card.kind === 'natural' && card.rank === '3' && (card.suit === '♣' || card.suit === '♠');
}

/** Monos = 2s (patos) or Jokers — wildcards */
export function isMono(card: Card): card is PatoCard | JokerCard {
  return card.kind === 'pato' || card.kind === 'joker';
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Individual card point values (section 2.1 of readme) */
export const CARD_POINTS: Record<string, number> = {
  '4': 5, '5': 5, '6': 5, '7': 5,
  '8': 10, '9': 10, '10': 10, 'J': 10, 'Q': 10, 'K': 10,
  'A': 20, '2': 20,
  'JOKER': 50,
  // 3 rojo/negro — 0 individual points (scored differently)
  '3': 0,
};

/** Canasta base values (section 10.3) */
export const CANASTA_BASE_POINTS = {
  lowCards: { clean: 500, dirty: 300 },    // 4–K
  aces:     { clean: 1000, dirty: 500 },
  twos:     { clean: 3000, dirty: 2000 },
  jokers:   { clean: 4000, dirty: 2000 },
};

/** Minimum points required for first bajada (section 9.1) */
export const BAJADA_MINIMUMS: Array<{ upTo: number; min: number }> = [
  { upTo: 2999, min: 50 },
  { upTo: 4999, min: 90 },
  { upTo: 7999, min: 120 },
  { upTo: 9999, min: 160 },
  { upTo: 11999, min: 180 },
  { upTo: 14999, min: 200 },
];

export const WINNING_SCORE = 15_000;

// ---------------------------------------------------------------------------
// Canastas (section 10)
// ---------------------------------------------------------------------------

export type CanastaType = 'clean' | 'dirty';

export interface Canasta {
  id: string;
  cards: Card[];       // always exactly 7 when closed; can have extras (burned)
  type: CanastaType;
  closed: boolean;     // true once 7 cards are in
  rank: NaturalRank | PatoRank | JokerRank;  // value all cards share
}

// ---------------------------------------------------------------------------
// Discard Pile (Pilón)
// ---------------------------------------------------------------------------

export type PilonState =
  | 'normal'   // anyone can take with 2 matching cards
  | 'triado'   // mono on top — needs 3 matching cards
  | 'tapa'     // black 3 on top — next player cannot take
  | 'empty';   // no cards

export interface Pilon {
  cards: Card[];
  state: PilonState;
}

// ---------------------------------------------------------------------------
// Players & Teams
// ---------------------------------------------------------------------------

export type PlayerId = string;
export type TeamId = 'team_ns' | 'team_eo';   // Norte-Sur vs Este-Oeste

export type PlayerPosition = 'north' | 'south' | 'east' | 'west';

export interface Player {
  id: PlayerId;
  name: string;
  position: PlayerPosition;
  teamId: TeamId;
  hand: Card[];
}

export interface Team {
  id: TeamId;
  playerIds: [PlayerId, PlayerId];
  tableCards: Card[];       // loose cards on table (not yet in canasta)
  canastas: Canasta[];
  honors: Card[];           // red 3s placed on table
  hasBajado: boolean;       // whether team made its first bajada this round
  globalScore: number;      // accumulated score across all rounds
}

// ---------------------------------------------------------------------------
// Game State Machine (section 4)
// ---------------------------------------------------------------------------

export type GamePhase =
  | 'LOBBY'
  | 'SETUP'
  | 'SORTEO_EQUIPOS'
  | 'PICADA_INICIAL'
  | 'REPARTO_INICIAL'
  | 'INICIO_RONDA'
  | 'TURNO_NORMAL'
  | 'RESOLUCION_PILON'
  | 'BAJADA'
  | 'JUEGO_EN_MESA'
  | 'CIERRE_RONDA'
  | 'CONTEO_FINAL'
  | 'NUEVA_RONDA'
  | 'FIN_PARTIDA';

/** Legal transitions from each phase (section 4.3) */
export const PHASE_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  LOBBY:             ['SETUP'],
  SETUP:             ['SORTEO_EQUIPOS'],
  SORTEO_EQUIPOS:    ['PICADA_INICIAL'],
  PICADA_INICIAL:    ['REPARTO_INICIAL'],
  REPARTO_INICIAL:   ['INICIO_RONDA'],
  INICIO_RONDA:      ['TURNO_NORMAL'],
  TURNO_NORMAL:      ['RESOLUCION_PILON'],
  RESOLUCION_PILON:  ['BAJADA', 'JUEGO_EN_MESA', 'TURNO_NORMAL'],
  BAJADA:            ['JUEGO_EN_MESA'],
  JUEGO_EN_MESA:     ['CIERRE_RONDA'],
  CIERRE_RONDA:      ['CONTEO_FINAL'],
  CONTEO_FINAL:      ['NUEVA_RONDA', 'FIN_PARTIDA'],
  NUEVA_RONDA:       ['PICADA_INICIAL'],
  FIN_PARTIDA:       ['LOBBY'],   // allow restart
};

// ---------------------------------------------------------------------------
// Player Actions
// ---------------------------------------------------------------------------

export type PlayerAction =
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'TAKE_PILON'; matchCards: Card[] }
  | { type: 'PLAY_COMBINATION'; cards: Card[] }
  | { type: 'ADD_TO_CANASTA'; canastaId: string; cards: Card[] }
  | { type: 'DISCARD'; card: Card }
  | { type: 'PLACE_HONOR'; card: Card };

// ---------------------------------------------------------------------------
// Round result
// ---------------------------------------------------------------------------

export interface RoundScoreBreakdown {
  teamId: TeamId;
  canastaBase: number;
  canastaCardPoints: number;
  honorPoints: number;
  idaBonus: number;
  losingHandPenalty: number;   // cards in hand of team that did NOT go out (negative)
  winnerHandBonus: number;     // black 3s in hand of player who went out
  total: number;
}

// ---------------------------------------------------------------------------
// Full Game State
// ---------------------------------------------------------------------------

export interface GameState {
  phase: GamePhase;
  round: number;
  players: Record<PlayerId, Player>;
  teams: Record<TeamId, Team>;
  stock: Card[];              // face-down draw pile
  pilon: Pilon;               // discard pile
  currentPlayerId: PlayerId | null;
  dealerPlayerId: PlayerId | null;
  picadorPlayerId: PlayerId | null;   // player who "pica" at round start
  roundHistory: RoundScoreBreakdown[];
  winner: TeamId | null;
  isDraw: boolean;
}

// ---------------------------------------------------------------------------
// Action Result (returned by engine functions)
// ---------------------------------------------------------------------------

export type ActionResult<T = GameState> =
  | { ok: true; state: T }
  | { ok: false; error: string };
