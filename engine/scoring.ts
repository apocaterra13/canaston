// =============================================================================
// CANASTON ENGINE — scoring.ts
// Full round scoring, honor calculation, and end-of-game detection.
// Implements sections 11–14 of the spec.
// =============================================================================

import type {
  ActionResult,
  Canasta,
  Card,
  GameStateData,
  RoundScore,
  TeamId,
  TeamRoundScore,
} from "./types";
import {
  canastaBaseScore,
  sumCardPoints,
  isTapa,
  isHonor,
  isMono,
} from "./deck";
import { ok, err, requireState } from "./validation";
import { WIN_THRESHOLD } from "./types";

// ---------------------------------------------------------------------------
// Honor scoring table (section 11.3)
// ---------------------------------------------------------------------------

type HonorClosureType = "limpia_sucia" | "solo_limpia" | "sin_limpia";

const HONOR_TABLE: Record<number, Record<HonorClosureType, number>> = {
  1: { limpia_sucia: 100,  solo_limpia: 0, sin_limpia: -200  },
  2: { limpia_sucia: 200,  solo_limpia: 0, sin_limpia: -400  },
  3: { limpia_sucia: 600,  solo_limpia: 0, sin_limpia: -1200 },
  4: { limpia_sucia: 800,  solo_limpia: 0, sin_limpia: -1600 },
  5: { limpia_sucia: 1000, solo_limpia: 0, sin_limpia: -2000 },
  6: { limpia_sucia: 2000, solo_limpia: 0, sin_limpia: -4000 },
};

function getHonorScore(count: number, closure: HonorClosureType): number {
  if (count === 0) return 0;
  const row = HONOR_TABLE[Math.min(count, 6)];
  return row ? row[closure] : 0;
}

function getClosureType(canastas: Canasta[]): HonorClosureType {
  const limpias = canastas.filter((c) => c.type === "LIMPIA").length;
  const sucias  = canastas.filter((c) => c.type === "SUCIA").length;

  if (limpias >= 1 && sucias >= 1) return "limpia_sucia";
  if (limpias >= 1)                return "solo_limpia";
  return "sin_limpia";
}

// ---------------------------------------------------------------------------
// Canasta value (section 10.3 + 10.4 + 10.5)
// ---------------------------------------------------------------------------

function scoreSingleCanasta(canasta: Canasta): {
  basePoints: number;
  cardPoints: number;
  total: number;
} {
  const isClean = canasta.type === "LIMPIA";
  const base    = canastaBaseScore(canasta.rank, isClean);
  const cards   = sumCardPoints(canasta.cards);
  const burned  = sumCardPoints(canasta.burned);
  return { basePoints: base, cardPoints: cards + burned, total: base + cards + burned };
}

// ---------------------------------------------------------------------------
// Score loose cards on the table (section 13.2)
// ---------------------------------------------------------------------------

function scoreTableLooseCards(
  canastas: Canasta[],
  melds: import("./types").Meld[],
  closureType: HonorClosureType,
): number {
  if (closureType === "sin_limpia") {
    // no loose card bonus
    return 0;
  }
  // Sum points of cards in open melds (not yet closed into a canasta)
  return melds.reduce((acc, m) => acc + sumCardPoints(m.cards), 0);
}

// ---------------------------------------------------------------------------
// Score a single player's remaining hand (negative = subtract from total)
// ---------------------------------------------------------------------------

function scoreHand(hand: Card[]): number {
  // All cards in hand subtract their value (section 13.1 items 5,6)
  return -sumCardPoints(hand);
}

// ---------------------------------------------------------------------------
// Score the going-out player's black threes bonus
// ---------------------------------------------------------------------------

function scoreIdaPlayerHand(hand: Card[]): number {
  // Remaining hand is only tapas; each tapa = +5 (section 12.3 / 13.3)
  const tapas = hand.filter((c) => isTapa(c));
  return tapas.length * 5;
}

// ---------------------------------------------------------------------------
// MAIN: compute full round scores
// ---------------------------------------------------------------------------

