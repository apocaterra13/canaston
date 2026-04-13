// =============================================================================
// Game Screen — main gameplay board (pass & play, 4 players, 1 device)
// =============================================================================

import React, { useRef, useState, useEffect } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useGameStore } from '../src/store/gameStore';
import type { Card, Canasta, Meld, Team } from '../engine/types';
import CardView from '../src/components/CardView';
import HandView, { HandViewRef } from '../src/components/HandView';
import MeldView from '../src/components/MeldView';
import CanastaView from '../src/components/CanastaView';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_NS_COLOR = '#3498db';
const TEAM_EW_COLOR = '#e74c3c';

const PHASE_LABELS: Record<string, string> = {
  WAITING_DRAW:     'Roba del mazo o toma el pilón',
  DRAWN_FROM_STOCK: 'Juega cartas o descarta',
  TOOK_PILON:       'Tienes el pilón — juega o descarta',
  MUST_DISCARD:     'Debes descartar una carta',
};

// ---------------------------------------------------------------------------
// Game Screen
// ---------------------------------------------------------------------------

type ActionModal =
  | null
  | 'take_pilon'
  | 'lay_meld'
  | 'add_to_meld'
  | 'add_to_canasta'
  | 'bajada_confirm';

export default function GameScreen() {
  const router = useRouter();
  const store  = useGameStore();

  // Local UI state
  const [selectedCards, setSelectedCards]       = useState<Card[]>([]);
  const [actionModal, setActionModal]           = useState<ActionModal>(null);
  // selectedMeldId / selectedCanastaId were declared but never used — removed
  const [bajadaPending, setBajadaPending]       = useState(false);
  const handRef = useRef<HandViewRef>(null);

  const { game, handVisible, passDeviceVisible, lastError } = store;

  // ---------------------------------------------------------------------------
  // Guard: if no game, go home
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!game) router.replace('/');
  }, [game, router]);

  // ---------------------------------------------------------------------------
  // Clear error if shown
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (lastError) {
      Alert.alert('Error', lastError, [{ text: 'OK', onPress: store.clearError }]);
    }
  }, [lastError, store]);

  if (!game) return null;

  // ---------------------------------------------------------------------------
  // Derived state from store
  // ---------------------------------------------------------------------------
  const round         = game.round;
  const turn          = game.turn;
  const phase         = turn?.phase ?? null;
  const currentPlayer = turn ? game.players[turn.playerId] : null;
  const currentTeamId = turn ? game.playerTeam[turn.playerId] : null;
  const currentTeam   = currentTeamId ? game.teams[currentTeamId] : null;
  const teamNS        = game.teams['TEAM_NS'];
  const teamEW        = game.teams['TEAM_EW'];

  const pilonCards    = round?.pilon ?? [];
  const pilonTop      = pilonCards.length > 0 ? pilonCards[pilonCards.length - 1] : null;
  const pilonState    = round?.pilonState ?? 'EMPTY';
  const stockCount    = round?.stock?.length ?? 0;
  const tapaActive    = round?.tapaActive ?? false;

  const hasBajado     = currentTeam?.hasBajado ?? false;
  const bajadaMin     = store.getBajadaMinForCurrentTeam();
  const matchesNeeded = store.getPilonMatchesNeeded();
  const newCardIds    = new Set((game.turn?.drawnCards ?? []).map((c) => c.id));

  // Can take pilon: not empty, not TAPA, and after drawing have relevant cards
  const canTakePilon = pilonState !== 'EMPTY' && pilonState !== 'TAPA' && !tapaActive && phase === 'WAITING_DRAW';
  const canDraw      = phase === 'WAITING_DRAW' && stockCount > 0;
  const hasDrawn     = phase === 'DRAWN_FROM_STOCK' || phase === 'TOOK_PILON';

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  function clearSelection() {
    setSelectedCards([]);
    handRef.current?.clearSelection();
  }

  function handleDrawFromStock() {
    const result = store.playerDrawFromStock();
    if (!result.ok) return;
    clearSelection();
  }

  function handleOpenTakePilon() {
    if (!pilonTop) return;
    setActionModal('take_pilon');
  }

  function handleConfirmTakePilon(matchCards: Card[], additionalGroups: Card[][]) {
    const matchIds = matchCards.map((c) => c.id);
    const additionalMeldGroups = additionalGroups.map((g) => g.map((c) => c.id));
    const result = store.playerTakePilon(matchIds, additionalMeldGroups);
    if (result.ok) {
      setActionModal(null);
      clearSelection();
    }
  }

  function handleLayMeld() {
    if (selectedCards.length < 3) {
      Alert.alert('Selecciona cartas', 'Necesitas al menos 3 cartas del mismo rango.');
      return;
    }
    const isFirstBajada = !hasBajado;
    const cardIds = selectedCards.map((c) => c.id);
    const result = store.playerLayMeld(cardIds, isFirstBajada);
    if (result.ok) {
      if (isFirstBajada) setBajadaPending(true);
      clearSelection();
    }
  }

  function handleCommitBajada() {
    const result = store.playerCommitBajada();
    if (result.ok) {
      setBajadaPending(false);
      Alert.alert(
        '¡Bajada confirmada!',
        `Pusiste ${result.data.totalPoints} pts (mínimo: ${result.data.minimum} pts).`,
      );
    }
  }

  function handleAddToMeld(meld: Meld) {
    if (selectedCards.length === 0) {
      Alert.alert('Selecciona cartas', 'Primero selecciona cartas de tu mano.');
      return;
    }
    const cardIds = selectedCards.map((c) => c.id);
    const result = store.playerAddToMeld(meld.id, cardIds);
    if (result.ok) {
      clearSelection();
      if (result.data.closed) {
        Alert.alert('🧺 ¡Canasta!', `Cerraste una canasta de ${meld.rank}!`);
      }
    }
  }

  function handleAddToCanasta(canasta: Canasta) {
    if (selectedCards.length === 0) {
      Alert.alert('Selecciona cartas', 'Primero selecciona cartas de tu mano.');
      return;
    }
    const cardIds = selectedCards.map((c) => c.id);
    const result = store.playerAddToCanasta(canasta.id, cardIds);
    if (result.ok) clearSelection();
  }

  function handleDiscard() {
    if (selectedCards.length !== 1) {
      Alert.alert('Descarte', 'Selecciona exactamente 1 carta para descartar.');
      return;
    }
    const cardId = selectedCards[0].id;
    const result = store.playerDiscard(cardId);
    if (result.ok) {
      clearSelection();
      setBajadaPending(false);
      if (result.data.roundEnded) {
        // Finalize round then navigate
        const finalResult = store.playerFinalizeRound();
        if (finalResult.ok) {
          if (finalResult.data.gameOver) {
            router.replace('/final-result');
          } else {
            router.replace('/round-summary');
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pass device modal handler
  // ---------------------------------------------------------------------------
  function handlePassDeviceAck() {
    store.acknowledgePassDevice();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderTeamTable(team: Team, label: string, color: string) {
    const table = team.table;
    const isEmpty = table.melds.length === 0 && table.canastas.length === 0 && table.honors.length === 0;

    return (
      <View style={styles.teamTableSection}>
        <View style={styles.teamTableHeader}>
          <View style={[styles.teamDot, { backgroundColor: color }]} />
          <Text style={[styles.teamTableLabel, { color }]}>{label}</Text>
          {!team.hasBajado && (
            <View style={styles.noBajadaBadge}>
              <Text style={styles.noBajadaText}>Sin bajada</Text>
            </View>
          )}
          {team.monoObligado && (
            <View style={styles.monoObligadoBadge}>
              <Text style={styles.monoObligadoText}>🃏 Mono obl.</Text>
            </View>
          )}
        </View>

        {/* Honors */}
        {table.honors.length > 0 && (
          <View style={styles.honorsRow}>
            <Text style={styles.honorsLabel}>🏅 Honores: {table.honors.length}</Text>
          </View>
        )}

        {isEmpty ? (
          <Text style={styles.emptyTable}>Mesa vacía</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableItems}
          >
            {table.melds.map((meld) => (
              <MeldView
                key={meld.id}
                meld={meld}
                onPress={hasDrawn ? handleAddToMeld : undefined}
                highlighted={selectedCards.length > 0 && hasDrawn}
              />
            ))}
            {table.canastas.map((canasta) => (
              <CanastaView
                key={canasta.id}
                canasta={canasta}
                onPress={hasDrawn ? handleAddToCanasta : undefined}
                highlighted={selectedCards.length > 0 && hasDrawn && canasta.closed}
              />
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Pass Device Modal ─────────────────────────────────────────── */}
      <Modal
        visible={passDeviceVisible}
        animationType="fade"
        transparent={false}
      >
        <SafeAreaView style={styles.passModal}>
          <Text style={styles.passModalEmoji}>📱</Text>
          <Text style={styles.passModalTitle}>Pasa el dispositivo</Text>
          <Text style={styles.passModalPlayerName}>
            {currentPlayer?.name ?? 'Siguiente jugador'}
          </Text>
          <Text style={styles.passModalInstruction}>
            Es tu turno. Cuando tengas el dispositivo, toca el botón.
          </Text>

          {/* Show team and round info */}
          <View style={styles.passModalInfo}>
            <Text style={styles.passModalInfoText}>
              Equipo: {currentTeam?.name ?? '—'}
            </Text>
            <Text style={styles.passModalInfoText}>
              Ronda: {round?.roundNumber ?? 1}
            </Text>
            <Text style={styles.passModalInfoText}>
              {!hasBajado ? `Bajada mín: ${bajadaMin} pts` : '✓ Ya bajaron'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.passModalBtn}
            onPress={handlePassDeviceAck}
            activeOpacity={0.85}
          >
            <Text style={styles.passModalBtnText}>Listo — Ver mi mano 👁</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* ── Take Pilon Modal ──────────────────────────────────────────── */}
      {pilonTop && (
        <TakePilonModal
          visible={actionModal === 'take_pilon'}
          pilonTop={pilonTop}
          pilonState={pilonState}
          playerHand={currentPlayer?.hand ?? []}
          matchesNeeded={matchesNeeded}
          hasBajado={hasBajado}
          bajadaMin={bajadaMin}
          onConfirm={handleConfirmTakePilon}
          onCancel={() => setActionModal(null)}
        />
      )}

      {/* ── Scoreboard ───────────────────────────────────────────────── */}
      <View style={styles.scoreboard}>
        <ScoreChip
          label={teamNS?.name ?? 'Norte-Sur'}
          score={teamNS?.globalScore ?? 0}
          color={TEAM_NS_COLOR}
        />
        <View style={styles.roundInfo}>
          <Text style={styles.roundText}>Ronda {round?.roundNumber ?? 1}</Text>
          <Text style={styles.stockText}>📦 {stockCount}</Text>
        </View>
        <ScoreChip
          label={teamEW?.name ?? 'Este-Oeste'}
          score={teamEW?.globalScore ?? 0}
          color={TEAM_EW_COLOR}
        />
      </View>

      {/* ── Table (scrollable) ───────────────────────────────────────── */}
      <ScrollView style={styles.tableArea} contentContainerStyle={styles.tableContent}>

        {/* NS Team Table */}
        {teamNS && renderTeamTable(teamNS, teamNS.name, TEAM_NS_COLOR)}

        {/* Pilon + Stock */}
        <View style={styles.pilonStockRow}>
          {/* Stock */}
          <View style={styles.stockPile}>
            <View style={styles.stackedCards}>
              <View style={[styles.cardBack, { position: 'absolute', top: 4, left: 4 }]} />
              <View style={[styles.cardBack, { position: 'absolute', top: 2, left: 2 }]} />
              <View style={styles.cardBack} />
            </View>
            <Text style={styles.pileLabel}>Mazo</Text>
            <Text style={styles.pileCount}>{stockCount}</Text>
          </View>

          {/* Pilon info */}
          <View style={styles.pilonCenter}>
            <Text style={styles.pilonArrow}>→</Text>
            {pilonState === 'TAPA' && (
              <View style={styles.tapaBanner}>
                <Text style={styles.tapaBannerText}>🚫 TAPA activa</Text>
              </View>
            )}
            {pilonState === 'TRIADO' && (
              <View style={styles.triadoBanner}>
                <Text style={styles.triadoBannerText}>⚠️ TRIADO — 3 cartas</Text>
              </View>
            )}
            <Text style={styles.pilonSizeText}>{pilonCards.length} en pilón</Text>
          </View>

          {/* Pilon top card */}
          <View style={styles.pilonPile}>
            <Text style={styles.pileLabel}>Pilón</Text>
            {pilonTop ? (
              <CardView card={pilonTop} size="lg" />
            ) : (
              <View style={styles.pilonEmpty}>
                <Text style={styles.pilonEmptyText}>Vacío</Text>
              </View>
            )}
          </View>
        </View>

        {/* EW Team Table */}
        {teamEW && renderTeamTable(teamEW, teamEW.name, TEAM_EW_COLOR)}

        {/* Spacer for hand area */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Current Player Banner ────────────────────────────────────── */}
      <View style={[styles.playerBanner, { borderTopColor: currentTeamId === 'TEAM_NS' ? TEAM_NS_COLOR : TEAM_EW_COLOR }]}>
        <View style={styles.playerBannerLeft}>
          <Text style={styles.playerBannerName}>{currentPlayer?.name ?? '—'}</Text>
          <Text style={styles.playerBannerPhase}>
            {phase ? PHASE_LABELS[phase] : ''}
          </Text>
        </View>
        {!hasBajado && (
          <View style={styles.bajadaMinBadge}>
            <Text style={styles.bajadaMinText}>Min {bajadaMin} pts</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.rulesBtn}
          onPress={() => router.push('/rules')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.rulesBtnText}>📖</Text>
        </TouchableOpacity>
      </View>

      {/* ── Hand Area ────────────────────────────────────────────────── */}
      <View style={styles.handArea}>
        {!handVisible ? (
          <TouchableOpacity
            style={styles.showHandBtn}
            onPress={store.showHand}
            activeOpacity={0.85}
          >
            <Text style={styles.showHandBtnText}>👁 Mostrar mi mano</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.handWithHideBtn}>
            <HandView
              ref={handRef}
              cards={currentPlayer?.hand ?? []}
              label={currentPlayer?.name}
              onSelectionChange={setSelectedCards}
              newCardIds={newCardIds}
            />
            <TouchableOpacity
              style={styles.hideHandBtn}
              onPress={store.hideHand}
              activeOpacity={0.75}
            >
              <Text style={styles.hideHandBtnText}>🙈 Ocultar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Action Buttons ───────────────────────────────────────────── */}
      {handVisible && (
        <View style={styles.actionBar}>
          {/* WAITING_DRAW phase */}
          {phase === 'WAITING_DRAW' && (
            <>
              <ActionBtn
                label="Robar del mazo"
                icon="📦"
                color="#27ae60"
                disabled={!canDraw}
                onPress={handleDrawFromStock}
              />
              <ActionBtn
                label={pilonState === 'TRIADO' ? `Tomar pilón\n(3 iguales)` : 'Tomar pilón'}
                icon="🃏"
                color="#2980b9"
                disabled={!canTakePilon}
                onPress={handleOpenTakePilon}
              />
            </>
          )}

          {/* After drawing */}
          {hasDrawn && (
            <>
              {/* Bajada pending — must confirm or add more */}
              {bajadaPending && !hasBajado && (
                <ActionBtn
                  label={`Confirmar\nbajada`}
                  icon="✅"
                  color="#8e44ad"
                  disabled={false}
                  onPress={handleCommitBajada}
                />
              )}

              {/* Lay new meld — needs 3+ selected cards */}
              <ActionBtn
                label={selectedCards.length >= 3 ? `Jugada\n(${selectedCards.length})` : 'Nueva jugada'}
                icon="🃏"
                color="#16a085"
                disabled={selectedCards.length < 3}
                onPress={handleLayMeld}
              />

              {/* Discard — needs exactly 1 selected card */}
              <ActionBtn
                label="Descartar"
                icon="🗑"
                color="#c0392b"
                disabled={selectedCards.length !== 1 || (bajadaPending && !hasBajado)}
                onPress={handleDiscard}
              />
            </>
          )}

          {/* Hint when no action available */}
          {!phase && (
            <Text style={styles.waitText}>Esperando…</Text>
          )}
        </View>
      )}

      {/* Instruction hint when hand is visible but nothing selected */}
      {handVisible && selectedCards.length === 0 && hasDrawn && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            Toca cartas para seleccionarlas · Toca jugadas en mesa para agregar
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Take Pilon Modal
// ---------------------------------------------------------------------------

function TakePilonModal({
  visible,
  pilonTop,
  pilonState,
  playerHand,
  matchesNeeded,
  hasBajado,
  bajadaMin,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  pilonTop: Card;
  pilonState: string;
  playerHand: Card[];
  matchesNeeded: number;
  hasBajado: boolean;
  bajadaMin: number;
  onConfirm: (matchCards: Card[], additionalGroups: Card[][]) => void;
  onCancel: () => void;
}) {
  // Match-card selection (mandatory meld with pilon top)
  const [selected, setSelected] = useState<Card[]>([]);

  // Additional meld groups (required when team hasn't bajado)
  // Each group is a set of cards the player is staging as a new meld
  const [additionalGroups, setAdditionalGroups] = useState<Card[][]>([]);
  const [stagingGroup, setStagingGroup] = useState<Card[]>([]);

  // IDs already claimed (match cards + finalized groups + staging group)
  const claimedIds = new Set<string>([
    ...selected.map((c) => c.id),
    ...additionalGroups.flat().map((c) => c.id),
    ...stagingGroup.map((c) => c.id),
  ]);

  // Cards eligible for matching the pilon top
  const matchableCards = playerHand.filter(
    (c) => c.rank === pilonTop.rank && c.category !== 'JOKER' && c.category !== 'PATO',
  );

  // Cards available for additional melds (everything not yet claimed, excluding match candidates
  // that are already selected as match cards)
  const availableForMelds = playerHand.filter((c) => !claimedIds.has(c.id));

  // Point totals — only additional melds count toward the bajada minimum.
  // The match cards are the "entry fee" to take the pilon and don't count.
  const additionalPts = additionalGroups.flat().reduce((s, c) => s + c.points, 0);

  const matchOk = selected.length >= matchesNeeded;
  const bajadaOk = hasBajado || additionalPts >= bajadaMin;
  const canConfirm = matchOk && bajadaOk;

  function addStagingGroup() {
    if (stagingGroup.length >= 3) {
      setAdditionalGroups((prev) => [...prev, stagingGroup]);
      setStagingGroup([]);
    }
  }

  function removeGroup(idx: number) {
    setAdditionalGroups((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetAll() {
    setSelected([]);
    setAdditionalGroups([]);
    setStagingGroup([]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <ScrollView contentContainerStyle={modalStyles.sheetScroll}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Tomar el Pilón</Text>
            <Text style={modalStyles.subtitle}>
              {pilonState === 'TRIADO'
                ? `El pilón tiene un comodín encima. Necesitas ${matchesNeeded} cartas del mismo rango.`
                : `Selecciona ${matchesNeeded} cartas de rango ${pilonTop.rank} de tu mano.`}
            </Text>

            {/* Pilon top card */}
            <View style={modalStyles.topCardRow}>
              <Text style={modalStyles.topCardLabel}>Carta encima del pilón:</Text>
              <CardView card={pilonTop} size="md" />
            </View>

            {/* Match cards */}
            {matchableCards.length === 0 ? (
              <Text style={modalStyles.noCardsText}>
                No tienes cartas de rango {pilonTop.rank} para tomar el pilón.
              </Text>
            ) : (
              <>
                <Text style={modalStyles.selectLabel}>
                  Tus cartas de {pilonTop.rank} ({selected.length}/{matchesNeeded} seleccionadas):
                </Text>
                <ScrollView horizontal contentContainerStyle={modalStyles.cardRow}>
                  {matchableCards.map((c) => (
                    <CardView
                      key={c.id}
                      card={c}
                      size="lg"
                      selected={selected.some((s) => s.id === c.id)}
                      disabled={claimedIds.has(c.id) && !selected.some((s) => s.id === c.id)}
                      onPress={(card) => {
                        setSelected((prev) => {
                          const already = prev.find((s) => s.id === card.id);
                          if (already) return prev.filter((s) => s.id !== card.id);
                          if (prev.length < matchesNeeded) return [...prev, card];
                          return prev;
                        });
                      }}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── Bajada section — only shown when team hasn't bajado yet ── */}
            {!hasBajado && (
              <>
                <View style={pilonModalStyles.divider} />
                <Text style={pilonModalStyles.bajadaTitle}>
                  Bajada obligatoria — mín. {bajadaMin} pts
                </Text>

                {/* Point progress — match cards don't count, only additional melds */}
                <View style={pilonModalStyles.progressRow}>
                  <Text style={pilonModalStyles.progressLabel}>
                    Las cartas de la jugada NO suman puntos de bajada.
                  </Text>
                  <Text style={[
                    pilonModalStyles.progressTotal,
                    additionalPts >= bajadaMin ? pilonModalStyles.progressOk : pilonModalStyles.progressShort,
                  ]}>
                    Melds adicionales: {additionalPts} / {bajadaMin} pts
                  </Text>
                </View>

                {/* Finalized additional groups */}
                {additionalGroups.map((group, idx) => (
                  <View key={idx} style={pilonModalStyles.groupRow}>
                    <Text style={pilonModalStyles.groupLabel}>
                      Meld {idx + 1} ({group.reduce((s, c) => s + c.points, 0)} pts):
                    </Text>
                    <ScrollView horizontal contentContainerStyle={modalStyles.cardRow}>
                      {group.map((c) => (
                        <CardView key={c.id} card={c} size="sm" />
                      ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => removeGroup(idx)} style={pilonModalStyles.removeGroupBtn}>
                      <Text style={pilonModalStyles.removeGroupText}>✕ Quitar</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Staging a new group */}
                <Text style={pilonModalStyles.stagingLabel}>
                  Agregar meld adicional ({stagingGroup.length} carta{stagingGroup.length !== 1 ? 's' : ''}):
                </Text>
                {availableForMelds.length > 0 && (
                  <ScrollView horizontal contentContainerStyle={modalStyles.cardRow}>
                    {availableForMelds.map((c) => (
                      <CardView
                        key={c.id}
                        card={c}
                        size="md"
                        selected={stagingGroup.some((s) => s.id === c.id)}
                        onPress={(card) => {
                          setStagingGroup((prev) => {
                            const already = prev.find((s) => s.id === card.id);
                            return already
                              ? prev.filter((s) => s.id !== card.id)
                              : [...prev, card];
                          });
                        }}
                      />
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={[pilonModalStyles.addGroupBtn, stagingGroup.length < 3 && modalStyles.confirmBtnDisabled]}
                  onPress={addStagingGroup}
                  disabled={stagingGroup.length < 3}
                >
                  <Text style={pilonModalStyles.addGroupText}>
                    + Confirmar meld ({stagingGroup.length} cartas)
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={modalStyles.btnRow}>
              <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => { resetAll(); onCancel(); }}>
                <Text style={modalStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.confirmBtn, !canConfirm && modalStyles.confirmBtnDisabled]}
                onPress={() => {
                  if (canConfirm) {
                    onConfirm(selected, additionalGroups);
                    resetAll();
                  }
                }}
                disabled={!canConfirm}
              >
                <Text style={modalStyles.confirmText}>Tomar pilón ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const pilonModalStyles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 12,
  },
  bajadaTitle: {
    color: '#9b59b6',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 4,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  progressTotal: {
    fontWeight: '700',
    fontSize: 13,
  },
  progressOk: { color: '#2ecc71' },
  progressShort: { color: '#e74c3c' },
  groupRow: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  groupLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 4,
  },
  removeGroupBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  removeGroupText: {
    color: '#e74c3c',
    fontSize: 12,
  },
  stagingLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  addGroupBtn: {
    backgroundColor: '#2980b9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 4,
  },
  addGroupText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreChip({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <View style={[styles.scoreChip, { borderColor: color }]}>
      <Text style={[styles.scoreTeam, { color }]} numberOfLines={1}>{label}</Text>
      <Text style={styles.scoreValue}>{score.toLocaleString()}</Text>
      <Text style={styles.scoreGoal}>/ 15.000</Text>
    </View>
  );
}

function ActionBtn({
  label,
  icon,
  color,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: color }, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={styles.actionBtnIcon}>{icon}</Text>
      <Text style={styles.actionBtnText} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#145a32' },

  // Pass Device Modal
  passModal: {
    flex: 1,
    backgroundColor: '#0d3b22',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  passModalEmoji: { fontSize: 64 },
  passModalTitle: {
    color: '#a9dfbf',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  passModalPlayerName: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  passModalInstruction: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  passModalInfo: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    alignSelf: 'stretch',
  },
  passModalInfoText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  passModalBtn: {
    backgroundColor: '#f39c12',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: '#f39c12',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 8,
  },
  passModalBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Scoreboard
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    gap: 8,
  },
  scoreChip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
  },
  scoreTeam: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  scoreValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  scoreGoal: { fontSize: 9, color: 'rgba(255,255,255,0.35)' },
  roundInfo: { alignItems: 'center', gap: 2 },
  roundText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stockText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  // Table area
  tableArea: { flex: 1 },
  tableContent: { paddingBottom: 8 },
  teamTableSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  teamTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamTableLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', flex: 1 },
  noBajadaBadge: {
    backgroundColor: 'rgba(231,76,60,0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  noBajadaText: { color: '#e74c3c', fontSize: 9, fontWeight: '600' },
  monoObligadoBadge: {
    backgroundColor: 'rgba(142,68,173,0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  monoObligadoText: { color: '#9b59b6', fontSize: 9, fontWeight: '600' },
  honorsRow: { flexDirection: 'row', marginBottom: 6 },
  honorsLabel: { color: '#f9ca24', fontSize: 11 },
  emptyTable: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontStyle: 'italic', marginLeft: 14, marginBottom: 4 },
  tableItems: { gap: 8, paddingRight: 12 },

  // Pilon + Stock
  pilonStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginVertical: 2,
  },
  stockPile: { alignItems: 'center', gap: 4 },
  stackedCards: { width: 64, height: 90, position: 'relative' },
  cardBack: {
    width: 58,
    height: 82,
    backgroundColor: '#1a5276',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#2e86c1',
  },
  pileLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
  pileCount: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  pilonCenter: { flex: 1, alignItems: 'center', gap: 4 },
  pilonArrow: { color: 'rgba(255,255,255,0.2)', fontSize: 22 },
  tapaBanner: {
    backgroundColor: 'rgba(231,76,60,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tapaBannerText: { color: '#e74c3c', fontSize: 11, fontWeight: '700' },
  triadoBanner: {
    backgroundColor: 'rgba(243,156,18,0.2)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  triadoBannerText: { color: '#f39c12', fontSize: 11, fontWeight: '700' },
  pilonSizeText: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
  pilonPile: { alignItems: 'center', gap: 4 },
  pilonEmpty: {
    width: 64,
    height: 90,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pilonEmptyText: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },

  // Player banner
  playerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderTopWidth: 2,
    gap: 8,
  },
  playerBannerLeft: { flex: 1 },
  playerBannerName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  playerBannerPhase: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 },
  bajadaMinBadge: {
    backgroundColor: 'rgba(155,89,182,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bajadaMinText: { color: '#9b59b6', fontSize: 11, fontWeight: '600' },
  rulesBtn: { padding: 4 },
  rulesBtnText: { fontSize: 20 },

  // Hand area
  handArea: {
    minHeight: 96,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  handWithHideBtn: {
    flex: 1,
  },
  hideHandBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  hideHandBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  showHandBtn: {
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  showHandBtnText: { color: '#a9dfbf', fontSize: 15, fontWeight: '600' },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    padding: 8,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnIcon: { fontSize: 16 },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
    textAlign: 'center',
  },
  waitText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    alignSelf: 'center',
    flex: 1,
    textAlign: 'center',
  },

  // Hint bar
  hintBar: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  hintText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Modal styles
// ---------------------------------------------------------------------------

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetScroll: {
    justifyContent: 'flex-end',
    flexGrow: 1,
  },
  sheet: {
    backgroundColor: '#1a472a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
    paddingBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
  },
  topCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topCardLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  selectLabel: {
    color: '#a9dfbf',
    fontSize: 13,
    fontWeight: '600',
  },
  cardRow: {
    gap: 8,
    paddingVertical: 4,
  },
  noCardsText: {
    color: '#e74c3c',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#27ae60',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.35,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
