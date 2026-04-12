// =============================================================================
// CanastaView — shows a closed canasta badge on the table
// =============================================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Canasta } from '../../engine/types';
import { canastaBaseScore, sumCardPoints } from '../../engine';

interface CanastaViewProps {
  canasta: Canasta;
  onPress?: (canasta: Canasta) => void;
  highlighted?: boolean;
}

const TYPE_CONFIG = {
  LIMPIA: { label: 'LIMPIA', color: '#27ae60', bg: 'rgba(39,174,96,0.15)', icon: '★' },
  SUCIA:  { label: 'SUCIA',  color: '#f39c12', bg: 'rgba(243,156,18,0.15)', icon: '◈' },
  MONO:   { label: 'MONOS',  color: '#8e44ad', bg: 'rgba(142,68,173,0.15)', icon: '🃏' },
};

export default function CanastaView({ canasta, onPress, highlighted = false }: CanastaViewProps) {
  const cfg = TYPE_CONFIG[canasta.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG['LIMPIA'];
  const isClean = canasta.type === 'LIMPIA';
  const baseScore = canastaBaseScore(canasta.rank, isClean);
  const cardPts   = sumCardPoints(canasta.cards) + sumCardPoints(canasta.burned);
  const total     = baseScore + cardPts;
  const burnCount = canasta.burned.length;

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
        <Text style={styles.typeText}>{cfg.icon} {cfg.label}</Text>
      </View>

      {/* Rank */}
      <Text style={[styles.rank, { color: cfg.color }]}>{canasta.rank}</Text>

      {/* Closed/open indicator */}
      <Text style={styles.status}>
        {canasta.closed ? '🔒 Cerrada' : `${canasta.cards.length}/7`}
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
    padding: 8,
    width: 88,
    alignItems: 'center',
    gap: 3,
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
  rank: {
    fontSize: 20,
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
