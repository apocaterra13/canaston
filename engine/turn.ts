// =============================================================================
// CANASTON ENGINE — turn.ts
// Normal turn flow: draw, take pilon, play melds/canastas, discard, ida.
// Also handles: discard pile rules, meld rules, canasta rules, honors, ida.
// =============================================================================

import type {
  ActionResult,
  Canasta,
  CanastaType,
  Card,
  GameStateData,
  Meld,
  PlayerId,
  Rank,
  TeamId,
} from "./types";
import {
  drawCards,
  isMono,
  isHonor,
  isTapa,
  sumCardPoints,
  canastaBaseScore,
  getBajadaMinimum,
  sortHand,
} from "./deck";
import {
  ok,
  err,
  requireState,
  requireCurrentPlayer,
  requireTurnPhase,
  requireCardsInHand,
  validateMeld,
  validateAddToMeld,
  isCanastaCloseable,
  countMono,
  canIr,
} from "./validation";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _meldCounter = 0;
let _canastaCounter = 0;

function newMeldId()    { return `meld_${++_meldCounter}`; }
function newCanaId()    { return `cana_${++_canastaCounter}`; }

function removeCardsFromHand(hand: Card[], cardIds: string[]): Card[] {
  const idSet = new Set(cardIds);
  const removed: Card[] = [];
  const newHand: Card[] = [];
  for (const c of hand) {
    if (idSet.has(c.id)) {
      removed.push(c);
      idSet.delete(c.id);
    } else {
      newHand.push(c);
    }
  }
  return newHand; // mutate externally
}

function removeCardsFromHandMutate(player: import("./types").Player, cardIds: string[]): Card[] {
  const idSet = new Set(cardIds);
  const removed: Card[] = [];
  const kept: Card[]    = [];
  for (const c of player.hand) {
    if (idSet.has(c.id)) {
      removed.push(c);
      idSet.delete(c.id);
    } else {
      kept.push(c);
    }
  }
  player.hand = kept;
  return removed;
}

function getTeamForPlayer(game: GameStateData, pid: PlayerId): { teamId: TeamId; team: import("./types").Team } {
  const teamId = game.playerTeam[pid];
  return { teamId, team: game.teams[teamId] };
}

// ---------------------------------------------------------------------------
// START TURN — called automatically to initialise turn context
// ---------------------------------------------------------------------------

export function beginTurn(game: GameStateData): ActionResult<void> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const round = game.round!;
  const pid   = round.turnOrder[round.currentTurnIndex];

  game.turn = {
    playerId: pid,
    phase: "WAITING_DRAW",
    drawnCards: [],
    tookPilon: false,
    pilonMatchCards: [],
    bajadaMeldIds: [],
  };

  // If player has honors in hand, they MUST lay them immediately (section 11.2)
  // We expose a helper; the action loop should call forceLayHonors.
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// HONORS — force-lay (section 11.2)
// ---------------------------------------------------------------------------

export function forceLayHonors(
  game: GameStateData,
  playerId: PlayerId,
): ActionResult<{ laidHonors: Card[]; drawnReplacements: Card[] }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const player = game.players[playerId];
  const honors  = player.hand.filter((c) => isHonor(c));
  if (honors.length === 0) return ok({ laidHonors: [], drawnReplacements: [] });

  const round    = game.round!;
  const { team } = getTeamForPlayer(game, playerId);
  const replaced: Card[] = [];

  for (const honor of honors) {
    // Remove from hand
    player.hand = player.hand.filter((c) => c.id !== honor.id);
    // Lay on team's honor pile
    team.table.honors.push(honor);
    // Draw 1 replacement
    if (round.stock.length > 0) {
      const [rep] = drawCards(round.stock, 1);
      player.hand.push(rep);
      replaced.push(rep);
    }
  }
  player.hand = sortHand(player.hand);

  return ok({ laidHonors: honors, drawnReplacements: replaced });
}

// ---------------------------------------------------------------------------
// DRAW FROM STOCK (section 7.1 option 1)
// ---------------------------------------------------------------------------

