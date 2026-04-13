// =============================================================================
// CANASTON ENGINE — setup.ts
// Covers LOBBY → SETUP → SORTEO_EQUIPOS → PICADA_INICIAL → REPARTO_INICIAL
// =============================================================================

import type {
  ActionResult,
  GameStateData,
  Player,
  PlayerId,
  RoundState,
  Team,
  TeamId,
} from "./types";
import { buildFullDeck, drawCards, isMono, isHonor, rankValue, shuffle, sortHand } from "./deck";
import { err, ok, requireState } from "./validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyTable() {
  return { melds: [], canastas: [], honors: [] };
}

function makeTeam(id: TeamId, name: string, p1: PlayerId, p2: PlayerId): Team {
  return {
    id,
    name,
    playerIds: [p1, p2],
    globalScore: 0,
    hasBajado: false,
    monoObligado: false,
    table: makeEmptyTable(),
  };
}

// ---------------------------------------------------------------------------
// 1. Create a new game (LOBBY)
// ---------------------------------------------------------------------------

export function createGame(gameId: string): GameStateData {
  return {
    gameId,
    state: "LOBBY",
    players: {},
    seatOrder: [],
    teams: {} as GameStateData["teams"],
    playerTeam: {},
    round: null,
    turn: null,
    scoreHistory: [],
    winner: null,
  };
}

// ---------------------------------------------------------------------------
// 2. Add players (LOBBY only, up to 4)
// ---------------------------------------------------------------------------

