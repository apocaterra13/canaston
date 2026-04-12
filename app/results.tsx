import { useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  ScrollView,
} from 'react-native';

/**
 * Results Screen — shown after CONTEO_FINAL.
 * TODO: Receive RoundScoreBreakdown[] from navigation params and render it.
 */
export default function ResultsScreen() {
  const router = useRouter();

  // Placeholder data matching the example in readme section 13.4
  const breakdown = [
    { label: 'Canastas', ns: 1205, eo: 0 },
    { label: 'Honores', ns: 600, eo: -200 },
    { label: 'Bonificación Ida', ns: 300, eo: 0 },
    { label: 'Mano (penalización)', ns: -30, eo: -80 },
    { label: 'TOTAL RONDA', ns: 2075, eo: -280 },
  ];

  const globalNS = 2075;
  const globalEO = 0;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Fin de Ronda</Text>

      {/* Team headers */}
      <View style={styles.teamRow}>
        <View style={styles.teamHeaderLeft}>
          <Text style={styles.teamName}>Norte-Sur</Text>
          <Text style={styles.globalScore}>{globalNS.toLocaleString()} pts</Text>
        </View>
        <View style={styles.teamHeaderRight}>
          <Text style={styles.teamName}>Este-Oeste</Text>
          <Text style={styles.globalScore}>{globalEO.toLocaleString()} pts</Text>
        </View>
      </View>

      {/* Score breakdown */}
      <ScrollView style={styles.breakdown}>
        {breakdown.map((row, i) => (
          <View key={row.label} style={[styles.row, i === breakdown.length - 1 && styles.totalRow]}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={[styles.rowValue, row.ns < 0 && styles.negative]}>{row.ns > 0 ? '+' : ''}{row.ns}</Text>
            <Text style={[styles.rowValue, row.eo < 0 && styles.negative]}>{row.eo > 0 ? '+' : ''}{row.eo}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Progress to 15,000 */}
      <View style={styles.progressArea}>
        <Text style={styles.progressLabel}>Objetivo: 15.000 pts</Text>
        <ProgressBar value={globalNS} max={15000} color="#3498db" />
        <ProgressBar value={globalEO} max={15000} color="#e74c3c" />
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => router.replace('/')}>
          <Text style={styles.btnSecondaryText}>Abandonar partida</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => router.replace('/game')}>
          <Text style={styles.btnPrimaryText}>Siguiente ronda →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#145a32', padding: 20 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  teamHeaderLeft: { alignItems: 'flex-start' },
  teamHeaderRight: { alignItems: 'flex-end' },
  teamName: { color: '#a9dfbf', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  globalScore: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  breakdown: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  totalRow: {
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.3)',
    borderBottomWidth: 0,
    marginTop: 4,
  },
  rowLabel: { flex: 1, color: '#dfe6e9', fontSize: 14 },
  rowValue: { color: '#fff', fontSize: 14, fontWeight: '600', width: 70, textAlign: 'right' },
  negative: { color: '#e74c3c' },
  progressArea: { marginBottom: 20 },
  progressLabel: { color: '#a9dfbf', fontSize: 12, marginBottom: 6, textAlign: 'center' },
  progressTrack: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: { height: 12, borderRadius: 6 },
  buttons: { flexDirection: 'row', gap: 12 },
  btnPrimary: {
    flex: 2,
    backgroundColor: '#f39c12',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondaryText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
});
