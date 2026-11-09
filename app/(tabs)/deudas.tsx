import { MaterialCommunityIcons } from '@expo/vector-icons';
import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Card, Chip, FAB, SegmentedButtons, Text } from 'react-native-paper';

import { S } from '@/constants/strings';
import { AppColors, Semaforo } from '@/constants/theme';
import { db } from '@/db';
import { debts, debtPayments, debtTransactionAllocations } from '@/db/schema';
import { amountLabel } from '@/services/debts';

const STATUS_UI = {
  activa: { label: 'Activa', color: AppColors.primary },
  pagada: { label: 'Pagada', color: Semaforo.verde },
  vencida: { label: '¡Vencida!', color: Semaforo.rojo },
} as const;

export default function DeudasScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<'pendientes' | 'pagadas'>('pendientes');
  const { data: rows } = useLiveQuery(db.select().from(debts).orderBy(desc(debts.createdAt)));
  const { data: payments } = useLiveQuery(db.select().from(debtPayments));
  const { data: allocations } = useLiveQuery(db.select().from(debtTransactionAllocations));
  const pendingCount = (rows ?? []).filter(d => d.status !== 'pagada').length;
  const paidCount = (rows ?? []).filter(d => d.status === 'pagada').length;
  const visibleRows = (rows ?? []).filter(d => filter === 'pagadas' ? d.status === 'pagada' : d.status !== 'pagada');

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <SegmentedButtons
        value={filter}
        onValueChange={value => setFilter(value as 'pendientes' | 'pagadas')}
        style={{ marginHorizontal: 16, marginTop: 12 }}
        buttons={[
          { value: 'pendientes', label: `Pendientes (${pendingCount})` },
          { value: 'pagadas', label: `Pagadas (${paidCount})` },
        ]}
      />
      {visibleRows.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="hand-coin-outline" size={64} color="#bbb" />
          <Text style={styles.emptyText}>{(rows ?? []).length === 0 ? S.deudas.vacio : filter === 'pagadas' ? 'Todavía no tienes deudas pagadas.' : 'No tienes deudas pendientes.'}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleRows}
          extraData={{ payments, allocations }}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 90 }}
          renderItem={({ item: d }) => {
            const ui = STATUS_UI[d.status];
            const paid = (payments ?? []).filter(p => p.debtId === d.id).reduce((sum, p) => {
              const linked = (allocations ?? []).filter(a => a.paymentId === p.id).reduce((n, a) => n + a.debtAmountCents, 0) / 100;
              return sum + (p.paidAt ? p.amount : Math.min(p.amount, linked));
            }, 0);
            return (
              <Card onPress={() => router.push(`/deuda/${d.id}`)}>
                <Card.Content style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{d.creditor}</Text>
                    <Text style={{ color: '#666' }}>
                      {d.status === 'pagada' ? 'Pagado' : 'Pendiente'}: {amountLabel(d.status === 'pagada' ? d.totalAmount : Math.max(0, d.totalAmount - paid), d.currency)}
                      {d.schedule !== 'unica' ? ` · ${d.schedule}` : ''}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>
                      Vence: {d.dueDate.split('-').reverse().join('/')}
                    </Text>
                  </View>
                  <Chip textStyle={{ color: 'white' }} style={{ backgroundColor: ui.color }}>
                    {ui.label}
                  </Chip>
                </Card.Content>
              </Card>
            );
          }}
        />
      )}
      <FAB
        icon="plus"
        style={styles.fab}
        color="white"
        onPress={() => router.push('/deuda/nueva')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: AppColors.primary },
});