export function addPlayer(
  game: GameStateData,
  playerId: PlayerId,
  name: string,
): ActionResult<void> {
  const stateCheck = requireState(game, "LOBBY");
  if (!stateCheck.ok) return stateCheck;

  if (Object.keys(game.players).length >= 4) {
    return err("LOBBY_FULL", "Cannot add more than 4 players.");
  }
  if (game.players[playerId]) {
    return err("PLAYER_EXISTS", `Player ${playerId} already joined.`);
  }

  game.players[playerId] = { id: playerId, name, hand: [], sorteoCard: null };
  game.seatOrder.push(playerId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// 3. Advance to SETUP (auto-transitions when 4 players are seated)
// ---------------------------------------------------------------------------

export function startSetup(game: GameStateData): ActionResult<void> {
  const stateCheck = requireState(game, "LOBBY");
  if (!stateCheck.ok) return stateCheck;

  if (game.seatOrder.length !== 4) {
    return err("NOT_ENOUGH_PLAYERS", "Need exactly 4 players to start setup.");
  }

  game.state = "SETUP";
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// 4. SORTEO_EQUIPOS — each player draws a card; highest two pair up
// ---------------------------------------------------------------------------

export function startSorteo(
  game: GameStateData,
  rng: () => number = Math.random,
): ActionResult<void> {
  const stateCheck = requireState(game, "SETUP");
  if (!stateCheck.ok) return stateCheck;

  game.state = "SORTEO_EQUIPOS";

  const tempDeck = shuffle(buildFullDeck(), rng);

  // Each player draws until they get a card that is NOT a mono (2/Joker) —
  // section 5.2: "Si un jugador roba un joker o un 2, debe volver a robar."
  for (const pid of game.seatOrder) {
    let card = tempDeck.pop()!;
    while (isMono(card)) {
      tempDeck.unshift(card); // return it
      card = tempDeck.pop()!;
    }
    game.players[pid].sorteoCard = card;
  }

  return ok(undefined);
}

// ---------------------------------------------------------------------------
// 5. Resolve sorteo: form teams and determine turn order
// ---------------------------------------------------------------------------

interface SorteoResolution {
  teamNS: [PlayerId, PlayerId];
  teamEW: [PlayerId, PlayerId];
  turnOrder: PlayerId[];   // [picador, p2, p3, p4] in play order
  picadorId: PlayerId;
  repartidorId: PlayerId;
}

export function resolveSorteo(
  game: GameStateData,
  rng: () => number = Math.random,
): ActionResult<SorteoResolution> {
  const stateCheck = requireState(game, "SORTEO_EQUIPOS");
  if (!stateCheck.ok) return stateCheck;

  const players = game.seatOrder.map((pid) => ({
    pid,
    card: game.players[pid].sorteoCard!,
  }));

  // Sort descending by rank value
  players.sort((a, b) => rankValue(b.card.rank) - rankValue(a.card.rank));

  // Tie-break for the top slot (section 5.2)
  // If the top two have the same rank, they re-draw
  let redraws = 0;
  while (players[0].card.rank === players[1].card.rank) {
    if (redraws++ > 10) return err("SORTEO_INFINITE_TIE", "Sorteo tie could not be resolved.");

    const tempDeck = shuffle(buildFullDeck(), rng);
    for (const p of [players[0], players[1]]) {
      let card = tempDeck.pop()!;
      while (isMono(card)) {
        tempDeck.unshift(card);
        card = tempDeck.pop()!;
      }
      game.players[p.pid].sorteoCard = card;
      p.card = card;
    }
    // Re-sort just the top two
    if (rankValue(players[1].card.rank) > rankValue(players[0].card.rank)) {
      [players[0], players[1]] = [players[1], players[0]];
    }
  }

  // Top 2 scores → TEAM_NS; bottom 2 → TEAM_EW
  const [first, second, third, fourth] = players;
  const teamNS: [PlayerId, PlayerId] = [first.pid, second.pid];
  const teamEW: [PlayerId, PlayerId] = [third.pid, fourth.pid];

  const picadorId    = first.pid;
  const picadorSeat  = game.seatOrder.indexOf(picadorId);
  const repartidorId = game.seatOrder[(picadorSeat + 1) % 4]; // left of picador

  // Build a turn order that strictly alternates teams: A, B, A, B.
  // Starting from the picador, the next player must be from the opposing team,
  // then the picador's partner, then the remaining opponent.
  // We determine which opponent comes first by their physical seat position
  // (the one sitting immediately left of the picador around the table).
  const picadorTeam    = teamNS.includes(picadorId as PlayerId) ? teamNS : teamEW;
  const partner        = picadorTeam.find(p => p !== picadorId)!;
  const opponents      = [third.pid, fourth.pid]; // guaranteed the opposing team

  // Of the two opponents, pick the one sitting next (left) in seatOrder after the picador.
  const nextSeat       = game.seatOrder[(picadorSeat + 1) % 4];
  const firstOpponent  = opponents.includes(nextSeat) ? nextSeat : opponents.find(p => p !== nextSeat)!;
  const secondOpponent = opponents.find(p => p !== firstOpponent)!;

  const turnOrder: PlayerId[] = [picadorId, firstOpponent, partner, secondOpponent];

  // Persist teams
  game.teams["TEAM_NS"] = makeTeam("TEAM_NS", "Norte-Sur", teamNS[0], teamNS[1]);
  game.teams["TEAM_EW"] = makeTeam("TEAM_EW", "Este-Oeste", teamEW[0], teamEW[1]);

  for (const pid of teamNS) game.playerTeam[pid] = "TEAM_NS";
  for (const pid of teamEW) game.playerTeam[pid] = "TEAM_EW";

  game.state = "PICADA_INICIAL";

  const resolution: SorteoResolution = {
    teamNS,
    teamEW,
    turnOrder,
    picadorId,
    repartidorId,
  };

  return ok(resolution);
}

// ---------------------------------------------------------------------------
// 6. PICADA_INICIAL — picador "cuts" the deck; keep specials
// ---------------------------------------------------------------------------

export interface PicadaResult {
  pickedCards: ReadonlyArray<{
    card: import("./types").Card;
    wasSpecial: boolean;
  }>;
  keptByPicador: ReadonlyArray<import("./types").Card>;
}

export function executePicada(
  game: GameStateData,
  turnOrder: PlayerId[],
  picadorId: PlayerId,
  repartidorId: PlayerId,
  rng: () => number = Math.random,
): ActionResult<PicadaResult> {
  const stateCheck = requireState(game, "PICADA_INICIAL");
  if (!stateCheck.ok) return stateCheck;

  const fullDeck = shuffle(buildFullDeck(), rng);

  // Simulate cutting: choose a random cut point leaving at least 3 cards at top
  const cutMin  = 3;
  const cutMax  = fullDeck.length - 3;
  const cutAt   = Math.floor(rng() * (cutMax - cutMin + 1)) + cutMin;

  // The 3 cards from the top of the bottom half (section 6.1)
  const topThree = fullDeck.slice(cutAt, cutAt + 3);
  const rest     = [
    ...fullDeck.slice(0, cutAt),
    ...fullDeck.slice(cutAt + 3),
  ];

  const picadaDetails = topThree.map((card) => ({
    card,
    wasSpecial: isMono(card) || isHonor(card),
  }));

  const specials = topThree.filter((c) => isMono(c) || isHonor(c));

  let stock: Card[];
  let keptByPicador: Card[];

  if (specials.length > 0) {
    // Picador keeps special cards; remaining topThree become bottom of stock
    keptByPicador = specials;
    const normalTopThree = topThree.filter((c) => !isMono(c) && !isHonor(c));
    stock = [...normalTopThree, ...rest];
  } else {
    // No specials: all 3 cards go back under the deck
    keptByPicador = [];
    stock = [...topThree, ...rest];
  }

  // Initialise the round state
  const picadorSeatIdx  = turnOrder.indexOf(picadorId);
  const repartidorIdx   = turnOrder.indexOf(repartidorId);

  game.round = {
    roundNumber: (game.scoreHistory.length + 1),
    turnOrder,
    currentTurnIndex: 0, // will be set to picador after deal
    picadorIndex: picadorSeatIdx,
    repartidorIndex: repartidorIdx,
    stock,
    pilon: [],
    pilonState: "EMPTY",
    tapaActive: false,
    idaPlayerId: null,
    picadaSpecialCards: [...keptByPicador],
  };

  // Give special cards to picador (sorted)
  if (keptByPicador.length > 0) {
    game.players[picadorId].hand.push(...keptByPicador);
    game.players[picadorId].hand = sortHand(game.players[picadorId].hand);
  }

  game.state = "REPARTO_INICIAL";

  return ok({ pickedCards: picadaDetails, keptByPicador });
}

// ---------------------------------------------------------------------------
// 7. REPARTO_INICIAL — repartidor deals 15 cards to each player
// ---------------------------------------------------------------------------

export function executeReparto(game: GameStateData): ActionResult<void> {
  const stateCheck = requireState(game, "REPARTO_INICIAL");
  if (!stateCheck.ok) return stateCheck;

  const round = game.round!;
  const { turnOrder, picadorIndex, stock } = round;

  // Adjust target counts: picador may already hold special cards
  const targetPerPlayer = 15;

  // Deal starting from picador, 3 cards at a time, until all have 15
  const needs: Record<PlayerId, number> = {};
  for (const pid of turnOrder) {
    const alreadyHas = game.players[pid].hand.length;
    needs[pid]       = Math.max(0, targetPerPlayer - alreadyHas);
  }

  // Deal in batches of 3 starting from picador until everyone is satisfied
  let remaining = turnOrder.map((pid) => needs[pid]).reduce((a, b) => a + b, 0);
  const startIdx = picadorIndex;

  while (remaining > 0) {
    let i = startIdx;
    do {
      const pid  = turnOrder[i];
      const give = Math.min(3, needs[pid]);
      if (give > 0) {
        if (stock.length < give) {
          return err("DECK_EXHAUSTED", "Not enough cards in deck to complete the deal.");
        }
        const dealt = drawCards(stock, give);
        game.players[pid].hand.push(...dealt);
        game.players[pid].hand = sortHand(game.players[pid].hand);
        needs[pid] -= give;
        remaining -= give;
      }
      i = (i + 1) % 4;
    } while (i !== startIdx);
  }

  // Validate all players have exactly 15 cards
  for (const pid of turnOrder) {
    if (game.players[pid].hand.length !== 15) {
      return err(
        "DEAL_COUNT_MISMATCH",
        `Player ${pid} has ${game.players[pid].hand.length} cards, expected 15.`,
      );
    }
  }

  game.state = "INICIO_RONDA";
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// 8. INICIO_RONDA — repartidor flips card and creates initial pilon
// ---------------------------------------------------------------------------

export interface InicioRondaResult {
  flippedCard: import("./types").Card;
  cardsBuriedUnderPilon: number;
}

export function executeInicioRonda(game: GameStateData): ActionResult<InicioRondaResult> {
  const stateCheck = requireState(game, "INICIO_RONDA");
  if (!stateCheck.ok) return stateCheck;

  const round = game.round!;
  const { stock, turnOrder, repartidorIndex } = round;

  if (stock.length === 0) {
    return err("DECK_EXHAUSTED", "No cards left in stock to flip.");
  }

  // Flip one card
  let flippedCard = drawCards(stock, 1)[0];
  let buried = 0;

  // Section 6.3: handle the flipped card
  const resolved = resolveRepartidorCard(flippedCard, stock);
  buried         = resolved.buried;

  // Set pilon with the resolved top card (the flipped card stays on top)
  round.pilon      = [flippedCard];
  round.pilonState = "NORMAL";

  if (isMono(flippedCard)) {
    round.pilonState = "TRIADO";
  }
  if (flippedCard.category === "TAPA") {
    round.pilonState = "TAPA";
    round.tapaActive = true;
  }

  // Reset teams for new round
  for (const team of Object.values(game.teams)) {
    team.hasBajado    = false;
    team.monoObligado = false;
    team.table        = makeEmptyTable();
  }

  // Clear hands for honores tracking
  for (const pid of turnOrder) {
    // hands already dealt; don't clear — just ensure honors are flagged later
  }

  // Advance to first turn (picador plays first)
  round.currentTurnIndex = round.picadorIndex;
  game.state             = "TURNO_NORMAL";

  return ok({ flippedCard, cardsBuriedUnderPilon: buried });
}

// ---------------------------------------------------------------------------
// Helper: resolve repartidor card (section 6.3)
// ---------------------------------------------------------------------------

function resolveRepartidorCard(
  card: import("./types").Card,
  stock: import("./types").Card[],
): { buried: number } {
  const rank = card.rank;
  let buried = 0;

  if (isHonor(card)) {
    // 3 rojo → keep flipping until non-honor (recursive-ish)
    // For simplicity, consume as many cards from stock as needed
    // and bury them, but track the final non-honor card
    // The spec says "voltear la siguiente carta y repetir"
    // We bury the chain and place the final card on pilon
    // (implementation: bury until non-3-red found)
    while (stock.length > 0) {
      const next = drawCards(stock, 1)[0];
      buried++;
      if (!isHonor(next)) break;
    }
    return { buried };
  }

  // Numeric / face cards: bury that many cards face-down
  const buryCounts: Record<string, number> = {
    "4": 4,  "5": 5,  "6": 6,  "7": 7,
    "8": 8,  "9": 9,  "10": 10,
    "J": 11, "Q": 12, "K": 13, "A": 14,
    "2": 20, "JOKER": 25,
    "3": 0,  // shouldn't hit here (handled above)
  };

  buried = buryCounts[rank] ?? 0;
  // Actually bury that many cards (draw from stock and discard conceptually)
  const toBury = Math.min(buried, stock.length);
  drawCards(stock, toBury); // remove from stock; they are simply face-down under pilon
  buried = toBury;

  return { buried };
}

// ---------------------------------------------------------------------------
// Reset round state for a new round
// ---------------------------------------------------------------------------

export function beginNewRound(
  game: GameStateData,
  rng: () => number = Math.random,
): ActionResult<void> {
  const stateCheck = requireState(game, "NUEVA_RONDA");
  if (!stateCheck.ok) return stateCheck;

  // Rotate picador (next player after previous picador becomes new picador)
  // The repartidor of the previous round becomes the new picador
  const prevRound   = game.round!;
  const prevOrder   = prevRound.turnOrder;
  const newPicIdx   = (prevRound.picadorIndex + 1) % 4;
  const newTurnOrder = [
    ...prevOrder.slice(newPicIdx),
    ...prevOrder.slice(0, newPicIdx),
  ];

  // Clear player hands
  for (const pid of Object.values(game.players)) {
    pid.hand = [];
    pid.sorteoCard = null;
  }

  game.state = "PICADA_INICIAL";

  // Reset round to null; executePicada will reinitialize it
  game.round = null;

  return ok(undefined);
}

// Re-export Card type alias for convenience
import type { Card } from "./types";
