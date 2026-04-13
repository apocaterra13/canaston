// =============================================================================
// MeldView — shows an open meld (in-progress combination on the table)
// Tappable so players can add cards to it.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Meld } from '../../engine/types';

interface MeldViewProps {
  meld: Meld;
  onPress?: (meld: Meld) => void;
  highlighted?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

function rankColor(rank: string): string {
  // Wilds are purple, high-value cards get emphasis
  if (rank === 'JOKER' || rank === '2') return '#8e44ad';
  if (rank === 'A') return '#d4ac0d';
  return '#2c3e50';
}

export default function MeldView({ meld, onPress, highlighted = false }: MeldViewProps) {
  const wildCount    = meld.cards.filter((c) => c.category === 'JOKER' || c.category === 'PATO').length;
  const naturalCount = meld.cards.length - wildCount;
  const color        = rankColor(meld.rank);

  const neededForCanasta = 7 - meld.cards.length;

  const content = (
    <View style={[styles.container, highlighted && styles.highlighted]}>
      {/* Rank badge */}
      <View style={[styles.rankBadge, { borderColor: color }]}>
        <Text style={[styles.rankText, { color }]}>{meld.rank}</Text>
      </View>

      {/* Composition: natural count + wild count */}
      <View style={styles.stats}>
        <View style={styles.naturalPill}>
          <View style={styles.cardIcon} />
          <Text style={styles.naturalCount}>×{naturalCount}</Text>
        </View>
        {wildCount > 0 && (
          <Text style={styles.wildBadge}>🃏×{wildCount}</Text>
        )}
      </View>

      {/* Progress to canasta */}
      <View style={styles.progressRow}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < meld.cards.length ? styles.dotFilled : styles.dotEmpty,
            ]}
          />
        ))}
      </View>

      <Text style={styles.hint}>
        {neededForCanasta > 0 ? `Faltan ${neededForCanasta}` : '¡Lista!'}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(meld)} activeOpacity={0.75}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 8,
    width: 82,
    alignItems: 'center',
    gap: 4,
  },
  highlighted: {
    borderColor: '#f39c12',
    borderWidth: 2,
    backgroundColor: 'rgba(243,156,18,0.12)',
  },
  rankBadge: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#fff',
  },
  rankText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  naturalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardIcon: {
    width: 10,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  naturalCount: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  wildBadge: {
    fontSize: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotFilled: {
    backgroundColor: '#2ecc71',
  },
  dotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
  },
});
