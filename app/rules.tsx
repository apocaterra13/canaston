// =============================================================================
// Rules / Help Screen — reference card for players
// =============================================================================

import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Section = {
  id: string;
  title: string;
  emoji: string;
  content: RuleItem[];
};

type RuleItem =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'row'; label: string; value: string; highlight?: boolean }
  | { type: 'tip'; text: string };

const SECTIONS: Section[] = [
  {
    id: 'objetivo',
    title: 'Objetivo',
    emoji: '🎯',
    content: [
      { type: 'paragraph', text: 'Canastón es un juego de cartas para 4 jugadores (2 equipos). El primer equipo en alcanzar 15.000 puntos gana la partida.' },
      { type: 'row', label: 'Equipos', value: '2 (Norte-Sur vs Este-Oeste)' },
      { type: 'row', label: 'Mazos', value: '3 mazos estándar + 6 jokers = 162 cartas' },
      { type: 'row', label: 'Cartas por jugador', value: '15 cartas' },
      { type: 'row', label: 'Meta', value: '15.000 puntos', highlight: true },
    ],
  },
  {
    id: 'cartas',
    title: 'Valor de Cartas',
    emoji: '🃏',
    content: [
      { type: 'heading', text: 'Puntos por carta' },
      { type: 'row', label: 'Joker (★)', value: '50 pts' },
      { type: 'row', label: '2 (PATO)', value: '20 pts' },
      { type: 'row', label: 'As (A)', value: '20 pts' },
      { type: 'row', label: '8 - K', value: '10 pts' },
      { type: 'row', label: '4 - 7', value: '5 pts' },
      { type: 'row', label: '3 rojo (🏅 HONOR)', value: '0 pts (especial)' },
      { type: 'row', label: '3 negro (🚫 TAPA)', value: '0 pts (especial)' },
      { type: 'heading', text: 'Comodines (Monos)' },
      { type: 'paragraph', text: 'Los Jokers y los 2 son comodines. Pueden sustituir cualquier carta en una jugada, pero hay máximo 2 comodines por jugada.' },
    ],
  },
  {
    id: 'turno',
    title: 'Desarrollo del Turno',
    emoji: '🔄',
    content: [
      { type: 'heading', text: '1. Robar cartas' },
      { type: 'paragraph', text: 'Al inicio de tu turno debes elegir: robar 2 cartas del mazo O tomar todo el pilón.' },
      { type: 'tip', text: 'Si el pilón tiene un TAPA (3 negro) encima, debes robar del mazo obligatoriamente.' },
      { type: 'heading', text: '2. Tomar el Pilón' },
      { type: 'paragraph', text: 'Para tomar el pilón necesitas 2 cartas del mismo rango que la carta superior (3 si es un comodín encima = TRIADO).' },
      { type: 'heading', text: '3. Jugadas (Bajar)' },
      { type: 'paragraph', text: 'Puedes crear nuevas jugadas o agregar cartas a jugadas existentes. Una jugada necesita mínimo 3 cartas del mismo rango con máximo 2 comodines.' },
      { type: 'heading', text: '4. Descartar' },
      { type: 'paragraph', text: 'Para terminar tu turno debes descartar 1 carta al pilón.' },
    ],
  },
  {
    id: 'bajada',
    title: 'Bajada Inicial',
    emoji: '⬇️',
    content: [
      { type: 'paragraph', text: 'La primera vez que un equipo baja cartas a la mesa, debe cumplir un mínimo de puntos según el puntaje global acumulado:' },
      { type: 'row', label: '0 – 2.999 pts',   value: 'Mínimo 50 pts' },
      { type: 'row', label: '3.000 – 4.999',   value: 'Mínimo 90 pts' },
      { type: 'row', label: '5.000 – 7.999',   value: 'Mínimo 120 pts' },
      { type: 'row', label: '8.000 – 9.999',   value: 'Mínimo 160 pts' },
      { type: 'row', label: '10.000 – 11.999', value: 'Mínimo 180 pts' },
      { type: 'row', label: '12.000 – 14.999', value: 'Mínimo 200 pts' },
      { type: 'tip', text: 'Las cartas usadas para tomar el pilón NO cuentan para el puntaje de bajada.' },
    ],
  },
  {
    id: 'canastas',
    title: 'Canastas',
    emoji: '🧺',
    content: [
      { type: 'paragraph', text: 'Una canasta se cierra cuando una jugada llega a exactamente 7 cartas.' },
      { type: 'heading', text: 'Tipos de canasta' },
      { type: 'row', label: '★ Limpia', value: '0 comodines. Máximo valor.' },
      { type: 'row', label: '◈ Sucia', value: '1-2 comodines. Menor valor.' },
      { type: 'row', label: '🃏 Monos', value: '7 comodines (solo Jokers/2).' },
      { type: 'heading', text: 'Puntos base por canasta' },
      { type: 'row', label: 'Joker Limpia', value: '4.000 pts', highlight: true },
      { type: 'row', label: '2 (Pato) Limpia', value: '3.000 pts', highlight: true },
      { type: 'row', label: 'As Limpia', value: '1.000 pts' },
      { type: 'row', label: 'Otras Limpias', value: '500 pts' },
      { type: 'row', label: 'Joker/2 Sucia', value: '2.000 pts' },
      { type: 'row', label: 'As Sucia', value: '500 pts' },
      { type: 'row', label: 'Otras Sucias', value: '300 pts' },
      { type: 'tip', text: 'A los puntos base se suman los puntos de las cartas dentro de la canasta.' },
    ],
  },
  {
    id: 'honores',
    title: 'Honores (3 Rojos 🏅)',
    emoji: '🏅',
    content: [
      { type: 'paragraph', text: 'Al recibir un 3 rojo debes bajarlo inmediatamente a la mesa. Recibes una carta de reemplazo del mazo.' },
      { type: 'heading', text: 'Puntos al final de la ronda' },
      { type: 'row', label: '1 honor', value: '+100 / 0 / -200' },
      { type: 'row', label: '2 honores', value: '+200 / 0 / -400' },
      { type: 'row', label: '3 honores', value: '+600 / 0 / -1.200' },
      { type: 'row', label: '4 honores', value: '+800 / 0 / -1.600' },
      { type: 'row', label: '5 honores', value: '+1.000 / 0 / -2.000' },
      { type: 'row', label: '6 honores', value: '+2.000 / 0 / -4.000' },
      { type: 'paragraph', text: 'El valor depende de tus canastas: Limpia+Sucia = +pts. Solo Limpia = 0. Sin Limpia = -pts.' },
    ],
  },
  {
    id: 'ida',
    title: 'Cerrar la Ronda (Irse)',
    emoji: '🏁',
    content: [
      { type: 'paragraph', text: 'Un jugador puede irse (terminar la ronda) cuando descarta su última carta y su equipo cumple las condiciones:' },
      { type: 'row', label: 'Canasta limpia', value: 'Al menos 1 ✓' },
      { type: 'row', label: 'Canasta sucia', value: 'Al menos 1 ✓' },
      { type: 'row', label: 'Carta descartada', value: 'No puede ser comodín' },
      { type: 'heading', text: 'Bonus por irse' },
      { type: 'row', label: 'Bonus base', value: '+300 pts' },
      { type: 'row', label: 'Con 6+ tapas en mano', value: '+600 pts total', highlight: true },
      { type: 'tip', text: 'Los 3 negros (Tapas) en la mano del jugador que se va valen +5 pts cada uno.' },
    ],
  },
  {
    id: 'puntuacion',
    title: 'Puntuación Final de Ronda',
    emoji: '📊',
    content: [
      { type: 'paragraph', text: 'Al final de cada ronda se cuentan los puntos de cada equipo:' },
      { type: 'row', label: '+ Puntos de canastas', value: 'Base + cartas' },
      { type: 'row', label: '+ Puntos de honores', value: 'Según tabla' },
      { type: 'row', label: '+ Bonus de irse', value: '300 o 600 pts' },
      { type: 'row', label: '+ Sueltas en mesa', value: 'Si tienen canasta limpia' },
      { type: 'row', label: '− Cartas en mano', value: 'Penalización' },
      { type: 'tip', text: 'Las cartas que quedan en la mano son penalización. ¡Baja todo lo que puedas!' },
    ],
  },
];