export function drawFromStock(
  game: GameStateData,
  playerId: PlayerId,
): ActionResult<{ drawn: [Card, Card] }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "WAITING_DRAW");
  if (!phaseCheck.ok) return phaseCheck;

  const round = game.round!;

  if (round.stock.length < 2) {
    // Section 15.1: stock exhausted
    if (round.stock.length === 0) {
      return err("STOCK_EXHAUSTED", "The stock is empty. Round ends with no winner.");
    }
    // Only 1 card left — draw it and signal
    const [last] = drawCards(round.stock, 1);
    game.players[playerId].hand.push(last);
    game.players[playerId].hand = sortHand(game.players[playerId].hand);
    game.turn!.drawnCards = [last];
    game.turn!.phase      = "DRAWN_FROM_STOCK";
    return ok({ drawn: [last, last] }); // degenerate case
  }

  const drawn = drawCards(round.stock, 2) as [Card, Card];
  game.players[playerId].hand.push(...drawn);
  game.players[playerId].hand = sortHand(game.players[playerId].hand);
  game.turn!.drawnCards = drawn;
  game.turn!.phase      = "DRAWN_FROM_STOCK";

  return ok({ drawn });
}

// ---------------------------------------------------------------------------
// TAKE PILON (section 8)
// ---------------------------------------------------------------------------

export function takePilon(
  game: GameStateData,
  playerId: PlayerId,
  matchCardIds: string[], // cards from hand to match the top of pilon
): ActionResult<{ pilonCards: Card[] }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "WAITING_DRAW");
  if (!phaseCheck.ok) return phaseCheck;

  const round = game.round!;

  // Pilon must not be empty
  if (round.pilon.length === 0) {
    return err("PILON_EMPTY", "The discard pile is empty.");
  }

  // Tapa check (section 8.3)
  if (round.tapaActive) {
    return err("PILON_TAPA", "The discard pile is blocked by a tapa (3 negro). You must draw from stock.");
  }

  const topCard = round.pilon[round.pilon.length - 1];

  // Triado check (section 8.2)
  const requiredCount = round.pilonState === "TRIADO" ? 3 : 2;

  if (matchCardIds.length !== requiredCount) {
    return err(
      "PILON_WRONG_MATCH_COUNT",
      `Pilon is ${round.pilonState === "TRIADO" ? "triado (need 3)" : "normal (need 2)"}. ` +
        `Provided ${matchCardIds.length} cards.`,
      { required: requiredCount, provided: matchCardIds.length },
    );
  }

  // Validate match cards are in hand
  const handCheck = requireCardsInHand(game, playerId, matchCardIds);
  if (!handCheck.ok) return handCheck;

  const matchCards = handCheck.data;

  // All match cards must equal the top card's rank
  for (const mc of matchCards) {
    if (mc.rank !== topCard.rank) {
      return err(
        "PILON_RANK_MISMATCH",
        `Match card ${mc.id} has rank ${mc.rank} but pilon top is rank ${topCard.rank}.`,
      );
    }
  }

  // Take the entire pilon
  const pilonCards = [...round.pilon];
  round.pilon      = [];
  round.pilonState = "EMPTY";
  round.tapaActive = false;

  // Remove match cards from hand
  const player = game.players[playerId];
  removeCardsFromHandMutate(player, matchCardIds);

  // Add all pilon cards to hand (sorted)
  player.hand.push(...pilonCards);
  player.hand = sortHand(player.hand);

  // Update turn context
  const ctx        = game.turn!;
  ctx.tookPilon    = true;
  ctx.pilonMatchCards = matchCards;
  ctx.drawnCards   = pilonCards;
  ctx.phase        = "TOOK_PILON";

  return ok({ pilonCards });
}

// ---------------------------------------------------------------------------
// LAY DOWN MELD (new combination on table) — section 9
// ---------------------------------------------------------------------------

export interface LayMeldOptions {
  cardIds: string[];
  isBajadaInitial?: boolean; // caller explicitly flags this as the first bajada
}

