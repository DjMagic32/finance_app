import { MaterialCommunityIcons } from '@expo/vector-icons';
import { and, asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, IconButton, Menu, ProgressBar, Text } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { db } from '@/db';
import { projectBoards, projectCards, projectColumns } from '@/db/schema';
import {
  archiveBoard,
  boardTotals,
  cardTotalsBatch,
  deleteBoard,
  moveCard,
  type BoardTotals,
  type CardTotals,
} from '@/services/projects';

const COLUMN_WIDTH = 280;

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TableroScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = Number(id);

  const { data: boardRows } = useLiveQuery(
    db.select().from(projectBoards).where(eq(projectBoards.id, boardId)),
    [boardId],
  );
  const board = boardRows?.[0];

  const { data: columns } = useLiveQuery(
    db
      .select()
      .from(projectColumns)
      .where(eq(projectColumns.boardId, boardId))
      .orderBy(asc(projectColumns.sortOrder), asc(projectColumns.id)),
    [boardId],
  );

  const { data: cards } = useLiveQuery(
    db
      .select()
      .from(projectCards)
      .where(and(eq(projectCards.boardId, boardId), eq(projectCards.isArchived, 0)))
      .orderBy(asc(projectCards.sortOrder), asc(projectCards.id)),
    [boardId],
  );

  const [totals, setTotals] = useState<Map<number, CardTotals>>(new Map());
  const [boardTotal, setBoardTotal] = useState<BoardTotals | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moving, setMoving] = useState<{ cardId: number; cardTitle: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!cards || !board) return;
    const ids = cards.map((c) => c.id);
    setTotals(await cardTotalsBatch(ids));
    setBoardTotal(await boardTotals(board));
  }, [cards, board]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!board) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert(
      'Eliminar tablero',
      `¿Borrar "${board.name}" y todas sus tarjetas? Las asignaciones a movimientos se quitarán, pero los movimientos siguen intactos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteBoard(board.id);
            router.back();
          },
        },
      ],
    );
  };

  const toggleArchive = async () => {
    setMenuOpen(false);
    await archiveBoard(board.id, board.isArchived === 0);
    router.back();
  };

  const onMoveTo = async (newColumnId: number) => {
    if (!moving) return;
    await moveCard(moving.cardId, newColumnId);
    setMoving(null);
    refresh();
  };

  const cardsByColumn = new Map<number, typeof cards>();
  for (const col of columns ?? []) cardsByColumn.set(col.id, []);
  for (const c of cards ?? []) {
    const bucket = cardsByColumn.get(c.columnId);
    if (bucket) bucket.push(c);
  }

  const budgetLabel = board.budgetAmount
    ? board.budgetCurrency === 'USD'
      ? `$${fmt(board.budgetAmount)}`
      : `Bs ${fmt(board.budgetAmount)}`
    : null;
  const spent =
    boardTotal == null
      ? 0
      : board.budgetCurrency === 'USD'
        ? boardTotal.allocatedUsd
        : boardTotal.allocatedVes;
  const spentLabel = board.budgetCurrency === 'USD' ? `$${fmt(spent)}` : `Bs ${fmt(spent)}`;

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <Stack.Screen
        options={{
          title: board.name,
          headerStyle: { backgroundColor: board.color },
          headerTintColor: 'white',
          headerRight: () => (
            <Menu
              visible={menuOpen}
              onDismiss={() => setMenuOpen(false)}
              anchor={<Appbar.Action icon="dots-vertical" color="white" onPress={() => setMenuOpen(true)} />}>
              <Menu.Item
                onPress={() => {
                  setMenuOpen(false);
                  router.push(`/proyecto/editar/${board.id}` as never);
                }}
                leadingIcon="pencil"
                title="Editar tablero"
              />
              <Menu.Item
                onPress={toggleArchive}
                leadingIcon={board.isArchived ? 'archive-arrow-up' : 'archive'}
                title={board.isArchived ? 'Desarchivar' : 'Archivar'}
              />
              <Menu.Item
                onPress={confirmDelete}
                leadingIcon="delete"
                title="Eliminar"
                titleStyle={{ color: '#C62828' }}
              />
            </Menu>
          ),
        }}
      />

      <View style={[styles.summary, { backgroundColor: board.color }]}>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>Gastado</Text>
            <Text style={styles.summaryValue}>{spentLabel}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>Presupuesto</Text>
            <Text style={styles.summaryValue}>{budgetLabel ?? '—'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>Tarjetas</Text>
            <Text style={styles.summaryValue}>
              {boardTotal?.doneCount ?? 0}/{boardTotal?.cardCount ?? 0}
            </Text>
          </View>
        </View>
        {boardTotal?.progress != null && (
          <ProgressBar
            progress={boardTotal.progress}
            color="white"
            style={styles.summaryProgress}
          />
        )}
      </View>

      <ScrollView
        horizontal
        contentContainerStyle={styles.boardScroll}
        showsHorizontalScrollIndicator={false}>
        {(columns ?? []).map((col) => {
          const list = cardsByColumn.get(col.id) ?? [];
          return (
            <View key={col.id} style={styles.column}>
              <View style={styles.columnHeader}>
                <View style={[styles.columnDot, { backgroundColor: col.color }]} />
                <Text style={styles.columnName}>{col.name}</Text>
                <Text style={styles.columnCount}>{list.length}</Text>
              </View>

              <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
                {list.map((card) => {
                  const t = totals.get(card.id);
                  const progress = t?.progress ?? null;
                  const spentCard =
                    card.estimatedCurrency === 'USD' ? t?.allocatedUsd : t?.allocatedVes;
                  const spentLbl =
                    t == null
                      ? ''
                      : card.estimatedCurrency === 'USD'
                        ? `$${fmt(spentCard ?? 0)}`
                        : `Bs ${fmt(spentCard ?? 0)}`;
                  const estLbl = card.estimatedAmount
                    ? card.estimatedCurrency === 'USD'
                      ? `$${fmt(card.estimatedAmount)}`
                      : `Bs ${fmt(card.estimatedAmount)}`
                    : null;
                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => router.push(`/proyecto/tarjeta/${card.id}` as never)}
                      onLongPress={() =>
                        setMoving({ cardId: card.id, cardTitle: card.title })
                      }
                      style={({ pressed }) => [
                        styles.card,
                        { opacity: pressed ? 0.9 : 1, borderColor: col.color },
                      ]}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {card.title}
                      </Text>
                      {estLbl && (
                        <Text style={styles.cardMeta}>
                          {spentLbl} / {estLbl}
                        </Text>
                      )}
                      {progress != null && (
                        <ProgressBar
                          progress={progress}
                          color={col.color}
                          style={styles.cardProgress}
                        />
                      )}
                      {t && t.allocationCount > 0 && (
                        <View style={styles.cardFooter}>
                          <MaterialCommunityIcons name="link-variant" size={14} color="#888" />
                          <Text style={styles.cardFooterText}>
                            {t.allocationCount} movimiento{t.allocationCount === 1 ? '' : 's'}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() =>
                    router.push(
                      `/proyecto/tarjeta/nueva?boardId=${board.id}&columnId=${col.id}` as never,
                    )
                  }
                  style={styles.addCard}>
                  <MaterialCommunityIcons name="plus" size={18} color="#666" />
                  <Text style={{ color: '#666', fontSize: 13 }}>Añadir tarjeta</Text>
                </Pressable>
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {moving && columns && (
        <Pressable style={styles.moveBackdrop} onPress={() => setMoving(null)}>
          <Pressable style={styles.moveSheet} onPress={(e) => e.stopPropagation()}>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              Mover "{moving.cardTitle}" a:
            </Text>
            {columns.map((col) => (
              <Pressable
                key={col.id}
                onPress={() => onMoveTo(col.id)}
                style={styles.moveRow}>
                <View style={[styles.columnDot, { backgroundColor: col.color }]} />
                <Text style={{ flex: 1, fontWeight: '500' }}>{col.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#888" />
              </Pressable>
            ))}
            <IconButton icon="close" onPress={() => setMoving(null)} style={{ alignSelf: 'center' }} />
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  summaryLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  summaryValue: { color: 'white', fontSize: 17, fontWeight: '700', marginTop: 2 },
  summaryProgress: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  boardScroll: { padding: 12, gap: 12 },
  column: {
    width: COLUMN_WIDTH,
    backgroundColor: '#ECEFF1',
    borderRadius: 14,
    padding: 10,
    maxHeight: '100%',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  columnDot: { width: 10, height: 10, borderRadius: 5 },
  columnName: { flex: 1, fontWeight: '700', color: '#333' },
  columnCount: {
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderLeftWidth: 3,
  },
  cardTitle: { fontWeight: '600', color: '#222' },
  cardMeta: { fontSize: 12, color: '#666' },
  cardProgress: { height: 5, borderRadius: 3, backgroundColor: '#eee', marginTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardFooterText: { fontSize: 11, color: '#888' },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ccc',
    backgroundColor: 'white',
  },
  moveBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  moveSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 24,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
});
