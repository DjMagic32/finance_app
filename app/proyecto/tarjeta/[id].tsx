import { MaterialCommunityIcons } from '@expo/vector-icons';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Checkbox,
  Dialog,
  Divider,
  IconButton,
  Menu,
  Portal,
  ProgressBar,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { db } from '@/db';
import {
  categories,
  projectAllocations,
  projectBoards,
  projectCards,
  projectColumns,
  projectSubtasks,
  transactions,
} from '@/db/schema';
import {
  allocateTransaction,
  cardTotals,
  createSubtask,
  deleteCard,
  deleteSubtask,
  moveCard,
  removeAllocation,
  remainingUnallocated,
  toggleSubtask,
  updateCard,
  updateSubtask,
  type CardTotals,
  type Currency,
} from '@/services/projects';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TarjetaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = Number(id);

  const { data: cardRows } = useLiveQuery(
    db.select().from(projectCards).where(eq(projectCards.id, cardId)),
    [cardId],
  );
  const card = cardRows?.[0];

  const { data: boardRows } = useLiveQuery(
    card
      ? db.select().from(projectBoards).where(eq(projectBoards.id, card.boardId))
      : db.select().from(projectBoards).where(isNull(projectBoards.id)),
    [card?.boardId ?? 0],
  );
  const board = boardRows?.[0];

  const { data: columns } = useLiveQuery(
    card
      ? db
          .select()
          .from(projectColumns)
          .where(eq(projectColumns.boardId, card.boardId))
          .orderBy(projectColumns.sortOrder)
      : db.select().from(projectColumns).where(isNull(projectColumns.id)),
    [card?.boardId ?? 0],
  );

  const { data: subs } = useLiveQuery(
    db
      .select()
      .from(projectSubtasks)
      .where(eq(projectSubtasks.cardId, cardId))
      .orderBy(projectSubtasks.sortOrder, projectSubtasks.id),
    [cardId],
  );

  const { data: allocRows } = useLiveQuery(
    db
      .select({ alloc: projectAllocations, tx: transactions, cat: categories })
      .from(projectAllocations)
      .leftJoin(transactions, eq(transactions.id, projectAllocations.transactionId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(eq(projectAllocations.cardId, cardId))
      .orderBy(desc(projectAllocations.id)),
    [cardId],
  );

  const [totals, setTotals] = useState<CardTotals | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAmount, setNewSubtaskAmount] = useState('');
  const [newSubtaskCurrency, setNewSubtaskCurrency] = useState<Currency>('USD');
  const [allocPickerOpen, setAllocPickerOpen] = useState(false);

  useEffect(() => {
    if (!card) return;
    cardTotals(card).then(setTotals);
    setTitleDraft(card.title);
    setNoteDraft(card.note ?? '');
  }, [card]);

  useFocusEffect(
    useCallback(() => {
      if (card) cardTotals(card).then(setTotals);
    }, [card]),
  );

  if (!card || !board) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const currentColumn = (columns ?? []).find((c) => c.id === card.columnId);
  const estLbl = card.estimatedAmount
    ? card.estimatedCurrency === 'USD'
      ? `$${fmt(card.estimatedAmount)}`
      : `Bs ${fmt(card.estimatedAmount)}`
    : null;
  const spent =
    totals == null ? 0 : card.estimatedCurrency === 'USD' ? totals.allocatedUsd : totals.allocatedVes;
  const spentLbl =
    card.estimatedCurrency === 'USD' || (!card.estimatedCurrency && totals?.allocatedUsd)
      ? `$${fmt(totals?.allocatedUsd ?? 0)}`
      : `Bs ${fmt(totals?.allocatedVes ?? 0)}`;

  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) return;
    await updateCard(card.id, { title: trimmed });
    setEditingTitle(false);
  };

  const saveNote = async () => {
    await updateCard(card.id, { note: noteDraft });
  };

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert('Eliminar tarjeta', `¿Borrar "${card.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteCard(card.id);
          router.back();
        },
      },
    ]);
  };

  const addSubtask = async () => {
    if (!newSubtask.trim()) return;
    const amount = parseFloat(newSubtaskAmount.replace(',', '.'));
    await createSubtask(
      card.id,
      newSubtask,
      Number.isFinite(amount) && amount > 0 ? amount : null,
      Number.isFinite(amount) && amount > 0 ? newSubtaskCurrency : null,
    );
    setNewSubtask('');
    setNewSubtaskAmount('');
    cardTotals(card).then(setTotals);
  };

  const onToggleSub = async (subId: number) => {
    await toggleSubtask(subId);
  };

  const onDeleteSub = (subId: number) => {
    Alert.alert('Eliminar subtarea', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteSubtask(subId);
        },
      },
    ]);
  };

  const onRemoveAlloc = (allocId: number) => {
    Alert.alert('Desvincular movimiento', 'El movimiento no se elimina, solo se desasocia.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: async () => {
          await removeAllocation(allocId);
          cardTotals(card).then(setTotals);
        },
      },
    ]);
  };

  const onMoveToColumn = async (newColId: number) => {
    setMoveOpen(false);
    await moveCard(card.id, newColId);
  };

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: board.color },
          headerTintColor: 'white',
          headerRight: () => (
            <Menu
              visible={menuOpen}
              onDismiss={() => setMenuOpen(false)}
              anchor={<Appbar.Action icon="dots-vertical" color="white" onPress={() => setMenuOpen(true)} />}>
              <Menu.Item
                leadingIcon="swap-horizontal"
                onPress={() => {
                  setMenuOpen(false);
                  setMoveOpen(true);
                }}
                title="Mover de columna"
              />
              <Menu.Item
                leadingIcon="delete"
                onPress={confirmDelete}
                title="Eliminar tarjeta"
                titleStyle={{ color: '#C62828' }}
              />
            </Menu>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, { backgroundColor: board.color }]}>
          <Pressable
            onPress={() => router.push(`/proyecto/${board.id}` as never)}
            style={styles.boardChip}>
            <MaterialCommunityIcons name={board.icon as any} size={14} color="white" />
            <Text style={styles.boardChipText}>{board.name}</Text>
          </Pressable>

          {editingTitle ? (
            <View style={{ gap: 8 }}>
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                mode="flat"
                style={styles.titleInput}
                textColor="white"
                underlineColor="rgba(255,255,255,0.5)"
                activeUnderlineColor="white"
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  mode="contained-tonal"
                  compact
                  onPress={() => {
                    setTitleDraft(card.title);
                    setEditingTitle(false);
                  }}>
                  Cancelar
                </Button>
                <Button mode="contained-tonal" compact onPress={saveTitle}>
                  Guardar
                </Button>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditingTitle(true)}>
              <Text style={styles.title}>{card.title}</Text>
            </Pressable>
          )}

          {currentColumn && (
            <Pressable onPress={() => setMoveOpen(true)} style={styles.columnChip}>
              <View style={[styles.columnChipDot, { backgroundColor: currentColumn.color }]} />
              <Text style={styles.columnChipText}>{currentColumn.name}</Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="white" />
            </Pressable>
          )}
        </View>

        {(estLbl || totals) && (
          <View style={styles.budgetCard}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.budgetLabel}>Gastado</Text>
                <Text style={styles.budgetValue}>{spentLbl}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.budgetLabel}>Estimado</Text>
                <Text style={styles.budgetValue}>{estLbl ?? 'Sin presupuesto'}</Text>
              </View>
            </View>
            {totals?.progress != null && (
              <View style={{ marginTop: 10 }}>
                <ProgressBar progress={totals.progress} color={board.color} style={styles.progress} />
                <Text style={styles.progressLabel}>{Math.round(totals.progress * 100)}% del estimado</Text>
              </View>
            )}
            {!card.estimatedAmount && (
              <Button
                mode="text"
                compact
                onPress={() => router.push(`/proyecto/tarjeta/editar/${card.id}` as never)}
                style={{ marginTop: 4 }}>
                Añadir estimado
              </Button>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notas</Text>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            onBlur={saveNote}
            mode="outlined"
            multiline
            placeholder="Especificaciones, dónde comprar, contactos..."
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Subtareas{subs && subs.length > 0 ? ` (${subs.filter((s) => s.done === 1).length}/${subs.length})` : ''}
          </Text>
          {(subs ?? []).map((s) => (
            <View key={s.id} style={styles.subRow}>
              <Checkbox
                status={s.done === 1 ? 'checked' : 'unchecked'}
                onPress={() => onToggleSub(s.id)}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    textDecorationLine: s.done === 1 ? 'line-through' : 'none',
                    color: s.done === 1 ? '#999' : '#222',
                  }}>
                  {s.title}
                </Text>
                {s.estimatedAmount ? (
                  <Text style={{ fontSize: 12, color: '#888' }}>
                    {s.estimatedCurrency === 'USD' ? '$' : 'Bs '}
                    {fmt(s.estimatedAmount)}
                  </Text>
                ) : null}
              </View>
              <IconButton icon="close" size={16} onPress={() => onDeleteSub(s.id)} />
            </View>
          ))}
          <View style={styles.newSubRow}>
            <TextInput
              value={newSubtask}
              onChangeText={setNewSubtask}
              mode="outlined"
              placeholder="Nueva subtarea..."
              style={{ flex: 2 }}
              dense
            />
            <TextInput
              value={newSubtaskAmount}
              onChangeText={setNewSubtaskAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              placeholder="Monto"
              style={{ flex: 1 }}
              dense
            />
            <View style={{ width: 80 }}>
              <SegmentedButtons
                value={newSubtaskCurrency}
                onValueChange={(v) => setNewSubtaskCurrency(v as Currency)}
                density="small"
                buttons={[
                  { value: 'VES', label: 'Bs' },
                  { value: 'USD', label: '$' },
                ]}
              />
            </View>
            <IconButton
              icon="plus"
              mode="contained"
              onPress={addSubtask}
              disabled={!newSubtask.trim()}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>
              Movimientos asociados ({allocRows?.length ?? 0})
            </Text>
            <Button
              mode="contained-tonal"
              icon="link-plus"
              compact
              onPress={() => setAllocPickerOpen(true)}>
              Asociar
            </Button>
          </View>
          {(allocRows ?? []).map((row) => {
            const a = row.alloc;
            const tx = row.tx;
            const cat = row.cat;
            return (
              <Pressable
                key={a.id}
                onPress={() => tx && router.push(`/movimiento/${tx.id}` as never)}
                style={styles.allocRow}>
                <MaterialCommunityIcons
                  name={(cat?.icon as any) ?? 'cash'}
                  size={22}
                  color={cat?.color ?? '#888'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600' }}>{cat?.name ?? 'Sin categoría'}</Text>
                  <Text style={{ fontSize: 12, color: '#777' }} numberOfLines={1}>
                    {tx?.date} · {tx?.note || tx?.bankDescription || 'Sin descripción'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '700', color: '#C62828' }}>
                    {a.currency === 'USD' ? '-$' : '-Bs '}
                    {fmt(a.amount)}
                  </Text>
                  {tx && tx.amount !== a.amount && (
                    <Text style={{ fontSize: 11, color: '#888' }}>
                      de {tx.currency === 'USD' ? '$' : 'Bs '}
                      {fmt(tx.amount)}
                    </Text>
                  )}
                </View>
                <IconButton icon="link-off" size={18} onPress={() => onRemoveAlloc(a.id)} />
              </Pressable>
            );
          })}
          {(allocRows ?? []).length === 0 && (
            <Text style={styles.empty}>
              Aún no asociaste movimientos. Pulsa "Asociar" para elegir un gasto que ya anotaste.
            </Text>
          )}
        </View>
      </ScrollView>

      {moveOpen && columns && (
        <Pressable style={styles.sheetBackdrop} onPress={() => setMoveOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>
              Mover a columna
            </Text>
            {columns.map((col) => (
              <Pressable
                key={col.id}
                onPress={() => onMoveToColumn(col.id)}
                style={styles.sheetRow}>
                <View style={[styles.columnChipDot, { backgroundColor: col.color }]} />
                <Text style={{ flex: 1, fontWeight: col.id === card.columnId ? '700' : '500' }}>
                  {col.name}
                </Text>
                {col.id === card.columnId && (
                  <MaterialCommunityIcons name="check" size={18} color={board.color} />
                )}
              </Pressable>
            ))}
            <IconButton icon="close" onPress={() => setMoveOpen(false)} style={{ alignSelf: 'center' }} />
          </Pressable>
        </Pressable>
      )}

      <AllocationPickerDialog
        visible={allocPickerOpen}
        onDismiss={() => setAllocPickerOpen(false)}
        onDone={() => {
          setAllocPickerOpen(false);
          cardTotals(card).then(setTotals);
        }}
        cardId={card.id}
      />
    </View>
  );
}

function AllocationPickerDialog({
  visible,
  onDismiss,
  onDone,
  cardId,
}: {
  visible: boolean;
  onDismiss: () => void;
  onDone: () => void;
  cardId: number;
}) {
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<{
    tx: typeof transactions.$inferSelect;
    cat: typeof categories.$inferSelect | null;
  } | null>(null);
  const [amountText, setAmountText] = useState('');
  const [remaining, setRemaining] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const { data: rows } = useLiveQuery(
    db
      .select({ tx: transactions, cat: categories })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(eq(transactions.type, 'gasto'))
      .orderBy(desc(transactions.date), desc(transactions.id)),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return (rows ?? []).slice(0, 50);
    return (rows ?? [])
      .filter((r) => {
        const name = r.cat?.name?.toLowerCase() ?? '';
        const note = r.tx.note?.toLowerCase() ?? '';
        const bank = r.tx.bankDescription?.toLowerCase() ?? '';
        return name.includes(q) || note.includes(q) || bank.includes(q);
      })
      .slice(0, 50);
  }, [query, rows]);

  const openPicking = async (
    tx: typeof transactions.$inferSelect,
    cat: typeof categories.$inferSelect | null,
  ) => {
    const left = await remainingUnallocated(tx);
    setRemaining(left);
    setAmountText(String(left));
    setPicking({ tx, cat });
  };

  const confirm = async () => {
    if (!picking) return;
    const amount = parseFloat(amountText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.001) {
      Alert.alert('Monto inválido', `Debe ser entre 0 y ${picking.tx.currency === 'USD' ? '$' : 'Bs '}${fmt(remaining)} disponible.`);
      return;
    }
    setSaving(true);
    try {
      await allocateTransaction({ transactionId: picking.tx.id, cardId, amount });
      setPicking(null);
      setAmountText('');
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: '85%' }}>
        {picking ? (
          <>
            <Dialog.Title>Monto a asociar</Dialog.Title>
            <Dialog.Content>
              <Text style={{ marginBottom: 8 }}>
                {picking.cat?.name ?? 'Sin categoría'} · {picking.tx.date}
              </Text>
              <Text style={{ marginBottom: 12, color: '#666' }}>
                Disponible sin asignar: {picking.tx.currency === 'USD' ? '$' : 'Bs '}
                {fmt(remaining)}
              </Text>
              <TextInput
                label={`Monto (${picking.tx.currency === 'USD' ? '$' : 'Bs'})`}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                mode="outlined"
                autoFocus
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setPicking(null)}>Atrás</Button>
              <Button mode="contained" loading={saving} onPress={confirm}>
                Asociar
              </Button>
            </Dialog.Actions>
          </>
        ) : (
          <>
            <Dialog.Title>Elegir movimiento</Dialog.Title>
            <Dialog.Content>
              <TextInput
                value={query}
                onChangeText={setQuery}
                mode="outlined"
                placeholder="Buscar por categoría o nota..."
                left={<TextInput.Icon icon="magnify" />}
                dense
                style={{ marginBottom: 8 }}
              />
              <ScrollView style={{ maxHeight: 360 }}>
                {filtered.length === 0 ? (
                  <Text style={{ color: '#888', padding: 12 }}>
                    No hay movimientos que coincidan.
                  </Text>
                ) : (
                  filtered.map((r, i) => (
                    <View key={r.tx.id}>
                      {i > 0 && <Divider />}
                      <Pressable
                        onPress={() => openPicking(r.tx, r.cat)}
                        style={styles.pickRow}>
                        <MaterialCommunityIcons
                          name={(r.cat?.icon as any) ?? 'cash'}
                          size={22}
                          color={r.cat?.color ?? '#888'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600' }}>{r.cat?.name ?? 'Sin categoría'}</Text>
                          <Text style={{ fontSize: 12, color: '#777' }} numberOfLines={1}>
                            {r.tx.date} · {r.tx.note || r.tx.bankDescription || ''}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '700' }}>
                          {r.tx.currency === 'USD' ? '$' : 'Bs '}
                          {fmt(r.tx.amount)}
                        </Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </ScrollView>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={onDismiss}>Cerrar</Button>
            </Dialog.Actions>
          </>
        )}
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
  },
  boardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
  },
  boardChipText: { color: 'white', fontSize: 12, fontWeight: '600' },
  title: { color: 'white', fontSize: 24, fontWeight: '700' },
  titleInput: { backgroundColor: 'transparent', fontSize: 22, fontWeight: '700' },
  columnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
  },
  columnChipDot: { width: 8, height: 8, borderRadius: 4 },
  columnChipText: { color: 'white', fontSize: 12, fontWeight: '600' },
  budgetCard: {
    backgroundColor: 'white',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 14,
  },
  budgetLabel: { fontSize: 11, color: '#888', fontWeight: '600', letterSpacing: 0.3 },
  budgetValue: { fontSize: 18, fontWeight: '700', color: '#222', marginTop: 4 },
  progress: { height: 8, borderRadius: 4, backgroundColor: '#eee' },
  progressLabel: { marginTop: 4, fontSize: 11, color: '#888' },
  section: {
    backgroundColor: 'white',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 14,
    gap: 8,
  },
  sectionTitle: { fontSize: 13, color: '#666', fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  empty: { color: '#888', fontSize: 13, padding: 8, textAlign: 'center' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 24,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
});
