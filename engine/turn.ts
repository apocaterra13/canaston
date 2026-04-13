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
  /**
   * When the team has not yet bajado, the player MUST provide enough
   * additional melds (from their hand) so that the auto-meld + these
   * extra melds together meet the bajada point minimum.
   * Each element is a group of card IDs that forms one valid meld.
   * Ignored (and may be empty) when the team already has bajado.
   */
  additionalMeldGroups: string[][] = [],
): ActionResult<{ pilonCards: Card[]; autoMeld: Meld; additionalMelds: Meld[] }> {
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

  const player   = game.players[playerId];
  const { team } = getTeamForPlayer(game, playerId);

  // ---------------------------------------------------------------------------
  // Bajada validation (section 9.1) — only when team has not yet bajado.
  // The player must declare upfront which additional cards they will meld so
  // that the total (auto-meld + additional melds) meets the bajada minimum.
  // ---------------------------------------------------------------------------
  const validatedAdditional: Array<{ cards: Card[]; rank: Rank }> = [];

  if (!team.hasBajado) {
    const minimum = getBajadaMinimum(team.globalScore);

    // Collect and validate each additional meld group.
    // All card IDs that have already been claimed (match cards + previous groups).
    const claimedIds = new Set<string>(matchCardIds);

    for (let i = 0; i < additionalMeldGroups.length; i++) {
      const group = additionalMeldGroups[i];

      // No duplicates across groups or with match cards.
      for (const id of group) {
        if (claimedIds.has(id)) {
          return err(
            "PILON_BAJADA_DUPLICATE_CARD",
            `Card ${id} appears in more than one meld group.`,
          );
        }
        claimedIds.add(id);
      }

      // Cards must be in hand.
      const groupCheck = requireCardsInHand(game, playerId, group);
      if (!groupCheck.ok) return groupCheck;

      // Group must form a valid meld.
      const meldCheck = validateMeld(groupCheck.data);
      if (!meldCheck.ok) {
        return err(
          "PILON_BAJADA_INVALID_MELD",
          `Additional meld group ${i + 1}: ${meldCheck.error.message}`,
        );
      }

      validatedAdditional.push({ cards: groupCheck.data, rank: meldCheck.data.rank });
    }

    // Check points from additional melds only.
    // The match cards (and topCard) are the "entry fee" to take the pilon —
    // they do NOT count toward the bajada point minimum.
    const additionalPoints = validatedAdditional.reduce(
      (sum, m) => sum + sumCardPoints(m.cards), 0,
    );

    if (additionalPoints < minimum) {
      return err(
        "PILON_BAJADA_MINIMUM_NOT_MET",
        `Taking the pilon requires at least ${minimum} points in additional melds ` +
          `(the match cards don't count). Declared additional melds = ${additionalPoints} pts.`,
        { total: additionalPoints, minimum },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // All validation passed — execute the action.
  // ---------------------------------------------------------------------------

  // Separate top card (anchors the mandatory meld) from the rest of the pile.
  const pilonRest = round.pilon.slice(0, -1);

  // Clear the pilon.
  round.pilon      = [];
  round.pilonState = "EMPTY";
  round.tapaActive = false;

  // Remove match cards from hand — they go into the mandatory meld.
  removeCardsFromHandMutate(player, matchCardIds);

  // Create the mandatory auto-meld: matchCards + topCard.
  const autoMeld: Meld = {
    id:    newMeldId(),
    rank:  topCard.rank as Rank,
    cards: [...matchCards, topCard],
  };
  team.table.melds.push(autoMeld);

  // Add the rest of the pilon to the player's hand.
  player.hand.push(...pilonRest);
  player.hand = sortHand(player.hand);

  // Build additional melds (only when team hasn't bajado yet).
  const additionalMelds: Meld[] = [];

  if (!team.hasBajado) {
    // Remove additional meld cards from hand and create Meld objects.
    for (const group of validatedAdditional) {
      removeCardsFromHandMutate(player, group.cards.map((c) => c.id));
      const extraMeld: Meld = {
        id:    newMeldId(),
        rank:  group.rank,
        cards: [...group.cards],
      };
      team.table.melds.push(extraMeld);
      additionalMelds.push(extraMeld);
    }

    // Mark bajada as complete — validation already confirmed the minimum is met.
    team.hasBajado = true;
  }

  // Track all new meld IDs in bajadaMeldIds for commitBajada / addToMeld access.
  const ctx = game.turn!;
  ctx.bajadaMeldIds.push(autoMeld.id, ...additionalMelds.map((m) => m.id));

  // Update turn context.
  ctx.tookPilon       = true;
  ctx.pilonMatchCards = matchCards;
  ctx.drawnCards      = pilonRest; // cards that went to hand (for NEW badge)
  ctx.phase           = "TOOK_PILON";

  return ok({ pilonCards: pilonRest, autoMeld, additionalMelds });
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

  // Prevent duplicate rank: team cannot open a new meld of a rank they already
  // have a meld or canasta for. If they have a closed canasta they should burn;
  // if they have an open meld they should extend it via addToMeld.
  if (team.table.melds.some((m) => m.rank === rank)) {
    return err(
      "DUPLICATE_RANK_MELD",
      `Team already has an open meld of rank ${rank}. Add cards to it instead of starting a new one.`,
    );
  }
  if (team.table.canastas.some((c) => c.rank === rank)) {
    return err(
      "DUPLICATE_RANK_MELD",
      `Team already has a canasta of rank ${rank}. Burn cards to it instead of opening a new meld.`,
    );
  }

  // Bajada logic (section 9.1)
  const isBajada = !team.hasBajado;

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

  // Only count melds/canastas laid by THIS player in THIS turn (bajadaMeldIds).
  // This prevents partner melds from previous turns from inflating the total.
  // A bajada meld that closed into a canasta this turn has its canasta ID tracked too.
  const bajadaMeldSet = new Set(game.turn!.bajadaMeldIds);

  let total = 0;
  for (const meld of team.table.melds) {
    if (!bajadaMeldSet.has(meld.id)) continue;
    for (const c of meld.cards) total += c.points;
  }
  for (const cana of team.table.canastas) {
    if (!bajadaMeldSet.has(cana.id)) continue;
    for (const c of cana.cards) total += c.points;
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
  const ctx       = game.turn!;

  const meld = team.table.melds.find((m) => m.id === meldId);
  if (!meld) {
    return err("MELD_NOT_FOUND", `Meld ${meldId} not found on team table.`);
  }

  // Team must have bajada to add to melds — UNLESS this meld is part of the
  // current bajada attempt (player is still building up to the point minimum).
  const isBajadaMeld = ctx.bajadaMeldIds.includes(meldId);
  if (!team.hasBajado && !isBajadaMeld) {
    return err("NO_BAJADA", "Team must make their bajada before adding to melds.");
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

    // If this meld was part of a pending bajada, replace its ID with the
    // canasta ID so commitBajada can still count those cards.
    if (isBajadaMeld) {
      ctx.bajadaMeldIds = ctx.bajadaMeldIds.filter(id => id !== meldId);
      ctx.bajadaMeldIds.push(canasta.id);
    }

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
