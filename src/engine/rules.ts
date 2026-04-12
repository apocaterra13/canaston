// =============================================================================
// CANASTÓN — Rules Validation
// All validation is pure: takes state/cards, returns ok/error.
// =============================================================================

import {
  Card,
  Canasta,
  CanastaType,
  Pilon,
  Team,
  GameState,
  PlayerId,
  BAJADA_MINIMUMS,
  CARD_POINTS,
  isMono,
  isTapa,
} from './types';

// ---------------------------------------------------------------------------
// Card point value
// ---------------------------------------------------------------------------

export function cardPoints(card: Card): number {
  return CARD_POINTS[card.rank] ?? 0;
}

export function combinationPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + cardPoints(c), 0);
}

// ---------------------------------------------------------------------------
// Pilón rules (section 8)
// ---------------------------------------------------------------------------

export function canTakePilon(
  pilon: Pilon,
  playerHand: Card[],
  teamHasBajado: boolean,
): { allowed: boolean; reason?: string } {
  if (pilon.state === 'empty' || pilon.cards.length === 0) {
    return { allowed: false, reason: 'Pilón vacío.' };
  }
  if (pilon.state === 'tapa') {
    return { allowed: false, reason: 'Pilón tapado. Debes robar del mazo.' };
  }

  const visibleCard = pilon.cards[0];
  const requiredCount = pilon.state === 'triado' ? 3 : 2;

  // Player must have `requiredCount` cards matching the visible card rank
  const targetRank = visibleCard.rank;
  const matching = playerHand.filter(
    c => c.kind === 'natural' && c.rank !== '3' && c.rank === targetRank,
  );

  if (matching.length < requiredCount) {
    return {
      allowed: false,
      reason: `Necesitas ${requiredCount} carta(s) del mismo valor que el pilón (${visibleCard.rank}).`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Combination / Meld validation
// ---------------------------------------------------------------------------

/**
 * Validate a combination (trío or more) for use in bajada or mesa play.
 * Rules:
 *  - Minimum 3 cards.
 *  - All natural cards must share the same rank.
 *  - Monos (2/Joker) fill in, but you need at least 2 natural cards per mono used.
 *  - No honors (red 3s) or tapas (black 3s) in combinations.
 */
export function validateCombination(cards: Card[]): { valid: boolean; reason?: string } {
  if (cards.length < 3) {
    return { valid: false, reason: 'Una combinación necesita mínimo 3 cartas.' };
  }

  const naturals = cards.filter(c => !isMono(c));
  const monos = cards.filter(c => isMono(c));

  // No 3s allowed
  if (naturals.some(c => c.rank === '3')) {
    return { valid: false, reason: 'Los 3s no pueden usarse en combinaciones.' };
  }

  // All naturals must share the same rank
  const ranks = new Set(naturals.map(c => c.rank));
  if (ranks.size > 1) {
    return { valid: false, reason: 'Todas las cartas naturales deben ser del mismo valor.' };
  }

  // At least 2 natural cards for each mono used (section 9.2)
  if (naturals.length < monos.length * 2) {
    return {
      valid: false,
      reason: 'Necesitas al menos 2 cartas naturales por cada mono que uses.',
    };
  }

  if (naturals.length === 0) {
    return { valid: false, reason: 'Necesitas al menos 2 cartas naturales en una combinación.' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Canasta validation (section 10)
// ---------------------------------------------------------------------------

export function validateCanasta(cards: Card[]): { valid: boolean; type?: CanastaType; reason?: string } {
  if (cards.length !== 7) {
    return { valid: false, reason: 'Una canasta necesita exactamente 7 cartas.' };
  }

  const result = validateCombination(cards);
  if (!result.valid) return { valid: false, reason: result.reason };

  const monos = cards.filter(isMono);
  if (monos.length > 2) {
    return { valid: false, reason: 'Una canasta sucia puede tener máximo 2 monos.' };
  }

  const type: CanastaType = monos.length === 0 ? 'clean' : 'dirty';
  return { valid: true, type };
}

// ---------------------------------------------------------------------------
// Bajada (first meld) validation (section 9)
// ---------------------------------------------------------------------------

export function getBajadaMinimum(globalScore: number): number {
  for (const { upTo, min } of BAJADA_MINIMUMS) {
    if (globalScore <= upTo) return min;
  }
  return 200; // 15000+ never reached in bajada context
}

export function validateBajada(
  combinations: Card[][],
  team: Team,
): { valid: boolean; reason?: string } {
  if (team.hasBajado) {
    return { valid: false, reason: 'El equipo ya hizo bajada esta ronda.' };
  }

  for (const combo of combinations) {
    const result = validateCombination(combo);
    if (!result.valid) return { valid: false, reason: result.reason };
  }

  const totalPoints = combinations.flat().reduce((sum, c) => sum + cardPoints(c), 0);
  const minimum = getBajadaMinimum(team.globalScore);

  if (totalPoints < minimum) {
    return {
      valid: false,
      reason: `Necesitas al menos ${minimum} puntos para bajar (tienes ${totalPoints}).`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Mono obligado validation (section 9.3)
// ---------------------------------------------------------------------------

/**
 * Returns true if the team has an open mono canasta that is not yet closed.
 * While this exists, monos cannot be used in other canastas.
 */
export function hasMonoObligado(team: Team): boolean {
  return team.canastas.some(
    c => (c.rank === '2' || c.rank === 'JOKER') && !c.closed,
  );
}

// ---------------------------------------------------------------------------
// Ida (going out) validation (section 12)
// ---------------------------------------------------------------------------

export function validateIda(
  discardCard: Card,
  hand: Card[],
  team: Team,
): { valid: boolean; reason?: string } {
  const cleanCanastas = team.canastas.filter(c => c.type === 'clean' && c.closed);
  const dirtyCanastas = team.canastas.filter(c => c.type === 'dirty' && c.closed);

  if (cleanCanastas.length < 1 || dirtyCanastas.length < 1) {
    return {
      valid: false,
      reason: 'El equipo necesita al menos 1 canasta limpia y 1 canasta sucia para irse.',
    };
  }

  // Cannot go out by discarding a mono (wildcard).
  if (isMono(discardCard)) {
    return { valid: false, reason: 'No puedes irte descartando un mono.' };
  }

  // Cannot go out by discarding a black 3 — you keep them and discard something else.
  if (isTapa(discardCard)) {
    return { valid: false, reason: 'No puedes irte descartando un 3 negro.' };
  }

  // After the discard the remaining hand must be either:
  //   (a) empty  — normal single-card go-out, or
  //   (b) 3 or more black 3s — the player keeps them as a bonus.
  // Having any non-tapa cards left means you still have cards to play.
  // Having 1–2 black 3s left is not enough to use the exception.
  const discardId = (discardCard as Card).id;
  const remainingHand = hand.filter(c => c.id !== discardId);
  const tapasRemaining  = remainingHand.filter(isTapa);
  const othersRemaining = remainingHand.filter(c => !isTapa(c));

  if (othersRemaining.length > 0) {
    return {
      valid: false,
      reason: 'Solo puedes irte al descartar tu última carta (salvo conservar 3+ tres negros).',
    };
  }

  if (tapasRemaining.length > 0 && tapasRemaining.length < 3) {
    return {
      valid: false,
      reason: 'No puedes quedarte con 1 o 2 tres negros al irte. Necesitas al menos 3.',
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Turn action guard
// ---------------------------------------------------------------------------

export function assertCurrentPlayer(
  state: GameState,
  playerId: PlayerId,
): { ok: true } | { ok: false; error: string } {
  if (state.currentPlayerId !== playerId) {
    return { ok: false, error: 'No es tu turno.' };
  }
  return { ok: true };
}