export function layMeld(
  game: GameStateData,
  playerId: PlayerId,
  opts: LayMeldOptions,
): ActionResult<{ meld: Meld; isBajada: boolean; pointsLaid: number }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "DRAWN_FROM_STOCK", "TOOK_PILON");
  if (!phaseCheck.ok) return phaseCheck;

  const handCheck = requireCardsInHand(game, playerId, opts.cardIds);
  if (!handCheck.ok) return handCheck;

  const cards = handCheck.data;

  // Validate the combination
  const meldCheck = validateMeld(cards);
  if (!meldCheck.ok) return meldCheck;

  const { rank, wildCount } = meldCheck.data;
  const { team }            = getTeamForPlayer(game, playerId);

  // Mono-obligado guard (section 9.3)
  if (team.monoObligado) {
    const existingMonoMeld = team.table.melds.find((m) => m.rank === "2" || m.rank === "JOKER");
    const existingMonoCana = team.table.canastas.find(
      (c) => (c.rank === "2" || c.rank === "JOKER") && !c.closed,
    );
    // If mono obligado is active, wilds cannot be used in other melds
    if (wildCount > 0 && rank !== "2" && rank !== "JOKER") {
      return err(
        "MONO_OBLIGADO",
        "Mono obligado is active. Wilds cannot be used in other combinations until the mono canasta is closed.",
      );
    }
  }

  // Bajada logic (section 9.1)
  const isBajada = !team.hasBajado;
  if (isBajada) {
    // The cards used to take the pilon do NOT count toward bajada total
    const pilonMatchIds = new Set((game.turn!.pilonMatchCards ?? []).map((c) => c.id));
    const countableCards = cards.filter((c) => !pilonMatchIds.has(c.id));
    const points         = sumCardPoints(countableCards);

    // We don't enforce bajada minimum here; the caller should batch multiple melds
    // and call validateBajadaBatch. But if opts.isBajadaInitial is true we check.
    if (opts.isBajadaInitial) {
      // Caller asserts this is the completing bajada action
      // validate minimum will be done after all melds are compiled
    }
  } else {
    // Team already has bajada — free to play
  }

  // Remove cards from hand
  removeCardsFromHandMutate(game.players[playerId], opts.cardIds);

  // Create meld
  const meld: Meld = {
    id:    newMeldId(),
    rank,
    cards: [...cards],
  };

  team.table.melds.push(meld);

  // Track this meld for bajada counting (only before team has bajado).
  if (isBajada) {
    game.turn!.bajadaMeldIds.push(meld.id);
  }

  // Activate mono-obligado if rank is 2/JOKER (section 9.3)
  if (rank === "2" || rank === "JOKER") {
    team.monoObligado = true;
  }

  const pointsLaid = sumCardPoints(cards);
  return ok({ meld, isBajada, pointsLaid });
}

// ---------------------------------------------------------------------------
// COMMIT BAJADA — validate the minimum after all melds are played this turn
// ---------------------------------------------------------------------------

export function commitBajada(
  game: GameStateData,
  playerId: PlayerId,
): ActionResult<{ totalPoints: number; minimum: number }> {
  const { team }  = getTeamForPlayer(game, playerId);
  if (team.hasBajado) {
    return err("ALREADY_BAJADO", "Team has already made their initial bajada this round.");
  }

  const minimum = getBajadaMinimum(team.globalScore);

  // Only count melds laid by THIS player in THIS turn (bajadaMeldIds).
  // This prevents partner melds from previous turns from inflating the total.
  const ctx           = game.turn!;
  const bajadaMeldSet = new Set(ctx.bajadaMeldIds);
  const pilonMatchIds = new Set((ctx.pilonMatchCards ?? []).map((c) => c.id));

  let total = 0;
  for (const meld of team.table.melds) {
    if (!bajadaMeldSet.has(meld.id)) continue;
    for (const c of meld.cards) {
      if (!pilonMatchIds.has(c.id)) total += c.points;
    }
  }

  if (total < minimum) {
    return err(
      "BAJADA_MINIMUM_NOT_MET",
      `Team needs ${minimum} points for bajada but only has ${total}.`,
      { total, minimum },
    );
  }

  team.hasBajado = true;
  return ok({ totalPoints: total, minimum });
}

