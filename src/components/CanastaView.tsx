// =============================================================================
// CanastaView — shows a closed canasta badge on the table
// =============================================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Canasta } from '../../engine/types';
import { canastaBaseScore } from '../../engine';

interface CanastaViewProps {
  canasta: Canasta;
  onPress?: (canasta: Canasta) => void;
  highlighted?: boolean;
}

const TYPE_CONFIG = {
  LIMPIA: { color: '#e74c3c', bg: 'rgba(231,76,60,0.15)', textColor: '#fff' },
  SUCIA:  { color: '#2c3e50', bg: 'rgba(44,62,80,0.35)',  textColor: '#fff' },
};

/**
 * For a closed canasta, returns the symbol(s) to display in the rank area.
 *
 * Normal canastas:
 *   LIMPIA → rank + ♥ (red)
 *   SUCIA  → rank + ♣ (dark)
 *
 * Mono canastas (three sub-cases):
 *   Patos limpia  — all 2s (no jokers)  → "2" + ♥ (red)
 *   Jokers limpia — 6 jokers + 1 pato   → 🃏 (joker emoji only)
 *   Monos sucia   — any other mix        → "2" + ♣ (dark)
 */
/** Mono canastas resolve to LIMPIA or SUCIA for display purposes. */
function monoDisplayType(canasta: Canasta): 'LIMPIA' | 'SUCIA' {
  const jokerCount = canasta.cards.filter((c) => c.category === 'JOKER').length;
  const patoCount  = canasta.cards.filter((c) => c.category === 'PATO').length;
  // Patos limpia (all 2s) or jokers limpia (6 jokers + 1 pato)
  if (patoCount === canasta.cards.length) return 'LIMPIA';
  if (jokerCount === 6 && patoCount === 1) return 'LIMPIA';
  return 'SUCIA';
}

function getDisplayType(canasta: Canasta): 'LIMPIA' | 'SUCIA' {
  if (canasta.type === 'MONO') return monoDisplayType(canasta);
  return canasta.type as 'LIMPIA' | 'SUCIA';
}

function getRankDisplay(canasta: Canasta, displayType: 'LIMPIA' | 'SUCIA'): {
  rank: string;
  suit: string;
  suitColor: string;
} {
  if (canasta.type === 'MONO') {
    const jokerCount = canasta.cards.filter((c) => c.category === 'JOKER').length;
    const patoCount  = canasta.cards.filter((c) => c.category === 'PATO').length;

    if (patoCount === canasta.cards.length) {
      return { rank: '2', suit: '♥', suitColor: '#e74c3c' };
    }
    if (jokerCount === 6 && patoCount === 1) {
      return { rank: '🃏', suit: '', suitColor: '#fff' };
    }
    return { rank: '2', suit: '♣', suitColor: '#fff' };
  }

  if (displayType === 'LIMPIA') {
    return { rank: canasta.rank, suit: '♥', suitColor: '#e74c3c' };
  }
  return { rank: canasta.rank, suit: '♣', suitColor: '#fff' };
}

export default function CanastaView({ canasta, onPress, highlighted = false }: CanastaViewProps) {
  const displayType = getDisplayType(canasta);
  const cfg         = TYPE_CONFIG[displayType];
  const isClean     = canasta.type === 'LIMPIA';
  const total       = canastaBaseScore(canasta.rank, isClean);
  const burnCount   = canasta.burned.length;
  const display     = getRankDisplay(canasta, displayType);
  const badgeLabel  = displayType === 'LIMPIA' ? 'LIMPIA' : 'SUCIA';

  const content = (
    <View
      style={[
        styles.container,
        { borderColor: cfg.color, backgroundColor: cfg.bg },
        highlighted && styles.highlighted,
      ]}
    >
      {/* Type badge */}
      <View style={[styles.typeBadge, { backgroundColor: cfg.color }]}>
        <Text style={styles.typeText}>{badgeLabel}</Text>
      </View>

      {/* Rank + suit symbol */}
      <View style={styles.rankRow}>
        <Text style={[styles.rank, { color: cfg.textColor }]}>{display.rank}</Text>
        {display.suit !== '' && (
          <Text style={[styles.suit, { color: display.suitColor }]}>{display.suit}</Text>
        )}
      </View>

      {/* Closed/open indicator */}
      <Text style={styles.status}>
        {canasta.closed ? '🔒' : `${canasta.cards.length}/7`}
      </Text>

      {/* Points */}
      <Text style={styles.points}>{total.toLocaleString()} pts</Text>

      {/* Burned cards indicator */}
      {burnCount > 0 && (
        <Text style={styles.burned}>+{burnCount} quemadas</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(canasta)} activeOpacity={0.75}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 6,
    width: 72,
    alignItems: 'center',
    gap: 2,
  },
  highlighted: {
    borderWidth: 3,
    shadowColor: '#f39c12',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 8,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  typeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  rank: {
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  suit: {
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  status: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  points: {
    color: '#f9ca24',
    fontSize: 11,
    fontWeight: '700',
  },
  burned: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
  },
});
