// =============================================================================
// Home Screen
// =============================================================================

import { useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  Image,
} from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.logo}>🃏</Text>
        <Text style={styles.title}>Canastón</Text>
        <Text style={styles.subtitle}>Juego de canasta para 4 jugadores</Text>
        <View style={styles.divider} />
        <Text style={styles.tagline}>2 equipos · 3 mazos · 15.000 puntos</Text>
      </View>

      {/* Main actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/new-game')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnIcon}>▶</Text>
          <Text style={styles.primaryBtnText}>Nueva Partida</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/rules')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnIcon}>📖</Text>
          <Text style={styles.secondaryBtnText}>Reglas del Juego</Text>
        </TouchableOpacity>
      </View>

      {/* Info strip */}
      <View style={styles.infoStrip}>
        <InfoPill label="4 jugadores" icon="👥" />
        <InfoPill label="Pass & play" icon="📱" />
        <InfoPill label="Modo local" icon="🏠" />
      </View>

      <Text style={styles.version}>v1.0.0 — MVP local</Text>
    </SafeAreaView>
  );
}

function InfoPill({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillIcon}>{icon}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#145a32',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  hero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 72,
    marginBottom: 8,
  },
  title: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#a9dfbf',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1,
    marginVertical: 20,
  },
  tagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  primaryBtn: {
    backgroundColor: '#f39c12',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryBtnIcon: {
    color: '#fff',
    fontSize: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  secondaryBtnIcon: {
    fontSize: 18,
  },
  secondaryBtnText: {
    color: '#a9dfbf',
    fontSize: 16,
    fontWeight: '600',
  },
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillIcon: { fontSize: 13 },
  pillLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  version: {
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    fontSize: 11,
  },
});
