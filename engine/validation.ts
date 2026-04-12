// =============================================================================
// CANASTON ENGINE — validation.ts
// Reusable validation primitives used across the engine.
// =============================================================================

import type {
  ActionErr,
  ActionOk,
  ActionResult,
  Card,
  Canasta,
  GameStateData,
  Meld,
  PlayerId,
  Rank,
  TeamId,
  TurnPhase,
} from "./types";
import { isMono, isTapa, isHonor } from "./deck";

// ---------------------------------------------------------------------------
// Result factories
// ---------------------------------------------------------------------------

export function ok<T>(data: T): ActionOk<T> {
  return { ok: true, data };
}

export function err(code: string, message: string, details?: Record<string, unknown>): ActionErr {
  return { ok: false, error: { code, message, details } };
}

// ---------------------------------------------------------------------------
// State guard
// ---------------------------------------------------------------------------

export function requireState(
  game: GameStateData,
  ...allowed: GameStateData["state"][]
): ActionResult<void> {
  if (!allowed.includes(game.state)) {
    return err(
      "INVALID_STATE",
      `Action not allowed in state ${game.state}. Allowed: ${allowed.join(", ")}`,
    );
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Turn guard
// ---------------------------------------------------------------------------

export function requireCurrentPlayer(
  game: GameStateData,
  playerId: PlayerId,
): ActionResult<void> {
  const ctx = game.turn;
  if (!ctx || ctx.playerId !== playerId) {
    return err("NOT_YOUR_TURN", `It is not player ${playerId}'s turn.`);
  }
  return ok(undefined);
}

export function requireTurnPhase(
  game: GameStateData,
  ...phases: TurnPhase[]
): ActionResult<void> {
  const ctx = game.turn;
  if (!ctx || !phases.includes(ctx.phase)) {
    return err(
      "WRONG_TURN_PHASE",
      `Turn phase must be one of [${phases.join(", ")}], got ${ctx?.phase ?? "none"}.`,
    );
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Player / hand guards
// ---------------------------------------------------------------------------

export function requireCardsInHand(
  game: GameStateData,
  playerId: PlayerId,
  cardIds: string[],
): ActionResult<Card[]> {
  const player = game.players[playerId];
  if (!player) return err("PLAYER_NOT_FOUND", `Player ${playerId} not found.`);

  const handMap = new Map(player.hand.map((c) => [c.id, c]));
  const found: Card[] = [];
  for (const id of cardIds) {
    const card = handMap.get(id);
    if (!card) {
      return err("CARD_NOT_IN_HAND", `Card ${id} is not in ${playerId}'s hand.`, { cardId: id });
    }
    found.push(card);
  }
  return ok(found);
}

// ---------------------------------------------------------------------------
// Combination / meld validators
// ---------------------------------------------------------------------------

/**
 * A valid combination for laying down (trío):
 * - At least 3 cards total.
 * - All non-wild cards share the same rank.
 * - At most 2 wilds allowed.
 * - At least 2 natural (non-wild) cards (section 9.2).
 * - No honors or tapas.
 */
export function validateMeld(cards: Card[]): ActionResult<{ rank: Rank; wildCount: number }> {
  if (cards.length < 3) {
    return err("MELD_TOO_SHORT", "A combination must have at least 3 cards.");
  }

  const naturals = cards.filter((c) => !isMono(c));
  const wilds    = cards.filter((c) => isMono(c));

  // No honors or tapas in melds
  if (naturals.some((c) => isHonor(c) || isTapa(c))) {
    return err("HONORS_NOT_IN_MELD", "Honors (3 red) and Tapas (3 black) cannot be part of a meld.");
  }

  if (naturals.length < 2) {
    return err(
      "INSUFFICIENT_NATURALS",
      "A combination must have at least 2 natural cards (section 9.2).",
    );
  }

  if (wilds.length > 2) {
    return err("TOO_MANY_WILDS", "A combination can have at most 2 wilds.");
  }

  const ranks = new Set(naturals.map((c) => c.rank));
  if (ranks.size !== 1) {
    return err("MIXED_RANKS", "All natural cards in a combination must share the same rank.");
  }

  const rank = [...ranks][0];

  // Special handling for a meld of 2s (PATO) — treated as MONO rank
  // Natural 2s can form their own canasta (rank "2").
  // Wilds (Jokers) can fill in a 2-canasta, and 2s can fill in a Joker-canasta.

  return ok({ rank, wildCount: wilds.length });
}

/**
 * Validates adding cards to an existing meld/canasta:
 * - Rank must match.
 * - Total wilds after addition must not exceed 2.
 * - Cannot add if already closed (unless burning).
 */
export function validateAddToMeld(
  meld: Meld | Canasta,
  newCards: Card[],
): ActionResult<void> {
  const existingWilds = meld.cards.filter((c) => isMono(c)).length;
  const newWilds      = newCards.filter((c) => isMono(c)).length;

  if (newCards.some((c) => isHonor(c) || isTapa(c))) {
    return err("HONORS_NOT_IN_MELD", "Cannot add honor or tapa to a meld.");
  }

  const newNaturals = newCards.filter((c) => !isMono(c));
  if (newNaturals.some((c) => c.rank !== meld.rank)) {
    return err("RANK_MISMATCH", `All cards added to meld must have rank ${meld.rank}.`);
  }

  if ("closed" in meld && meld.closed) {
    // Allow burning — no wild check for burning extra naturals on a closed canasta
    if (newWilds > 0) {
      return err("CANASTA_CLOSED_NO_WILDS", "Cannot add wilds to a closed canasta.");
    }
    return ok(undefined);
  }

  if (existingWilds + newWilds > 2) {
    return err(
      "TOO_MANY_WILDS",
      `Adding these cards would exceed the 2-wild limit (current ${existingWilds}, adding ${newWilds}).`,
    );
  }

  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Canasta closure check
// ---------------------------------------------------------------------------

export function isCanastaCloseable(cards: Card[]): boolean {
  return cards.length === 7;
}

export function countMono(cards: Card[]): number {
  return cards.filter((c) => isMono(c)).length;
}

export function isCleanCanasta(cards: Card[]): boolean {
  return cards.length >= 7 && countMono(cards) === 0;
}

export function isSuciCanasta(cards: Card[]): boolean {
  const wilds = countMono(cards);
  return cards.length >= 7 && wilds >= 1 && wilds <= 2;
}

// ---------------------------------------------------------------------------
// Ida validation helpers (section 12)
// ---------------------------------------------------------------------------

export function canIr(
  game: GameStateData,
  playerId: PlayerId,
  discardCard: Card,
): ActionResult<{ blackThreesInHand: number; bonus: number }> {
  const teamId = game.playerTeam[playerId];
  const team   = game.teams[teamId];

  // Must not discard a mono or tapa
  if (isMono(discardCard)) {
    return err("IDA_DISCARD_MONO", "Cannot go out by discarding a wild (2 or Joker).");
  }

  const player = game.players[playerId];
  const tapasInHand = player.hand.filter((c) => isTapa(c)).length;

  // If the only remaining cards are tapas (3 negros), allow discarding a non-mono
  // but discard must not be a tapa unless they have >=3 tapas
  if (isTapa(discardCard) && tapasInHand < 3) {
    return err("IDA_DISCARD_TAPA", "Cannot go out by discarding a tapa unless you hold 3 or more.");
  }

  // Team needs >=1 LIMPIA + >=1 SUCIA (or LIMPIA)
  const canastas = team.table.canastas;
  const limpias  = canastas.filter((c) => c.type === "LIMPIA").length;
  const sucias   = canastas.filter((c) => c.type === "SUCIA").length;

  if (limpias < 1) {
    return err("IDA_NO_LIMPIA", "Team must have at least 1 clean canasta to go out.");
  }
  if (sucias < 1) {
    return err("IDA_NO_SUCIA", "Team must have at least 1 dirty canasta to go out.");
  }

  // Bonus calculation
  let bonus = 300; // base ida bonus
  if (tapasInHand >= 6) bonus += 300;

  return ok({ blackThreesInHand: tapasInHand, bonus });
}
