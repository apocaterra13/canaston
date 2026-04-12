// =============================================================================
// Round Summary Screen — shown after each round ends (CONTEO_FINAL)
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
import type { TeamRoundScore } from '../engine/types';

const TEAM_NS_COLOR = '#3498db';
const TEAM_EW_COLOR = '#e74c3c';
const WIN_THRESHOLD = 15_000;

export default function RoundSummaryScreen() {
  const router = useRouter();
  const { game, playerBeginNewRound, resetGame } = useGameStore();

  if (!game) {
    router.replace('/');
    return null;
  }

  // Latest round score
  const latestScore = game.scoreHistory[game.scoreHistory.length - 1];
  if (!latestScore) {
    router.replace('/game');
    return null;
  }

  const nsScore = latestScore.scores['TEAM_NS'];
  const ewScore = latestScore.scores['TEAM_EW'];
  const nsGlobal = latestScore.globalAfter['TEAM_NS'];
  const ewGlobal = latestScore.globalAfter['TEAM_EW'];

  const roundNumber = latestScore.roundNumber;
  const idaPlayerId = game.round?.idaPlayerId ?? null;
  const idaPlayerName = idaPlayerId ? game.players[idaPlayerId]?.name : null;

  function handleNextRound() {
    playerBeginNewRound();
    router.replace('/game');
  }

  function handleQuit() {
    resetGame();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.roundLabel}>Ronda {roundNumber} — Terminada</Text>
          {idaPlayerName && (
            <View style={styles.idaBanner}>
              <Text style={styles.idaBannerText}>🏁 {idaPlayerName} se fue</Text>
            </View>
          )}
          {!idaPlayerId && (
            <View style={styles.stockBanner}>
              <Text style={styles.stockBannerText}>📦 Mazo agotado</Text>
            </View>
          )}
        </View>

        {/* Team score headers */}
        <View style={styles.teamRow}>
          <TeamHeader name={game.teams['TEAM_NS'].name} global={nsGlobal} color={TEAM_NS_COLOR} />
          <View style={styles.vsLabel}><Text style={styles.vsText}>VS</Text></View>
          <TeamHeader name={game.teams['TEAM_EW'].name} global={ewGlobal} color={TEAM_EW_COLOR} />
        </View>

        {/* Score breakdown table */}
        <View style={styles.breakdownCard}>
          <BreakdownHeader />
          <BreakdownRow
            label="Canastas (base)"
            ns={nsScore.canastaBasePoints}
            ew={ewScore.canastaBasePoints}
          />
          <BreakdownRow
            label="Cartas en canastas"
            ns={nsScore.canastaCardPoints}
            ew={ewScore.canastaCardPoints}
          />
          <BreakdownRow
            label="Honores 🏅"
            ns={nsScore.honorPoints}
            ew={ewScore.honorPoints}
          />
          <BreakdownRow
            label="Bonus por irse 🏁"
            ns={nsScore.idaBonus}
            ew={ewScore.idaBonus}
          />
          <BreakdownRow
            label="Sueltas en mesa"
            ns={nsScore.tableLooseCardPoints}
            ew={ewScore.tableLooseCardPoints}
          />
          <BreakdownRow
            label="Penalización mano"
            ns={nsScore.handPenalty}
            ew={ewScore.handPenalty}
          />
          <BreakdownRow
            label="Bonus tapas 🚫"
            ns={nsScore.idaPlayerHandBonus}
            ew={ewScore.idaPlayerHandBonus}
          />
          <BreakdownTotal
            ns={nsScore.total}
            ew={ewScore.total}
          />
        </View>

        {/* Progress to 15,000 */}
        <View style={styles.progressSection}>
          <Text style={styles.progressTitle}>Progreso hacia 15.000 pts</Text>
          <ProgressTeam
            name={game.teams['TEAM_NS'].name}
            value={nsGlobal}
            color={TEAM_NS_COLOR}
          />
          <ProgressTeam
            name={game.teams['TEAM_EW'].name}
            value={ewGlobal}
            color={TEAM_EW_COLOR}
          />
        </View>

        {/* Round history (compact) */}
        {game.scoreHistory.length > 1 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Historial de rondas</Text>
            {game.scoreHistory.map((rs) => (
              <View key={rs.roundNumber} style={styles.historyRow}>
                <Text style={styles.historyRound}>R{rs.roundNumber}</Text>
                <Text style={[styles.historyScore, { color: TEAM_NS_COLOR }]}>
                  {rs.scores['TEAM_NS'].total > 0 ? '+' : ''}{rs.scores['TEAM_NS'].total}
                </Text>
                <Text style={styles.historyGlobal}>{rs.globalAfter['TEAM_NS'].toLocaleString()}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.historyGlobal}>{rs.globalAfter['TEAM_EW'].toLocaleString()}</Text>
                <Text style={[styles.historyScore, { color: TEAM_EW_COLOR }]}>
                  {rs.scores['TEAM_EW'].total > 0 ? '+' : ''}{rs.scores['TEAM_EW'].total}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.quitBtn} onPress={handleQuit} activeOpacity={0.8}>
            <Text style={styles.quitBtnText}>✕ Abandonar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNextRound} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>Siguiente ronda →</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TeamHeader({ name, global, color }: { name: string; global: number; color: string }) {
  const pct = Math.min(global / WIN_THRESHOLD * 100, 100);
  return (
    <View style={[teamHeaderStyles.container, { borderColor: color }]}>
      <Text style={[teamHeaderStyles.name, { color }]}>{name}</Text>
      <Text style={teamHeaderStyles.global}>{global.toLocaleString()}</Text>
      <Text style={teamHeaderStyles.pts}>pts totales</Text>
      <View style={teamHeaderStyles.progressTrack}>
        <View style={[teamHeaderStyles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[teamHeaderStyles.pct, { color }]}>{pct.toFixed(0)}%</Text>
    </View>
  );
}

const teamHeaderStyles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  name: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  global: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  pts: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { height: 6, borderRadius: 3 },
  pct: { fontSize: 10, fontWeight: '600' },
});

function BreakdownHeader() {
  return (
    <View style={breakdownStyles.headerRow}>
      <Text style={breakdownStyles.headerLabel}>Concepto</Text>
      <Text style={breakdownStyles.headerTeam}>NS</Text>
      <Text style={breakdownStyles.headerTeam}>EO</Text>
    </View>
  );
}

function BreakdownRow({ label, ns, ew }: { label: string; ns: number; ew: number }) {
  if (ns === 0 && ew === 0) return null;
  return (
    <View style={breakdownStyles.row}>
      <Text style={breakdownStyles.label}>{label}</Text>
      <Text style={[breakdownStyles.value, ns < 0 && breakdownStyles.negative]}>
        {ns > 0 ? '+' : ''}{ns !== 0 ? ns.toLocaleString() : '—'}
      </Text>
      <Text style={[breakdownStyles.value, ew < 0 && breakdownStyles.negative]}>
        {ew > 0 ? '+' : ''}{ew !== 0 ? ew.toLocaleString() : '—'}
      </Text>
    </View>
  );
}

function BreakdownTotal({ ns, ew }: { ns: number; ew: number }) {
  return (
    <View style={breakdownStyles.totalRow}>
      <Text style={breakdownStyles.totalLabel}>TOTAL RONDA</Text>
      <Text style={[breakdownStyles.totalValue, ns < 0 && breakdownStyles.negative, { color: TEAM_NS_COLOR }]}>
        {ns > 0 ? '+' : ''}{ns.toLocaleString()}
      </Text>
      <Text style={[breakdownStyles.totalValue, ew < 0 && breakdownStyles.negative, { color: TEAM_EW_COLOR }]}>
        {ew > 0 ? '+' : ''}{ew.toLocaleString()}
      </Text>
    </View>
  );
}

const breakdownStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
  },
  headerLabel: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  headerTeam: { width: 70, color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textAlign: 'right', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  label: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  value: { width: 70, color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'right' },
  negative: { color: '#e74c3c' },
  totalRow: {
    flexDirection: 'row',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  totalLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: 'bold' },
  totalValue: { width: 70, fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
});

