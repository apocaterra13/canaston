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
  const isMonoMeld   = meld.rank === '2' || meld.rank === 'JOKER';
  const jokerCount   = meld.cards.filter((c) => c.category === 'JOKER').length;
  const patoCount    = meld.cards.filter((c) => c.category === 'PATO').length;
  const wildCount    = jokerCount + patoCount;
  const naturalCount = meld.cards.length - wildCount;
  const color        = rankColor(meld.rank);

  const neededForCanasta = 7 - meld.cards.length;

  const content = (
    <View style={[styles.container, highlighted && styles.highlighted]}>
      {/* Rank badge */}
      <View style={[styles.rankBadge, { borderColor: color }]}>
        <Text style={[styles.rankText, { color }]} numberOfLines={1} adjustsFontSizeToFit>{isMonoMeld ? 'Monos' : meld.rank}</Text>
      </View>

      {/* Composition */}
      <View style={styles.stats}>
        {isMonoMeld ? (
          // Mono meld: show 2s and Jokers separately
          <>
            {patoCount > 0 && (
              <View style={styles.naturalPill}>
                <View style={[styles.cardIcon, styles.patoIcon]}>
                  <Text style={styles.patoIconText}>2</Text>
                </View>
                <Text style={styles.naturalCount}>×{patoCount}</Text>
              </View>
            )}
            {jokerCount > 0 && (
              <Text style={styles.wildBadge}>🃏×{jokerCount}</Text>
            )}
          </>
        ) : (
          // Normal meld: natural count + wild count
          <>
            <View style={styles.naturalPill}>
              <View style={styles.cardIcon} />
              <Text style={styles.naturalCount}>×{naturalCount}</Text>
            </View>
            {wildCount > 0 && (
              <Text style={styles.wildBadge}>🃏×{wildCount}</Text>
            )}
          </>
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
    padding: 10,
    width: 92,
    alignItems: 'center',
    gap: 5,
  },
  highlighted: {
    borderColor: '#f39c12',
    borderWidth: 2,
    backgroundColor: 'rgba(243,156,18,0.12)',
  },
  rankBadge: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#fff',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  rankText: {
    fontWeight: 'bold',
    fontSize: 14,
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
  patoIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patoIconText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#8e44ad',
    lineHeight: 14,
  },
  naturalCount: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  wildBadge: {
    fontSize: 10,
    color: '#fff',
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
