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
  canastaEffectiveType,
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

/**
 * Guards that a play action (layMeld / addToMeld / addToCanasta) leaves the
 * player's hand in a legal state:
 *
 *   1. At least 1 card must remain (to discard at end of turn).
 *   2. If exactly 1 card would remain, the player must already have the ida
 *      conditions met (≥1 LIMPIA + ≥1 SUCIA), otherwise they would be forced
 *      to discard that last card without being able to go out — a dead end.
 */
function validateHandAfterPlay(
  game: GameStateData,
  playerId: PlayerId,
  cardIdsToRemove: string[],
): ActionResult<void> {
  const removeSet = new Set(cardIdsToRemove);
  const handAfter = game.players[playerId].hand.filter((c) => !removeSet.has(c.id));

  if (handAfter.length === 0) {
    return err(
      "MUST_KEEP_DISCARD_CARD",
      "Debes conservar al menos una carta para descartar al final del turno.",
    );
  }

  if (handAfter.length === 1) {
    const { team } = getTeamForPlayer(game, playerId);
    const hasLimpia = team.table.canastas.some((c) => canastaEffectiveType(c) === "LIMPIA");
    const hasSucia  = team.table.canastas.some((c) => canastaEffectiveType(c) === "SUCIA");
    if (!hasLimpia || !hasSucia) {
      return err(
        "CANNOT_LEAVE_ONE_CARD",
        "No puedes quedarte con una sola carta si no puedes realizar la ida " +
          "(se necesita canasta limpia y sucia cerradas).",
      );
    }
  }

  return ok(undefined);
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
): ActionResult<{ pilonCards: Card[]; autoMeld: Meld | null; additionalMelds: Meld[] }> {
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

  const player   = game.players[playerId];
  const { team } = getTeamForPlayer(game, playerId);

  // Free-take check (section 8.4):
  // If the taking team already has a *closed* canasta of the same rank as the
  // pilon top card, they may take the pile with ZERO match cards — the top
  // card is burned into that closed canasta automatically.
  const freeCanasta = team.table.canastas.find(
    (c) => c.rank === (topCard.rank as Rank) && c.closed,
  );
  const isFree = freeCanasta !== undefined;

  // Triado check (section 8.2) — not applicable on a free take.
  const requiredCount = isFree ? 0 : round.pilonState === "TRIADO" ? 3 : 2;

  if (matchCardIds.length !== requiredCount) {
    return err(
      "PILON_WRONG_MATCH_COUNT",
      isFree
        ? `Your team has a closed canasta of rank ${topCard.rank}. No match cards needed (got ${matchCardIds.length}).`
        : `Pilon is ${round.pilonState === "TRIADO" ? "triado (need 3)" : "normal (need 2)"}. ` +
          `Provided ${matchCardIds.length} cards.`,
      { required: requiredCount, provided: matchCardIds.length },
    );
  }

  // Validate match cards are in hand (skipped when free take, since none are required)
  let matchCards: Card[] = [];
  if (!isFree) {
    const handCheck = requireCardsInHand(game, playerId, matchCardIds);
    if (!handCheck.ok) return handCheck;
    matchCards = handCheck.data;

    // All match cards must equal the top card's rank
    for (const mc of matchCards) {
      if (mc.rank !== topCard.rank) {
        return err(
          "PILON_RANK_MISMATCH",
          `Match card ${mc.id} has rank ${mc.rank} but pilon top is rank ${topCard.rank}.`,
        );
      }
    }
  }

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

      const groupRank = meldCheck.data.rank;

      // Cannot use the same rank as the pilon auto-meld (the top card).
      if (!isFree && groupRank === (topCard.rank as Rank)) {
        return err(
          "DUPLICATE_RANK_MELD",
          `Additional meld group ${i + 1} has rank ${groupRank}, which is already used by the ` +
            `pilon auto-meld. You cannot form two melds of the same rank.`,
        );
      }

      // Cannot duplicate a rank already declared in a previous additional group
      // (two separate groups of the same rank should be one group).
      if (validatedAdditional.some((m) => m.rank === groupRank)) {
        return err(
          "DUPLICATE_RANK_MELD",
          `Additional meld group ${i + 1} has rank ${groupRank} which is already used by another group. ` +
            `Combine them into one group instead.`,
        );
      }

      // Cannot play into a rank the team already has a closed canasta of
      // (they should burn, not meld).
      if (team.table.canastas.some((c) => c.rank === groupRank)) {
        return err(
          "DUPLICATE_RANK_MELD",
          `Team already has a closed canasta of rank ${groupRank}. Burn cards to it instead.`,
        );
      }
      // Note: if an open meld of this rank exists, the cards will be merged into it.

      validatedAdditional.push({ cards: groupCheck.data, rank: groupRank });
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

  // Separate top card (anchors the mandatory meld / burn) from the rest of the pile.
  const pilonRest = round.pilon.slice(0, -1);

  // Clear the pilon.
  round.pilon      = [];
  round.pilonState = "EMPTY";
  round.tapaActive = false;

  // Add the rest of the pilon to the player's hand.
  player.hand.push(...pilonRest);
  player.hand = sortHand(player.hand);

  let autoMeld: Meld | null = null;
  let autoCanasta: Canasta | null = null;

  if (isFree && freeCanasta) {
    // Free take: burn the top card into the closed canasta — no match cards needed.
    freeCanasta.burned.push(topCard);
  } else {
    // Normal take: remove match cards from hand, create or extend the mandatory meld.
    removeCardsFromHandMutate(player, matchCardIds);

    // If the team already has an open meld of this rank, merge into it instead
    // of creating a duplicate.
    const autoMeldRank = topCard.rank as Rank;
    const existingMeld = team.table.melds.find((m) => m.rank === autoMeldRank);
    if (existingMeld) {
      existingMeld.cards.push(...matchCards, topCard);
      if (isCanastaCloseable(existingMeld.cards)) {
        const wilds = countMono(existingMeld.cards);
        const type: CanastaType =
          existingMeld.rank === "2" || existingMeld.rank === "JOKER"
            ? "MONO"
            : wilds === 0 ? "LIMPIA" : "SUCIA";
        autoCanasta = {
          id:     newCanaId(),
          rank:   existingMeld.rank,
          cards:  existingMeld.cards.slice(0, 7),
          type,
          closed: true,
          burned: existingMeld.cards.slice(7),
        };
        team.table.canastas.push(autoCanasta);
        team.table.melds = team.table.melds.filter((m) => m.id !== existingMeld.id);
        if (type === "MONO") {
          team.monoObligado = false;
        }
      } else {
        autoMeld = existingMeld;
      }
    } else {
      autoMeld = {
        id:    newMeldId(),
        rank:  autoMeldRank,
        cards: [...matchCards, topCard],
      };
      team.table.melds.push(autoMeld);
    }
  }

  // Build additional melds (only when team hasn't bajado yet).
  const additionalMelds: Meld[] = [];

  if (!team.hasBajado) {
    // Remove additional meld cards from hand and create or extend Meld objects.
    for (const group of validatedAdditional) {
      removeCardsFromHandMutate(player, group.cards.map((c) => c.id));
      const existingExtra = team.table.melds.find((m) => m.rank === group.rank);
      let extraMeld: Meld;
      if (existingExtra) {
        existingExtra.cards.push(...group.cards);
        extraMeld = existingExtra;
      } else {
        extraMeld = {
          id:    newMeldId(),
          rank:  group.rank,
          cards: [...group.cards],
        };
        team.table.melds.push(extraMeld);
      }
      additionalMelds.push(extraMeld);
    }

    // Mark bajada as complete — validation already confirmed the minimum is met.
    team.hasBajado = true;
  }

  // Track all new meld IDs in bajadaMeldIds for commitBajada / addToMeld access.
  const ctx = game.turn!;
  if (autoMeld) ctx.bajadaMeldIds.push(autoMeld.id);
  if (autoCanasta) ctx.bajadaMeldIds.push(autoCanasta.id);
  ctx.bajadaMeldIds.push(...additionalMelds.map((m) => m.id));

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
  //
  // Mono melds (rank "2" or "JOKER") are treated as one family: a team can
  // only have a single mono meld/canasta regardless of which wildcard rank it
  // was assigned when created.
  const isMono = rank === "2" || rank === "JOKER";
  const hasDupMeld = isMono
    ? team.table.melds.some((m) => m.rank === "2" || m.rank === "JOKER")
    : team.table.melds.some((m) => m.rank === rank);
  if (hasDupMeld) {
    return err(
      "DUPLICATE_RANK_MELD",
      isMono
        ? "El equipo ya tiene una jugada de monos. Añade comodines a ella en lugar de crear una nueva."
        : `Team already has an open meld of rank ${rank}. Add cards to it instead of starting a new one.`,
    );
  }
  const hasDupCana = isMono
    ? team.table.canastas.some((c) => c.rank === "2" || c.rank === "JOKER")
    : team.table.canastas.some((c) => c.rank === rank);
  if (hasDupCana) {
    return err(
      "DUPLICATE_RANK_MELD",
      isMono
        ? "El equipo ya tiene una canasta de monos. Quema comodines en ella en lugar de abrir una nueva jugada."
        : `Team already has a canasta of rank ${rank}. Burn cards to it instead of opening a new meld.`,
    );
  }

  // Bajada logic (section 9.1)
  const isBajada = !team.hasBajado;

  const handCheck2 = validateHandAfterPlay(game, playerId, opts.cardIds);
  if (!handCheck2.ok) return handCheck2;

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
// CANCEL BAJADA — return all this-turn bajada melds/canastas to hand
// ---------------------------------------------------------------------------

export function cancelBajada(
  game: GameStateData,
  playerId: PlayerId,
): ActionResult<{ cardsReturned: Card[] }> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const turnCheck = requireCurrentPlayer(game, playerId);
  if (!turnCheck.ok) return turnCheck;

  const phaseCheck = requireTurnPhase(game, "DRAWN_FROM_STOCK", "TOOK_PILON");
  if (!phaseCheck.ok) return phaseCheck;

  const { team } = getTeamForPlayer(game, playerId);

  if (team.hasBajado) {
    return err("ALREADY_BAJADO", "No se puede cancelar la bajada después de haberla confirmado.");
  }

  const ctx = game.turn!;
  if (ctx.bajadaMeldIds.length === 0) {
    return err("NO_BAJADA_TO_CANCEL", "No hay jugadas de bajada para cancelar.");
  }

  const bajadaSet = new Set(ctx.bajadaMeldIds);
  const cardsReturned: Card[] = [];

  // Collect and remove bajada melds
  for (const meld of team.table.melds) {
    if (bajadaSet.has(meld.id)) cardsReturned.push(...meld.cards);
  }
  team.table.melds = team.table.melds.filter((m) => !bajadaSet.has(m.id));

  // Collect and remove bajada canastas (cards + any burned)
  for (const cana of team.table.canastas) {
    if (bajadaSet.has(cana.id)) cardsReturned.push(...cana.cards, ...cana.burned);
  }
  team.table.canastas = team.table.canastas.filter((c) => !bajadaSet.has(c.id));

  // Return cards to hand
  game.players[playerId].hand.push(...cardsReturned);
  game.players[playerId].hand = sortHand(game.players[playerId].hand);

  // Reset monoObligado if no mono meld or canasta remains on the table
  const hasMonoLeft =
    team.table.melds.some((m) => m.rank === "2" || m.rank === "JOKER") ||
    team.table.canastas.some((c) => c.rank === "2" || c.rank === "JOKER");
  if (!hasMonoLeft) {
    team.monoObligado = false;
  }

  ctx.bajadaMeldIds = [];

  return ok({ cardsReturned });
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

  const handCheck2 = validateHandAfterPlay(game, playerId, cardIds);
  if (!handCheck2.ok) return handCheck2;

  removeCardsFromHandMutate(game.players[playerId], cardIds);
  meld.cards.push(...newCards);

  // Check if meld has become a canasta
  if (isCanastaCloseable(meld.cards)) {
    const wilds    = countMono(meld.cards);
    const type: CanastaType =
      meld.rank === "2" || meld.rank === "JOKER"
        ? "MONO"
        : wilds === 0 ? "LIMPIA" : "SUCIA";

    // The canasta holds exactly 7 cards; any extras beyond 7 are burned.
    const canasta: Canasta = {
      id:      newCanaId(),
      rank:    meld.rank,
      cards:   meld.cards.slice(0, 7),
      type,
      closed:  true,
      burned:  meld.cards.slice(7),
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

  const handCheck2 = validateHandAfterPlay(game, playerId, cardIds);
  if (!handCheck2.ok) return handCheck2;

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

  // Update pilon state (section 8).
  // Triado is sticky: once the pilon is triado it stays triado even if a
  // natural card or tapa is discarded on top. A tapa blocks the pile
  // (tapaActive = true) but does NOT erase the triado requirement — the
  // pile still needs 3 matching cards once it becomes takeable again.
  if (isMono(card)) {
    round.pilonState = "TRIADO";
    round.tapaActive = false;
  } else if (isTapa(card)) {
    // Block the pile. Only update pilonState to TAPA if it wasn't already
    // TRIADO — a tapa on a triado pile keeps the triado requirement.
    round.tapaActive = true;
    if (round.pilonState !== "TRIADO") {
      round.pilonState = "TAPA";
    }
  } else {
    // Normal card: always clears any tapa block.
    round.tapaActive = false;
    if (round.pilonState !== "TRIADO") {
      round.pilonState = "NORMAL";
    }
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
