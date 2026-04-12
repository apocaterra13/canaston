// =============================================================================
// HandView — scrollable hand with multi-select
// =============================================================================

import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Card } from '../../engine/types';
import CardView from './CardView';

export interface HandViewRef {
  clearSelection: () => void;
}

// Stable empty set — avoids creating a new Set() instance every render
// when the caller doesn't pass disabledCardIds
const EMPTY_DISABLED_SET = new Set<string>();

interface HandViewProps {
  cards: Card[];
  label?: string;
  faceDown?: boolean;
  maxSelected?: number;
  onSelectionChange?: (selected: Card[]) => void;
  /** IDs of cards that are not selectable (e.g. already used as pilon match) */
  disabledCardIds?: Set<string>;
}

const HandView = forwardRef<HandViewRef, HandViewProps>(function HandView(
  {
    cards,
    label,
    faceDown = false,
    maxSelected = Infinity,
    onSelectionChange,
    disabledCardIds = EMPTY_DISABLED_SET,
  },
  ref,
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    clearSelection() {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    },
  }));

  function toggleCard(card: Card) {
    if (faceDown || disabledCardIds.has(card.id)) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else if (next.size < maxSelected) {
        next.add(card.id);
      }
      const selected = cards.filter((c) => next.has(c.id));
      onSelectionChange?.(selected);
      return next;
    });
  }

  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.count}>{cards.length} cartas</Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        decelerationRate="fast"
      >
        {cards.map((card) => (
          <CardView
            key={card.id}
            card={card}
            faceDown={faceDown}
            selected={selectedIds.has(card.id)}
            disabled={disabledCardIds.has(card.id)}
            onPress={toggleCard}
            size="md"
          />
        ))}
        {cards.length === 0 && (
          <Text style={styles.emptyText}>Sin cartas</Text>
        )}
      </ScrollView>

      {selectedIds.size > 0 && (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => {
            setSelectedIds(new Set());
            onSelectionChange?.([]);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
        >
          <Text style={styles.clearText}>
            ✕ Limpiar selección ({selectedIds.size})
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default HandView;

const styles = StyleSheet.create({
  container: { paddingVertical: 6 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  label: {
    color: '#a9dfbf',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  count: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 5,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  clearBtn: {
    alignSelf: 'center',
    marginTop: 6,
  },
  clearText: {
    color: '#f39c12',
    fontSize: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    alignSelf: 'center',
    marginLeft: 8,
  },
});
