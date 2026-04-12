// =============================================================================
// CANASTÓN — Scoring Engine (section 13)
// =============================================================================

import {
  Card,
  Canasta,
  Team,
  TeamId,
  RoundScoreBreakdown,
  CANASTA_BASE_POINTS,
  WINNING_SCORE,
  isTapa,
} from './types';
import { cardPoints } from './rules';

// ---------------------------------------------------------------------------
// Canasta scoring (sections 10.2–10.4)
// ---------------------------------------------------------------------------

export function canastaBaseValue(canasta: Canasta): number {
  const rank = canasta.rank;
  const type = canasta.type;

  if (rank === 'JOKER') {
    return type === 'clean' ? CANASTA_BASE_POINTS.jokers.clean : CANASTA_BASE_POINTS.jokers.dirty;
  }
  if (rank === '2') {
    return type === 'clean' ? CANASTA_BASE_POINTS.twos.clean : CANASTA_BASE_POINTS.twos.dirty;
  }
  if (rank === 'A') {
    return type === 'clean' ? CANASTA_BASE_POINTS.aces.clean : CANASTA_BASE_POINTS.aces.dirty;
  }
  // 4–K
  return type === 'clean' ? CANASTA_BASE_POINTS.lowCards.clean : CANASTA_BASE_POINTS.lowCards.dirty;
}

export function canastaCardPoints(canasta: Canasta): number {
  return canasta.cards.reduce((sum, c) => sum + cardPoints(c), 0);
}

export function canastaTotal(canasta: Canasta): number {
  return canastaBaseValue(canasta) + canastaCardPoints(canasta);
}

// ---------------------------------------------------------------------------
// Honor scoring (section 11.3)
// ---------------------------------------------------------------------------

type HonorCloseType = 'limpia_sucia' | 'solo_limpia' | 'sin_limpia';

const HONOR_TABLE: Record<HonorCloseType, number[]> = {
  limpia_sucia: [0, 100, 200, 600, 800, 1000, 2000],  // index = honor count
  solo_limpia:  [0,   0,   0,   0,   0,    0,    0],
  sin_limpia:   [0, -200, -400, -1200, -1600, -2000, -4000],
};

export function honorCloseType(team: Team): HonorCloseType {
  const hasClean = team.canastas.some(c => c.type === 'clean' && c.closed);
  const hasDirty = team.canastas.some(c => c.type === 'dirty' && c.closed);

  if (hasClean && hasDirty) return 'limpia_sucia';
  if (hasClean && !hasDirty) return 'solo_limpia';
  return 'sin_limpia';
}

export function honorPoints(team: Team): number {
  const count = Math.min(team.honors.length, 6);
  const closeType = honorCloseType(team);
  return HONOR_TABLE[closeType][count];
}

// ---------------------------------------------------------------------------
// Ida bonus (section 12.2)
// ---------------------------------------------------------------------------

export function idaBonus(blackThreesInHand: number): number {
  let bonus = 300; // base
  if (blackThreesInHand >= 6) bonus += 600;
  else if (blackThreesInHand >= 3) bonus += 300;
  return bonus;
}

// ---------------------------------------------------------------------------
// Hand value (positive = going-out player; negative = losing team's hand)
// ---------------------------------------------------------------------------

export function handValue(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

export function blackThreesInHand(hand: Card[]): number {
  return hand.filter(isTapa).length;
}

// ---------------------------------------------------------------------------
// Loose table cards (section 13.2)
// ---------------------------------------------------------------------------

export function tableCardPoints(team: Team): number {
  const hasClean = team.canastas.some(c => c.type === 'clean' && c.closed);
  const hasDirty = team.canastas.some(c => c.type === 'dirty' && c.closed);

  if (hasClean) {
    // With clean: table cards sum positively
    return team.tableCards.reduce((sum, c) => sum + cardPoints(c), 0);
  }
  if (!hasClean && hasDirty) {
    // Only dirty: table cards count 0
    return 0;
  }
  // No canastas: table cards are deducted
  const penalty = team.tableCards.reduce((sum, c) => sum + cardPoints(c), 0);
  return penalty === 0 ? 0 : -penalty;
}

// ---------------------------------------------------------------------------
// Full round score calculation (section 13.1)
// ---------------------------------------------------------------------------

export function calculateRoundScore(
  winnerTeamId: TeamId,
  teams: Record<TeamId, Team>,
  goingOutPlayerId: string,
  allPlayers: Record<string, { teamId: TeamId; hand: Card[] }>,
): RoundScoreBreakdown[] {
  const results: RoundScoreBreakdown[] = [];

  for (const [teamId, team] of Object.entries(teams) as [TeamId, Team][]) {
    const isWinner = teamId === winnerTeamId;

    // Canastas
    const closedCanastas = team.canastas.filter(c => c.closed);
    const cBase = closedCanastas.reduce((s, c) => s + canastaBaseValue(c), 0);
    const cCards = closedCanastas.reduce((s, c) => s + canastaCardPoints(c), 0);

    // Honors
    const hPoints = honorPoints(team);

    // Ida bonus (only for winning team)
    let ida = 0;
    let winnerBonus = 0;
    if (isWinner) {
      const goingOutPlayer = allPlayers[goingOutPlayerId];
      const blackThrees = blackThreesInHand(goingOutPlayer.hand);
      ida = idaBonus(blackThrees);
      winnerBonus = blackThrees * 5; // section 12.3
    }

    // Hand penalties (losing team players; note: going-out player hand is 0 or bonus)
    let handPenalty = 0;
    for (const [pid, player] of Object.entries(allPlayers)) {
      if (player.teamId !== teamId) continue;
      if (pid === goingOutPlayerId) continue;
      const val = isWinner
        ? handValue(player.hand) // winning team partner's hand can be positive
        : -handValue(player.hand);
      handPenalty += val;
    }

    // Table cards
    const tablePoints = tableCardPoints(team);

    const total = cBase + cCards + hPoints + ida + winnerBonus + handPenalty + tablePoints;

    results.push({
      teamId,
      canastaBase: cBase,
      canastaCardPoints: cCards,
      honorPoints: hPoints,
      idaBonus: ida,
      losingHandPenalty: handPenalty,
      winnerHandBonus: winnerBonus,
      total,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Victory check (section 14)
// ---------------------------------------------------------------------------

export function checkVictory(
  scores: Record<TeamId, number>,
): { winner: TeamId | null; isDraw: boolean } {
  const [team1, score1] = ['team_ns', scores['team_ns']] as [TeamId, number];
  const [team2, score2] = ['team_eo', scores['team_eo']] as [TeamId, number];

  const team1Wins = score1 >= WINNING_SCORE;
  const team2Wins = score2 >= WINNING_SCORE;

  if (!team1Wins && !team2Wins) return { winner: null, isDraw: false };
  if (team1Wins && team2Wins) {
    if (score1 === score2) return { winner: null, isDraw: true };
    return { winner: score1 > score2 ? team1 : team2, isDraw: false };
  }
  return { winner: team1Wins ? team1 : team2, isDraw: false };
}
