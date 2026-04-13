// =============================================================================
// CANASTON ENGINE — types.ts
// Pure domain types. No UI, no network, no React.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. CARD & DECK TYPES
// ---------------------------------------------------------------------------

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "JOKER";

/** Structural category of a card, used for game-logic branching. */
export type CardCategory =
  | "JOKER"    // Joker wildcard (mono)
  | "HONOR"    // 3 red  (3♥ / 3♦)
  | "TAPA"     // 3 black (3♣ / 3♠)
  | "PATO"     // 2 of any suit (mono)
  | "NORMAL";  // every other card

export interface Card {
  readonly id: string;          // unique across all 162 cards, e.g. "deck1_7_hearts"
  readonly rank: Rank;
  readonly suit: Suit | null;   // null for jokers
  readonly category: CardCategory;
  /** Face-value point worth. Honours/tapas have 0 here (special handling). */
  readonly points: number;
  /** Index of the physical deck this card came from (0, 1 or 2). */
  readonly deckIndex: 0 | 1 | 2;
}

// ---------------------------------------------------------------------------
// 2. GAME STATE ENUM
// ---------------------------------------------------------------------------

export type GameState =
  | "LOBBY"
  | "SETUP"
  | "SORTEO_EQUIPOS"
  | "PICADA_INICIAL"
  | "REPARTO_INICIAL"
  | "INICIO_RONDA"
  | "TURNO_NORMAL"
  | "RESOLUCION_PILON"
  | "BAJADA"
  | "JUEGO_EN_MESA"
  | "CIERRE_RONDA"
  | "CONTEO_FINAL"
  | "NUEVA_RONDA"
  | "FIN_PARTIDA";

// ---------------------------------------------------------------------------
// 3. DISCARD PILE STATE
// ---------------------------------------------------------------------------

export type PilonState =
  | "EMPTY"   // no cards yet
  | "NORMAL"  // top card is a regular card
  | "TRIADO"  // top card is a mono (2 or Joker) — needs 3 matching cards
  | "TAPA";   // top card is a 3-negro — next player MUST draw from stock

// ---------------------------------------------------------------------------
// 4. CANASTA (BASKET) TYPES
// ---------------------------------------------------------------------------

export type CanastaType = "LIMPIA" | "SUCIA" | "MONO";

export interface Canasta {
  readonly id: string;
  /** Rank this canasta is built around (e.g. "7" or "A" or "2" or "JOKER"). */
  readonly rank: Rank;
  cards: Card[];
  type: CanastaType;
  /** True once the canasta has reached exactly 7 cards (closed). */
  closed: boolean;
  /** Extra cards burned on top after closing. */
  burned: Card[];
}

// ---------------------------------------------------------------------------
// 5. MELD (in-progress combination on the table, before canasta)
// ---------------------------------------------------------------------------

export interface Meld {
  readonly id: string;
  readonly rank: Rank;
  cards: Card[];
}

// ---------------------------------------------------------------------------
// 6. TEAM TABLE STATE
// ---------------------------------------------------------------------------

export interface TeamTable {
  melds: Meld[];       // open combinations not yet closed into a canasta
  canastas: Canasta[]; // closed canastas (>=7 cards)
  honors: Card[];      // 3-reds laid on the table during the round
}

// ---------------------------------------------------------------------------
// 7. PLAYER
// ---------------------------------------------------------------------------

export type PlayerId = string;

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  hand: Card[];
  /** Card drawn during SORTEO_EQUIPOS to determine teams. */
  sorteoCard: Card | null;
}

// ---------------------------------------------------------------------------
// 8. TEAM
// ---------------------------------------------------------------------------

export type TeamId = "TEAM_NS" | "TEAM_EW";

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  /** Player IDs in seat order (index 0 = Norte/Este, index 1 = Sur/Oeste). */
  readonly playerIds: [PlayerId, PlayerId];
  /** Cumulative score across all rounds. */
  globalScore: number;
  /** Has this team completed their bajada initial in the current round? */
  hasBajado: boolean;
  /** Is there a mono-obligado active? (canasta de monos started but not closed) */
  monoObligado: boolean;
  table: TeamTable;
}

// ---------------------------------------------------------------------------
// 9. ROUND STATE
// ---------------------------------------------------------------------------

