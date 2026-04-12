// =============================================================================
// Final Result Screen — shown when a team reaches 15,000 pts (FIN_PARTIDA)
// =============================================================================

import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/store/gameStore';

const TEAM_NS_COLOR = '#3498db';
const TEAM_EW_COLOR = '#e74c3c';
const WIN_THRESHOLD = 15_000;

export default function FinalResultScreen() {
  const router = useRouter();
  const { game, resetGame } = useGameStore();

  if (!game) {
    router.replace('/');
    return null;
  }

  const nsGlobal = game.teams['TEAM_NS']?.globalScore ?? 0;
  const ewGlobal = game.teams['TEAM_EW']?.globalScore ?? 0;
  const winner   = game.winner;

  const winnerName =
    winner === 'TEAM_NS'
      ? game.teams['TEAM_NS'].name
      : winner === 'TEAM_EW'
      ? game.teams['TEAM_EW'].name
      : null;

  const winnerColor =
    winner === 'TEAM_NS' ? TEAM_NS_COLOR :
    winner === 'TEAM_EW' ? TEAM_EW_COLOR :
    '#f9ca24';

  function handlePlayAgain() {
    resetGame();
    router.replace('/new-game');
  }

  function handleGoHome() {
    resetGame();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Trophy / Result */}
        <View style={styles.heroSection}>
          <Text style={styles.trophy}>
            {winner === 'DRAW' ? '🤝' : '🏆'}
          </Text>
          <Text style={styles.heroTitle}>
            {winner === 'DRAW' ? '¡Empate!' : '¡Ganador!'}
          </Text>
          {winnerName && (
            <Text style={[styles.winnerName, { color: winnerColor }]}>
              {winnerName}
            </Text>
          )}
          {winner === 'DRAW' && (
            <Text style={styles.drawText}>
              Ambos equipos terminaron con el mismo puntaje.
            </Text>
          )}
        </View>

        {/* Final Scores */}
        <View style={styles.finalScores}>
          <FinalScoreCard
            name={game.teams['TEAM_NS']?.name ?? 'Norte-Sur'}
            score={nsGlobal}
            color={TEAM_NS_COLOR}
            isWinner={winner === 'TEAM_NS'}
            players={(game.teams['TEAM_NS']?.playerIds ?? []).map((id) => game.players[id]?.name ?? id)}
          />
          <FinalScoreCard
            name={game.teams['TEAM_EW']?.name ?? 'Este-Oeste'}
            score={ewGlobal}
            color={TEAM_EW_COLOR}
            isWinner={winner === 'TEAM_EW'}
            players={(game.teams['TEAM_EW']?.playerIds ?? []).map((id) => game.players[id]?.name ?? id)}
          />
        </View>

        {/* Round History */}
        {game.scoreHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Historial de rondas</Text>
            <View style={styles.historyTable}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyHeaderCell}>Ronda</Text>
                <Text style={[styles.historyHeaderCell, { color: TEAM_NS_COLOR }]}>
                  {game.teams['TEAM_NS']?.name ?? 'Norte-Sur'}
                </Text>
                <Text style={[styles.historyHeaderCell, { color: TEAM_EW_COLOR }]}>
                  {game.teams['TEAM_EW']?.name ?? 'Este-Oeste'}
                </Text>
              </View>
              {game.scoreHistory.map((rs) => (
                <View key={rs.roundNumber} style={styles.historyRow}>
                  <Text style={styles.historyRowCell}>R{rs.roundNumber}</Text>
                  <View style={styles.historyScoreCell}>
                    <Text style={[styles.historyRoundScore, { color: TEAM_NS_COLOR }]}>
                      {rs.scores['TEAM_NS'].total >= 0 ? '+' : ''}{rs.scores['TEAM_NS'].total.toLocaleString()}
                    </Text>
                    <Text style={styles.historyGlobalScore}>
                      {rs.globalAfter['TEAM_NS'].toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.historyScoreCell}>
                    <Text style={[styles.historyRoundScore, { color: TEAM_EW_COLOR }]}>
                      {rs.scores['TEAM_EW'].total >= 0 ? '+' : ''}{rs.scores['TEAM_EW'].total.toLocaleString()}
                    </Text>
                    <Text style={styles.historyGlobalScore}>
                      {rs.globalAfter['TEAM_EW'].toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.playAgainBtn} onPress={handlePlayAgain} activeOpacity={0.85}>
            <Text style={styles.playAgainBtnText}>🎲 Jugar de nuevo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.homeBtn} onPress={handleGoHome} activeOpacity={0.8}>
            <Text style={styles.homeBtnText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// FinalScoreCard
// ---------------------------------------------------------------------------

function FinalScoreCard({
  name,
  score,
  color,
  isWinner,
  players,
}: {
  name: string;
  score: number;
  color: string;
  isWinner: boolean;
  players: string[];
}) {
  const pct = Math.min(score / WIN_THRESHOLD * 100, 100);

  return (
    <View
      style={[
        cardStyles.container,
        { borderColor: color },
        isWinner && cardStyles.winnerContainer,
      ]}
    >
      {isWinner && (
        <View style={[cardStyles.winnerBadge, { backgroundColor: color }]}>
          <Text style={cardStyles.winnerBadgeText}>🏆 GANADOR</Text>
        </View>
      )}

      <Text style={[cardStyles.name, { color }]}>{name}</Text>

      <Text style={cardStyles.score}>{score.toLocaleString()}</Text>
      <Text style={cardStyles.pts}>puntos finales</Text>

      {/* Progress bar */}
      <View style={cardStyles.progressTrack}>
        <View
          style={[
            cardStyles.progressFill,
            { width: `${pct}%` as any, backgroundColor: color },
          ]}
        />
      </View>

      {/* Player names */}
      <View style={cardStyles.players}>
        {players.map((p, i) => (
          <Text key={i} style={cardStyles.playerName}>{p}</Text>
        ))}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  winnerContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2.5,
  },
  winnerBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
  },
  winnerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  score: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  pts: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressFill: { height: 8, borderRadius: 4 },
  players: { marginTop: 4, gap: 2, alignItems: 'center' },
  playerName: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#145a32' },
  scroll: { padding: 20, paddingBottom: 48 },

  heroSection: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  trophy: { fontSize: 80 },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  winnerName: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  drawText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
  },

  finalScores: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },

  historySection: { marginBottom: 24 },
  historyTitle: {
    color: '#a9dfbf',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  historyTable: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  historyHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  historyHeaderCell: {
    flex: 1,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyRowCell: {
    flex: 1,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    alignSelf: 'center',
  },
  historyScoreCell: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  historyRoundScore: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyGlobalScore: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  actions: { gap: 12 },
  playAgainBtn: {
    backgroundColor: '#f39c12',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#f39c12',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  playAgainBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  homeBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  homeBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 15 },
});