export function computeRoundScore(game: GameStateData): ActionResult<RoundScore> {
  const stateCheck = requireState(game, "CONTEO_FINAL");
  if (!stateCheck.ok) return stateCheck;

  const round = game.round!;
  const idaPlayerId = round.idaPlayerId;

  const scores: Record<TeamId, TeamRoundScore> = {} as Record<TeamId, TeamRoundScore>;

  for (const teamId of ["TEAM_NS", "TEAM_EW"] as TeamId[]) {
    const team     = game.teams[teamId];
    const canastas = team.table.canastas;
    const melds    = team.table.melds;
    const honors   = team.table.honors;
    const closure  = getClosureType(canastas);

    // 1. Canasta base + card points
    let canastaBase  = 0;
    let canastaCards = 0;
    for (const c of canastas) {
      const cs = scoreSingleCanasta(c);
      canastaBase  += cs.basePoints;
      canastaCards += cs.cardPoints;
    }

    // 2. Honor points
    const honorCount  = honors.length;
    const honorPoints = getHonorScore(honorCount, closure);

    // 3. Ida bonus
    let idaBonus = 0;
    if (idaPlayerId && team.playerIds.includes(idaPlayerId as any)) {
      const idaPlayer  = game.players[idaPlayerId];
      const tapasInHand = idaPlayer.hand.filter((c) => isTapa(c)).length;
      idaBonus = tapasInHand >= 6 ? 600 : 300;
    }

    // 4. Loose cards on table
    const tableLoose = scoreTableLooseCards(canastas, melds, closure);

    // 5. Hand penalties
    // The player who went out (if any) gets scored separately
    let handPenalty        = 0;
    let idaPlayerHandBonus = 0;

    for (const pid of team.playerIds) {
      const player = game.players[pid];
      if (pid === idaPlayerId) {
        // Ida player: tapas in hand = bonus; everything else would be subtracted
        // but by definition they played out their hand (only tapas might remain)
        idaPlayerHandBonus = scoreIdaPlayerHand(player.hand);
        // Subtract any non-tapa cards still in hand (shouldn't happen but be safe)
        const nonTapas = player.hand.filter((c) => !isTapa(c));
        handPenalty += scoreHand(nonTapas);
      } else {
        handPenalty += scoreHand(player.hand);
      }
    }

    const total =
      canastaBase +
      canastaCards +
      honorPoints +
      idaBonus +
      tableLoose +
      handPenalty +
      idaPlayerHandBonus;

    scores[teamId] = {
      teamId,
      canastaBasePoints:    canastaBase,
      canastaCardPoints:    canastaCards,
      honorPoints,
      idaBonus,
      tableLooseCardPoints: tableLoose,
      handPenalty,
      idaPlayerHandBonus,
      total,
    };
  }

  // Update global scores
  const globalAfter: Record<TeamId, number> = {} as Record<TeamId, number>;
  for (const teamId of ["TEAM_NS", "TEAM_EW"] as TeamId[]) {
    game.teams[teamId].globalScore += scores[teamId].total;
    globalAfter[teamId] = game.teams[teamId].globalScore;
  }

  const roundScore: RoundScore = {
    roundNumber: round.roundNumber,
    scores,
    globalAfter,
  };

  game.scoreHistory.push(roundScore);

  return ok(roundScore);
}

// ---------------------------------------------------------------------------
// END OF GAME CHECK (section 14)
// ---------------------------------------------------------------------------

export interface EndOfGameResult {
  gameOver: boolean;
  winner: TeamId | "DRAW" | null;
  finalScores: Record<TeamId, number>;
}

export function checkEndOfGame(game: GameStateData): ActionResult<EndOfGameResult> {
  const stateCheck = requireState(game, "CONTEO_FINAL");
  if (!stateCheck.ok) return stateCheck;

  const nsScore = game.teams["TEAM_NS"].globalScore;
  const ewScore = game.teams["TEAM_EW"].globalScore;

  const nsWon = nsScore >= WIN_THRESHOLD;
  const ewWon = ewScore >= WIN_THRESHOLD;

  const finalScores: Record<TeamId, number> = {
    TEAM_NS: nsScore,
    TEAM_EW: ewScore,
  };

  if (!nsWon && !ewWon) {
    return ok({ gameOver: false, winner: null, finalScores });
  }

  let winner: TeamId | "DRAW";
  if (nsWon && ewWon) {
    winner = nsScore === ewScore ? "DRAW" : nsScore > ewScore ? "TEAM_NS" : "TEAM_EW";
  } else {
    winner = nsWon ? "TEAM_NS" : "TEAM_EW";
  }

  game.winner = winner;
  game.state  = "FIN_PARTIDA";

  return ok({ gameOver: true, winner, finalScores });
}

// ---------------------------------------------------------------------------
// TRANSITION: after CONTEO_FINAL, go to NUEVA_RONDA or FIN_PARTIDA
// ---------------------------------------------------------------------------

export function finalizeRound(game: GameStateData): ActionResult<EndOfGameResult> {
  const stateCheck = requireState(game, "CIERRE_RONDA");
  if (!stateCheck.ok) return stateCheck;

  game.state = "CONTEO_FINAL";

  // Compute scores
  const scoreResult = computeRoundScore(game);
  if (!scoreResult.ok) return scoreResult;

  // Check win condition
  const endResult = checkEndOfGame(game);
  if (!endResult.ok) return endResult;

  if (!endResult.data.gameOver) {
    game.state = "NUEVA_RONDA";
  }
  // If game over, state already set to FIN_PARTIDA by checkEndOfGame

  return endResult;
}

// ---------------------------------------------------------------------------
// Handle stock exhaustion (section 15.1)
// ---------------------------------------------------------------------------

export function handleStockExhausted(game: GameStateData): ActionResult<void> {
  const stateCheck = requireState(game, "TURNO_NORMAL");
  if (!stateCheck.ok) return stateCheck;

  const round = game.round!;
  if (round.stock.length > 0) {
    return err("STOCK_NOT_EMPTY", "Stock is not yet exhausted.");
  }

  // If the current player cannot take the pilon, end the round immediately
  game.state            = "CIERRE_RONDA";
  round.idaPlayerId     = null; // no one won

  return ok(undefined);
}
