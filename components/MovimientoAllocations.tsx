import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';

import { db } from '@/db';
import { projectAllocations, projectBoards, projectCards, type Transaction } from '@/db/schema';
import { remainingUnallocated, removeAllocation } from '@/services/projects';

import { CardPickerDialog } from './CardPickerDialog';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MovimientoAllocations({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);

  const { data: rows } = useLiveQuery(
    db
      .select({ alloc: projectAllocations, card: projectCards, board: projectBoards })
      .from(projectAllocations)
      .innerJoin(projectCards, eq(projectCards.id, projectAllocations.cardId))
      .innerJoin(projectBoards, eq(projectBoards.id, projectCards.boardId))
      .where(eq(projectAllocations.transactionId, transaction.id)),
    [transaction.id],
  );

  const refreshRemaining = async () => {
    setRemaining(await remainingUnallocated(transaction));
  };

  useEffect(() => {
    refreshRemaining();
  }, [transaction.id, rows?.length]);

  const onRemove = (allocId: number) => {
    Alert.alert('Desvincular', 'Se quita del proyecto. El movimiento sigue intacto.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: async () => {
          await removeAllocation(allocId);
          refreshRemaining();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Asociar a proyectos</Text>
          <Text style={styles.subtitle}>
            Sin asignar: {transaction.currency === 'USD' ? '$' : 'Bs '}
            {fmt(remaining)}
          </Text>
        </View>
        <Button
          mode="contained-tonal"
          icon="link-plus"
          compact
          onPress={() => setPickerOpen(true)}
          disabled={remaining <= 0}>
          Añadir
        </Button>
      </View>

      {(rows ?? []).map((r) => (
        <Pressable
          key={r.alloc.id}
          onPress={() => router.push(`/proyecto/tarjeta/${r.card.id}` as never)}
          style={styles.allocRow}>
          <View style={[styles.boardDot, { backgroundColor: r.board.color }]}>
            <MaterialCommunityIcons name={r.board.icon as any} size={14} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }} numberOfLines={1}>
              {r.card.title}
            </Text>
            <Text style={{ fontSize: 12, color: '#777' }} numberOfLines={1}>
              {r.board.name}
            </Text>
          </View>
          <Text style={{ fontWeight: '700' }}>
            {r.alloc.currency === 'USD' ? '$' : 'Bs '}
            {fmt(r.alloc.amount)}
          </Text>
          <IconButton icon="link-off" size={16} onPress={() => onRemove(r.alloc.id)} />
        </Pressable>
      ))}

      {(rows ?? []).length === 0 && (
        <Text style={styles.empty}>
          Aún no está asignado. Úsalo si este gasto es parte de un proyecto (ej: inversor, cocina).
        </Text>
      )}

      <CardPickerDialog
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        onDone={() => {
          setPickerOpen(false);
          refreshRemaining();
        }}
        transaction={transaction}
        remaining={remaining}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: 13, color: '#666', fontWeight: '700', letterSpacing: 0.3 },
  subtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  boardDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { color: '#888', fontSize: 13, padding: 8 },
});
