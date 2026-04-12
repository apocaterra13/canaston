// =============================================================================
// New Game Screen — enter player names, then launch the game
// =============================================================================

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useGameStore } from '../src/store/gameStore';

const TEAM_NS_COLOR = '#3498db';
const TEAM_EW_COLOR = '#e74c3c';

const PLAYER_CONFIG = [
  { index: 0, team: 'Norte-Sur',   teamColor: TEAM_NS_COLOR, pos: 'Norte',  placeholder: 'Jugador Norte' },
  { index: 1, team: 'Norte-Sur',   teamColor: TEAM_NS_COLOR, pos: 'Sur',    placeholder: 'Jugador Sur' },
  { index: 2, team: 'Este-Oeste',  teamColor: TEAM_EW_COLOR, pos: 'Este',   placeholder: 'Jugador Este' },
  { index: 3, team: 'Este-Oeste',  teamColor: TEAM_EW_COLOR, pos: 'Oeste',  placeholder: 'Jugador Oeste' },
];

export default function NewGameScreen() {
  const router = useRouter();
  const { createNewGame, lastError, clearError } = useGameStore();

  const [names, setNames] = useState<[string, string, string, string]>([
    'Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4',
  ]);
  const [loading, setLoading] = useState(false);

  function updateName(index: number, value: string) {
    setNames((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[index] = value;
      return next;
    });
  }

  async function handleStart() {
    // Validate all names
    for (let i = 0; i < 4; i++) {
      if (!names[i].trim()) {
        Alert.alert('Nombre requerido', `Por favor ingresa el nombre del Jugador ${i + 1}.`);
        return;
      }
    }

    setLoading(true);
    clearError();

    try {
      const trimmed = names.map((n) => n.trim()) as [string, string, string, string];
      createNewGame(trimmed);

      // Check for errors from store
      const storeError = useGameStore.getState().lastError;
      if (storeError) {
        Alert.alert('Error al iniciar', storeError);
        return;
      }

      router.replace('/game');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>¿Quién juega?</Text>
          <Text style={styles.subheading}>
            Ingresa los nombres. Los equipos se asignan automáticamente por sorteo.
          </Text>

          {/* Team NS */}
          <TeamSection
            teamName="Norte-Sur"
            teamColor={TEAM_NS_COLOR}
            players={PLAYER_CONFIG.slice(0, 2)}
            names={names}
            onChangeName={updateName}
          />

          {/* VS divider */}
          <View style={styles.vsDivider}>
            <View style={styles.vsLine} />
            <Text style={styles.vsText}>VS</Text>
            <View style={styles.vsLine} />
          </View>

          {/* Team EW */}
          <TeamSection
            teamName="Este-Oeste"
            teamColor={TEAM_EW_COLOR}
            players={PLAYER_CONFIG.slice(2, 4)}
            names={names}
            onChangeName={updateName}
          />

          {/* Info note */}
          <View style={styles.infoBox}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <Text style={styles.infoText}>
              Los equipos definitivos se deciden por sorteo al comenzar.
              Los 4 jugadores roban una carta; los 2 más altos forman un equipo.
            </Text>
          </View>

          {/* Start button */}
          <TouchableOpacity
            style={[styles.startBtn, loading && styles.startBtnDisabled]}
            onPress={handleStart}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.startBtnText}>
              {loading ? 'Iniciando...' : '🎲 Hacer sorteo e iniciar'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// TeamSection
// ---------------------------------------------------------------------------

interface PlayerCfg {
  index: number;
  team: string;
  teamColor: string;
  pos: string;
  placeholder: string;
}

function TeamSection({
  teamName,
  teamColor,
  players,
  names,
  onChangeName,
}: {
  teamName: string;
  teamColor: string;
  players: PlayerCfg[];
  names: [string, string, string, string];
  onChangeName: (i: number, v: string) => void;
}) {
  return (
    <View style={[styles.teamSection, { borderColor: teamColor }]}>
      <View style={[styles.teamHeader, { backgroundColor: teamColor }]}>
        <Text style={styles.teamHeaderText}>{teamName}</Text>
      </View>
      {players.map((cfg) => (
        <View key={cfg.index} style={styles.playerRow}>
          <View style={[styles.posBadge, { backgroundColor: teamColor }]}>
            <Text style={styles.posText}>{cfg.pos[0]}</Text>
          </View>
          <TextInput
            style={styles.nameInput}
            value={names[cfg.index]}
            onChangeText={(v) => onChangeName(cfg.index, v)}
            placeholder={cfg.placeholder}
            placeholderTextColor="rgba(255,255,255,0.3)"
            maxLength={20}
            returnKeyType="next"
            selectTextOnFocus
          />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#145a32',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subheading: {
    color: '#a9dfbf',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 28,
  },
  teamSection: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginBottom: 12,
  },
  teamHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  teamHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  posBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  nameInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 4,
  },
  vsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 12,
  },
  vsLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  vsText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoIcon: { fontSize: 16 },
  infoText: {
    flex: 1,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
  },
  startBtn: {
    backgroundColor: '#f39c12',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  startBtnDisabled: {
    opacity: 0.6,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
