import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, Portal, Text, TextInput } from 'react-native-paper';

import { db } from '@/db';
import { projectBoards, projectCards, projectColumns, type Transaction } from '@/db/schema';
import { allocateTransaction } from '@/services/projects';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CardPickerDialog({
  visible,
  onDismiss,
  onDone,
  transaction,
  remaining,
}: {
  visible: boolean;
  onDismiss: () => void;
  onDone: () => void;
  transaction: Transaction;
  remaining: number;
}) {
  const router = useRouter();
  const [boardId, setBoardId] = useState<number | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: boards } = useLiveQuery(
    db
      .select()
      .from(projectBoards)
      .where(eq(projectBoards.isArchived, 0))
      .orderBy(projectBoards.sortOrder),
  );

  const { data: cards } = useLiveQuery(
    boardId
      ? db
          .select({ card: projectCards, col: projectColumns })
          .from(projectCards)
          .leftJoin(projectColumns, eq(projectColumns.id, projectCards.columnId))
          .where(eq(projectCards.boardId, boardId))
          .orderBy(projectCards.sortOrder, projectCards.id)
      : db
          .select({ card: projectCards, col: projectColumns })
          .from(projectCards)
          .where(eq(projectCards.id, -1)),
    [boardId],
  );

  useEffect(() => {
    if (!visible) {
      setBoardId(null);
      setCardId(null);
      setAmountText('');
    } else {
      setAmountText(String(remaining));
    }
  }, [visible, remaining]);

  const confirm = async () => {
    if (!cardId) return;
    const amount = parseFloat(amountText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.001) {
      Alert.alert(
        'Monto inválido',
        `Debe estar entre 0 y ${transaction.currency === 'USD' ? '$' : 'Bs '}${fmt(remaining)}.`,
      );
      return;
    }
    setSaving(true);
    try {
      await allocateTransaction({ transactionId: transaction.id, cardId, amount });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: '85%' }}>
        <Dialog.Title>
          {!boardId ? 'Elegir proyecto' : !cardId ? 'Elegir tarjeta' : 'Monto'}
        </Dialog.Title>
        <Dialog.Content>
          {!boardId && (
            <ScrollView style={{ maxHeight: 360 }}>
              {(boards ?? []).length === 0 ? (
                <View style={{ alignItems: 'center', gap: 10, padding: 16 }}>
                  <Text style={{ color: '#666', textAlign: 'center' }}>
                    Aún no tienes tableros.
                  </Text>
                  <Button
                    mode="contained-tonal"
                    icon="plus"
                    onPress={() => {
                      onDismiss();
                      router.push('/proyecto/nuevo' as never);
                    }}>
                    Crear uno
                  </Button>
                </View>
              ) : (
                (boards ?? []).map((b, i) => (
                  <View key={b.id}>
                    {i > 0 && <Divider />}
                    <Pressable style={styles.pickRow} onPress={() => setBoardId(b.id)}>
                      <View style={[styles.boardDot, { backgroundColor: b.color }]}>
                        <MaterialCommunityIcons name={b.icon as any} size={14} color="white" />
                      </View>
                      <Text style={{ flex: 1, fontWeight: '600' }}>{b.name}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#888" />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {boardId && !cardId && (
            <ScrollView style={{ maxHeight: 360 }}>
              {(cards ?? []).length === 0 ? (
                <View style={{ alignItems: 'center', gap: 10, padding: 16 }}>
                  <Text style={{ color: '#666', textAlign: 'center' }}>
                    Este tablero no tiene tarjetas aún.
                  </Text>
                  <Button
                    mode="contained-tonal"
                    icon="plus"
                    onPress={() => {
                      onDismiss();
                      router.push(`/proyecto/${boardId}` as never);
                    }}>
                    Ir al tablero
                  </Button>
                </View>
              ) : (
                (cards ?? []).map((r, i) => (
                  <View key={r.card.id}>
                    {i > 0 && <Divider />}
                    <Pressable style={styles.pickRow} onPress={() => setCardId(r.card.id)}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>{r.card.title}</Text>
                        {r.col && (
                          <Text style={{ fontSize: 12, color: '#777' }}>{r.col.name}</Text>
                        )}
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#888" />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {boardId && cardId && (
            <View>
              <Text style={{ color: '#666', marginBottom: 10 }}>
                Disponible: {transaction.currency === 'USD' ? '$' : 'Bs '}
                {fmt(remaining)}
              </Text>
              <TextInput
                label={`Monto (${transaction.currency === 'USD' ? '$' : 'Bs'})`}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                mode="outlined"
                autoFocus
              />
            </View>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          {cardId ? (
            <>
              <Button onPress={() => setCardId(null)}>Atrás</Button>
              <Button mode="contained" onPress={confirm} loading={saving}>
                Asociar
              </Button>
            </>
          ) : boardId ? (
            <Button onPress={() => setBoardId(null)}>Atrás</Button>
          ) : (
            <Button onPress={onDismiss}>Cerrar</Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  boardDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