// ---------------------------------------------------------------------------
// ADD CARDS TO EXISTING MELD (extend before canasta closure)
// ---------------------------------------------------------------------------

export function addToMeld(
  game: GameStateData,
  playerId: PlayerId,
  meldId: string,
  cardIds: string[],
): ActionResult<{ meld: Meld; closed: boolean; canasta?: Canasta }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "DRAWN_FROM_STOCK", "TOOK_PILON");
  if (!phaseCheck.ok) return phaseCheck;

  const handCheck = requireCardsInHand(game, playerId, cardIds);
  if (!handCheck.ok) return handCheck;

  const newCards  = handCheck.data;
  const { team }  = getTeamForPlayer(game, playerId);

  // Team must have bajada to add to melds
  if (!team.hasBajado) {
    return err("NO_BAJADA", "Team must make their bajada before adding to melds.");
  }

  const meld = team.table.melds.find((m) => m.id === meldId);
  if (!meld) {
    return err("MELD_NOT_FOUND", `Meld ${meldId} not found on team table.`);
  }

  const addCheck = validateAddToMeld(meld, newCards);
  if (!addCheck.ok) return addCheck;

  // Mono-obligado guard
  if (team.monoObligado) {
    const addingWilds = newCards.filter((c) => isMono(c)).length;
    if (addingWilds > 0 && meld.rank !== "2" && meld.rank !== "JOKER") {
      return err("MONO_OBLIGADO", "Cannot add wilds while mono obligado is active.");
    }
  }

  removeCardsFromHandMutate(game.players[playerId], cardIds);
  meld.cards.push(...newCards);

  // Check if meld has become a canasta
  if (isCanastaCloseable(meld.cards)) {
    const wilds    = countMono(meld.cards);
    const type: CanastaType =
      meld.rank === "2" || meld.rank === "JOKER"
        ? "MONO"
        : wilds === 0 ? "LIMPIA" : "SUCIA";

    const canasta: Canasta = {
      id:      newCanaId(),
      rank:    meld.rank,
      cards:   [...meld.cards],
      type,
      closed:  true,
      burned:  [],
    };

    team.table.canastas.push(canasta);
    team.table.melds = team.table.melds.filter((m) => m.id !== meldId);

    // Resolve mono-obligado
    if (type === "MONO") {
      team.monoObligado = false;
    }

    return ok({ meld, closed: true, canasta });
  }

  return ok({ meld, closed: false });
}

// ---------------------------------------------------------------------------
// ADD CARDS TO EXISTING CANASTA
// ---------------------------------------------------------------------------

export function addToCanasta(
  game: GameStateData,
  playerId: PlayerId,
  canastaId: string,
  cardIds: string[],
): ActionResult<{ canasta: Canasta }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "DRAWN_FROM_STOCK", "TOOK_PILON");
  if (!phaseCheck.ok) return phaseCheck;

  const handCheck = requireCardsInHand(game, playerId, cardIds);
  if (!handCheck.ok) return handCheck;

  const newCards = handCheck.data;
  const { team } = getTeamForPlayer(game, playerId);

  if (!team.hasBajado) {
    return err("NO_BAJADA", "Team must make their bajada before modifying canastas.");
  }

  const canasta = team.table.canastas.find((c) => c.id === canastaId);
  if (!canasta) {
    return err("CANASTA_NOT_FOUND", `Canasta ${canastaId} not found.`);
  }

  const addCheck = validateAddToMeld(canasta, newCards);
  if (!addCheck.ok) return addCheck;

  // Mono-obligado guard
  if (team.monoObligado) {
    const addingWilds = newCards.filter((c) => isMono(c)).length;
    if (addingWilds > 0 && canasta.rank !== "2" && canasta.rank !== "JOKER") {
      return err("MONO_OBLIGADO", "Cannot add wilds while mono obligado is active.");
    }
  }

  removeCardsFromHandMutate(game.players[playerId], cardIds);

  if (canasta.closed) {
    // Burning extra cards (section 10.5)
    canasta.burned.push(...newCards);
  } else {
    canasta.cards.push(...newCards);
    // Close if reached 7
    if (isCanastaCloseable(canasta.cards)) {
      canasta.closed = true;
      const wilds    = countMono(canasta.cards);
      canasta.type   =
        canasta.rank === "2" || canasta.rank === "JOKER"
          ? "MONO"
          : wilds === 0 ? "LIMPIA" : "SUCIA";
      if (canasta.type === "MONO") {
        team.monoObligado = false;
      }
    }
  }

  return ok({ canasta });
}