export interface RoundState {
  roundNumber: number;
  /** Ordered player-turn sequence (length 4). */
  turnOrder: PlayerId[];
  /** Index into turnOrder of the current player. */
  currentTurnIndex: number;
  /** Index into turnOrder of the initial player (quien picó). */
  picadorIndex: number;
  /** Index into turnOrder of the repartidor (left of picador). */
  repartidorIndex: number;

  stock: Card[];       // face-down draw pile
  pilon: Card[];       // discard pile (last element = top card)
  pilonState: PilonState;
  tapaActive: boolean; // true when 3-negro is on top and next turn is blocked

  /** Player who triggered ida (end of round). */
  idaPlayerId: PlayerId | null;

  /** Cards drawn from stock during PICADA_INICIAL that went to the picador's hand. */
  picadaSpecialCards: Card[];
}

// ---------------------------------------------------------------------------
// 10. TURN CONTEXT
// ---------------------------------------------------------------------------

export type TurnPhase =
  | "WAITING_DRAW"      // player hasn't acted yet (must draw stock or take pile)
  | "DRAWN_FROM_STOCK"  // drew 2 cards, can now play melds / must discard
  | "TOOK_PILON"        // took the pile, can now play melds / must discard
  | "MUST_DISCARD";     // must discard exactly 1 card to end turn

export interface TurnContext {
  playerId: PlayerId;
  phase: TurnPhase;
  /** Cards drawn this turn (either from stock or pile). */
  drawnCards: Card[];
  /** True if the player took from pilon (relevant for bajada counting). */
  tookPilon: boolean;
  /** Cards the player used to take the pilon (excluded from bajada calc). */
  pilonMatchCards: Card[];
  /**
   * IDs of melds laid this turn while the team had not yet bajado.
   * commitBajada counts only these melds, preventing multi-turn accumulation
   * or cross-player contributions from inflating the bajada total.
   */
  bajadaMeldIds: string[];
}

// ---------------------------------------------------------------------------
// 11. ACTION RESULT
// ---------------------------------------------------------------------------

export interface ActionOk<T = void> {
  ok: true;
  data: T;
}

export interface ActionErr {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ActionResult<T = void> = ActionOk<T> | ActionErr;

// ---------------------------------------------------------------------------
// 12. FULL GAME STATE
// ---------------------------------------------------------------------------

export interface GameStateData {
  readonly gameId: string;
  state: GameState;
  players: Record<PlayerId, Player>;
  /** Ordered seat positions [0..3]. */
  seatOrder: PlayerId[];
  teams: Record<TeamId, Team>;
  /** Which team each player belongs to. */
  playerTeam: Record<PlayerId, TeamId>;
  round: RoundState | null;
  turn: TurnContext | null;
  /** Full scoring history per round. */
  scoreHistory: RoundScore[];
  /** Winner team id, set when state = FIN_PARTIDA. */
  winner: TeamId | "DRAW" | null;
}

// ---------------------------------------------------------------------------
// 13. ROUND SCORE BREAKDOWN
// ---------------------------------------------------------------------------

export interface TeamRoundScore {
  teamId: TeamId;
  canastaBasePoints: number;
  canastaCardPoints: number;
  honorPoints: number;
  idaBonus: number;
  tableLooseCardPoints: number;  // sueltas en mesa (positive or 0)
  handPenalty: number;           // remaining cards in hand (negative)
  idaPlayerHandBonus: number;    // tres negros held by player who went out (+5 each)
  total: number;
}

export interface RoundScore {
  roundNumber: number;
  scores: Record<TeamId, TeamRoundScore>;
  globalAfter: Record<TeamId, number>;
}

// ---------------------------------------------------------------------------
// 14. MINIMUM BAJADA TABLE
// ---------------------------------------------------------------------------

export const BAJADA_MINIMUMS: Array<{ upTo: number; minimum: number }> = [
  { upTo: 2999,  minimum: 50  },
  { upTo: 4999,  minimum: 90  },
  { upTo: 7999,  minimum: 120 },
  { upTo: 9999,  minimum: 160 },
  { upTo: 11999, minimum: 180 },
  { upTo: 14999, minimum: 200 },
];

export const WIN_THRESHOLD = 15_000;
