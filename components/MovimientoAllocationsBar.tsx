import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { db } from '@/db';
import {
  projectAllocations,
  projectBoards,
  projectCards,
  type Transaction,
} from '@/db/schema';
import { remainingUnallocated } from '@/services/projects';

import { CardPickerDialog } from './CardPickerDialog';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MovimientoAllocationsBar({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remaining, setRemaining] = useState<number>(transaction.amount);

  const { data: rows } = useLiveQuery(
    db
      .select({ alloc: projectAllocations, card: projectCards, board: projectBoards })
      .from(projectAllocations)
      .innerJoin(projectCards, eq(projectCards.id, projectAllocations.cardId))
      .innerJoin(projectBoards, eq(projectBoards.id, projectCards.boardId))
      .where(eq(projectAllocations.transactionId, transaction.id)),
    [transaction.id],
  );

  useEffect(() => {
    remainingUnallocated(transaction).then(setRemaining);
  }, [transaction, rows?.length]);

  return (
    <>
      <View style={styles.bar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}>
          {(rows ?? []).map((r) => (
            <Pressable
              key={r.alloc.id}
              onPress={() => router.push(`/proyecto/tarjeta/${r.card.id}` as never)}
              style={[styles.chip, { backgroundColor: r.board.color }]}>
              <MaterialCommunityIcons name={r.board.icon as any} size={14} color="white" />
              <Text style={styles.chipTitle} numberOfLines={1}>
                {r.card.title}
              </Text>
              <Text style={styles.chipAmount}>
                {r.alloc.currency === 'USD' ? '$' : 'Bs '}
                {fmt(r.alloc.amount)}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[styles.chip, styles.addChip]}
            disabled={remaining <= 0}>
            <MaterialCommunityIcons name="link-plus" size={16} color={remaining > 0 ? '#1565C0' : '#aaa'} />
            <Text style={[styles.addChipText, remaining <= 0 && { color: '#aaa' }]}>
              {rows && rows.length > 0 ? 'Añadir' : 'Asociar a proyecto'}
            </Text>
          </Pressable>
        </ScrollView>
        {remaining > 0 && rows && rows.length > 0 && (
          <Text style={styles.remaining}>
            Sin asignar: {transaction.currency === 'USD' ? '$' : 'Bs '}
            {fmt(remaining)}
          </Text>
        )}
      </View>

      <CardPickerDialog
        visible={pickerOpen}
        onDismiss={() => setPickerOpen(false)}
        onDone={() => setPickerOpen(false)}
        transaction={transaction}
        remaining={remaining}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'white',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  scroll: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 220,
  },
  chipTitle: { color: 'white', fontSize: 12, fontWeight: '600', maxWidth: 110 },
  chipAmount: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  addChip: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderStyle: 'dashed',
  },
  addChipText: { color: '#1565C0', fontSize: 12, fontWeight: '600' },
  remaining: { paddingHorizontal: 16, paddingTop: 4, fontSize: 11, color: '#888' },
});