// ---------------------------------------------------------------------------
// DISCARD (ends turn) — section 7.2
// ---------------------------------------------------------------------------

export function discard(
  game: GameStateData,
  playerId: PlayerId,
  cardId: string,
): ActionResult<{ discardedCard: Card; pilonState: import("./types").PilonState; roundEnded: boolean }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "DRAWN_FROM_STOCK", "TOOK_PILON");
  if (!phaseCheck.ok) return phaseCheck;

  const handCheck = requireCardsInHand(game, playerId, [cardId]);
  if (!handCheck.ok) return handCheck;

  const [card] = handCheck.data;
  const player  = game.players[playerId];
  const round   = game.round!;
  const { team } = getTeamForPlayer(game, playerId);

  // If the player laid bajada melds this turn they must commit before discarding.
  if (!team.hasBajado && game.turn!.bajadaMeldIds.length > 0) {
    return err(
      "BAJADA_NOT_COMMITTED",
      "You have laid melds but have not committed your bajada yet. Call commitBajada first.",
    );
  }

  // Attempt ida if player's hand will be empty after discard
  const handAfterDiscard = player.hand.filter((c) => c.id !== cardId);
  let roundEnded = false;

  if (handAfterDiscard.length === 0 || handAfterDiscard.every((c) => isTapa(c))) {
    // Player MIGHT be going out
    const idaCheck = canIr(game, playerId, card);
    if (idaCheck.ok) {
      // Valid ida!
      removeCardsFromHandMutate(player, [cardId]);
      round.pilon.push(card);
      round.idaPlayerId = playerId;
      game.state        = "CIERRE_RONDA";
      roundEnded        = true;

      // Update pilon state (though round is over)
      round.pilonState = isMono(card) ? "TRIADO" : card.category === "TAPA" ? "TAPA" : "NORMAL";

      return ok({ discardedCard: card, pilonState: round.pilonState, roundEnded: true });
    }
    // Ida conditions not met — if hand is genuinely empty, player is stuck (edge case)
  }

  // Regular discard
  removeCardsFromHandMutate(player, [cardId]);
  round.pilon.push(card);

  // Update pilon state (section 8)
  if (isMono(card)) {
    round.pilonState = "TRIADO";
    round.tapaActive = false;
  } else if (isTapa(card)) {
    round.pilonState = "TAPA";
    round.tapaActive = true;
  } else {
    round.pilonState = "NORMAL";
    round.tapaActive = false;
  }

  // Advance turn
  round.currentTurnIndex = (round.currentTurnIndex + 1) % 4;

  // Reset turn context
  game.turn = null;

  // Check stock exhaustion (section 15.1)
  if (round.stock.length === 0) {
    // If the NEXT player cannot take the pilon either, end the round
    // We let the game proceed to the next turn and handle there
  }

  return ok({ discardedCard: card, pilonState: round.pilonState, roundEnded: false });
}

// ---------------------------------------------------------------------------
// BURN EXTRA CARDS onto a closed canasta (section 10.5)
// ---------------------------------------------------------------------------

export function burnCards(
  game: GameStateData,
  playerId: PlayerId,
  canastaId: string,
  cardIds: string[],
): ActionResult<{ canasta: Canasta }> {
  // Delegate to addToCanasta; it already handles burning
  return addToCanasta(game, playerId, canastaId, cardIds);
}