function ProgressTeam({ name, value, color }: { name: string; value: number; color: string }) {
  const pct = Math.min(value / WIN_THRESHOLD, 1);
  return (
    <View style={progressStyles.row}>
      <Text style={[progressStyles.name, { color }]}>{name}</Text>
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={progressStyles.value}>{value.toLocaleString()}</Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  name: { width: 80, fontSize: 12, fontWeight: '600' },
  track: { flex: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  value: { width: 60, color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'right' },
});

// ---------------------------------------------------------------------------
// Screen styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#145a32' },
  scroll: { padding: 16, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 16, gap: 8 },
  roundLabel: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  idaBanner: {
    backgroundColor: 'rgba(39,174,96,0.2)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  idaBannerText: { color: '#2ecc71', fontSize: 14, fontWeight: '600' },
  stockBanner: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  stockBannerText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  teamRow: { flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'stretch' },
  vsLabel: { justifyContent: 'center', alignItems: 'center', width: 24 },
  vsText: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '700' },
  breakdownCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  progressSection: { marginBottom: 16 },
  progressTitle: { color: '#a9dfbf', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  historySection: { marginBottom: 16 },
  historyTitle: { color: '#a9dfbf', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyRound: { width: 28, color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  historyScore: { width: 52, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  historyGlobal: { width: 60, color: '#fff', fontSize: 13, fontWeight: 'bold', textAlign: 'right' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  quitBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  quitBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  nextBtn: {
    flex: 2,
    backgroundColor: '#f39c12',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#f39c12',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
