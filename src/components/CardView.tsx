// =============================================================================
// CardView — renders a single playing card
// =============================================================================

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Card } from '../../engine/types';

interface CardViewProps {
  card: Card;
  selected?: boolean;
  faceDown?: boolean;
  onPress?: (card: Card) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

const SIZES = {
  sm: { width: 36, height: 52, rankSize: 11, suitSize: 9 },
  md: { width: 52, height: 72, rankSize: 15, suitSize: 11 },
  lg: { width: 64, height: 90, rankSize: 18, suitSize: 13 },
};

const SUIT_SYMBOL: Record<string, string> = {
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
  spades:   '♠',
};

const SUIT_COLOR: Record<string, string> = {
  hearts:   '#c0392b',
  diamonds: '#c0392b',
  clubs:    '#1a1a2e',
  spades:   '#1a1a2e',
};

function cardDisplay(card: Card): { rank: string; suit: string; color: string; accent: string | null } {
  if (card.category === 'JOKER') {
    return { rank: '★', suit: '', color: '#8e44ad', accent: '🃏' };
  }

  const suitSymbol = card.suit ? SUIT_SYMBOL[card.suit] ?? '' : '';
  const color = card.suit ? (SUIT_COLOR[card.suit] ?? '#1a1a2e') : '#1a1a2e';

  let accent: string | null = null;
  if (card.category === 'HONOR') accent = '🏅';
  else if (card.category === 'TAPA')  accent = '🚫';
  else if (card.category === 'PATO')  accent = '🃏';

  return { rank: card.rank, suit: suitSymbol, color, accent };
}

export default function CardView({
  card,
  selected = false,
  faceDown = false,
  onPress,
  size = 'md',
  disabled = false,
}: CardViewProps) {
  const dim = SIZES[size];

  if (faceDown) {
    return (
      <View style={[styles.card, styles.faceDown, { width: dim.width, height: dim.height }]} />
    );
  }

  const { rank, suit, color, accent } = cardDisplay(card);

  const content = (
    <View
      style={[
        styles.card,
        { width: dim.width, height: dim.height },
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.rank, { fontSize: dim.rankSize, color }]} numberOfLines={1}>
        {rank}
      </Text>
      {suit ? (
        <Text style={[styles.suit, { fontSize: dim.suitSize, color }]}>{suit}</Text>
      ) : null}
      {accent ? (
        <Text style={styles.accent}>{accent}</Text>
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        onPress={() => onPress(card)}
        activeOpacity={0.75}
        accessibilityLabel={`${rank}${suit}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bdc3c7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
    padding: 2,
  },
  faceDown: {
    backgroundColor: '#1a5276',
    borderColor: '#2e86c1',
  },
  selected: {
    borderColor: '#f39c12',
    borderWidth: 2.5,
    transform: [{ translateY: -10 }],
    shadowColor: '#f39c12',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  rank: {
    fontWeight: 'bold',
    lineHeight: 18,
  },
  suit: {
    marginTop: 0,
    lineHeight: 14,
  },
  accent: {
    fontSize: 9,
    marginTop: 1,
  },
});