export default function RulesScreen() {
  const [expanded, setExpanded] = useState<string | null>('objetivo');

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Referencia rápida de las reglas. Toca una sección para expandirla.
        </Text>

        {SECTIONS.map((sec) => (
          <SectionCard
            key={sec.id}
            section={sec}
            expanded={expanded === sec.id}
            onToggle={() => toggle(sec.id)}
          />
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Para el reglamento completo consulta el README del proyecto.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  expanded,
  onToggle,
}: {
  section: Section;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={onToggle}
        activeOpacity={0.75}
      >
        <Text style={styles.cardEmoji}>{section.emoji}</Text>
        <Text style={styles.cardTitle}>{section.title}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          {section.content.map((item, i) => {
            if (item.type === 'paragraph') {
              return (
                <Text key={`${item.type}-${i}`} style={styles.paragraph}>
                  {item.text}
                </Text>
              );
            }
            if (item.type === 'heading') {
              return (
                <Text key={`${item.type}-${i}`} style={styles.sectionHeading}>
                  {item.text}
                </Text>
              );
            }
            if (item.type === 'row') {
              return (
                <View key={`${item.type}-${i}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={[styles.rowValue, item.highlight && styles.rowHighlight]}>
                    {item.value}
                  </Text>
                </View>
              );
            }
            if (item.type === 'tip') {
              return (
                <View key={`${item.type}-${i}`} style={styles.tip}>
                  <Text style={styles.tipIcon}>💡</Text>
                  <Text style={styles.tipText}>{item.text}</Text>
                </View>
              );
            }
            return null;
          })}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#145a32' },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  cardEmoji: { fontSize: 20 },
  cardTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
    gap: 4,
  },
  paragraph: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  sectionHeading: {
    color: '#a9dfbf',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    flex: 1,
  },
  rowValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  rowHighlight: {
    color: '#f9ca24',
  },
  tip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(243,156,18,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#f39c12',
    borderRadius: 4,
    padding: 10,
    marginTop: 6,
    gap: 8,
    alignItems: 'flex-start',
  },
  tipIcon: { fontSize: 14 },
  tipText: {
    flex: 1,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
    textAlign: 'center',
  },
});
