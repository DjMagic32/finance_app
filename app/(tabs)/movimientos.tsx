import { MaterialCommunityIcons } from '@expo/vector-icons';
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Button, Chip, FAB, List, Text } from 'react-native-paper';

import QuickAddSheet from '@/components/QuickAddSheet';
import { S } from '@/constants/strings';
import { AppColors, Semaforo } from '@/constants/theme';
import { db, todayISO } from '@/db';
import { categories, transactions } from '@/db/schema';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateLabel(date: string) {
  const today = todayISO();
  if (date === today) return S.comun.hoy;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (date === yesterday) return S.comun.ayer;
  return date.split('-').reverse().join('/');
}

export default function MovimientosScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<'todos' | 'sin_categoria'>('todos');
  const [quickOpen, setQuickOpen] = useState(false);
  const { data: rows } = useLiveQuery(
    db
      .select({ tx: transactions, cat: categories })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .orderBy(desc(transactions.date), desc(transactions.id)),
  );

  const sinCategoriaCount = (rows ?? []).filter((r) => r.tx.categoryId == null).length;
  const filteredRows = (rows ?? []).filter((r) =>
    filter === 'sin_categoria' ? r.tx.categoryId == null : true,
  );

  const sections = (() => {
    const map = new Map<string, typeof filteredRows>();
    for (const r of filteredRows) {
      const key = r.tx.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].map(([date, data]) => ({ title: dateLabel(date), data: data! }));
  })();

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <Button
        icon="calendar-sync"
        onPress={() => router.push('/fijos')}
        style={{ alignSelf: 'flex-end', marginTop: 4 }}>
        Gastos fijos
      </Button>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        <Chip
          selected={filter === 'todos'}
          onPress={() => setFilter('todos')}
          style={styles.filterChip}>
          Todos ({rows?.length ?? 0})
        </Chip>
        <Chip
          selected={filter === 'sin_categoria'}
          onPress={() => setFilter('sin_categoria')}
          style={styles.filterChip}
          icon={sinCategoriaCount > 0 ? 'alert-circle-outline' : undefined}>
          Sin categorizar ({sinCategoriaCount})
        </Chip>
      </ScrollView>
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="notebook-outline" size={64} color="#bbb" />
          <Text style={styles.emptyText}>
            {filter === 'sin_categoria'
              ? 'Todos tus movimientos tienen categoría. ¡Buen trabajo!'
              : S.movimientos.vacio}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => String(r.tx.id)}
          contentContainerStyle={{ paddingBottom: 90 }}
          renderSectionHeader={({ section }) => (
            <Text variant="titleSmall" style={styles.header}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: r }) => {
            const isGasto = r.tx.type === 'gasto';
            const sign = isGasto ? '-' : '+';
            const color = isGasto ? Semaforo.rojo : Semaforo.verde;
            const main =
              r.tx.currency === 'USD'
                ? `${sign}$${fmt(r.tx.amount)}`
                : `${sign}Bs ${fmt(r.tx.amount)}`;
            const secondary =
              r.tx.currency === 'USD'
                ? `≈ Bs ${fmt(r.tx.amountVes)}`
                : `≈ $${fmt(r.tx.amountUsd)}`;
            return (
              <List.Item
                onPress={() => router.push(`/movimiento/${r.tx.id}`)}
                title={r.cat?.name ?? 'Sin categoría'}
                description={r.tx.note || r.tx.bankDescription || secondary}
                left={() => (
                  <MaterialCommunityIcons
                    name={(r.cat?.icon as any) ?? 'help-circle'}
                    size={32}
                    color={r.cat?.color ?? '#888'}
                    style={{ alignSelf: 'center', marginLeft: 12 }}
                  />
                )}
                right={() => (
                  <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                    <Text style={{ color, fontWeight: 'bold' }}>{main}</Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>{secondary}</Text>
                  </View>
                )}
                style={{ backgroundColor: 'white' }}
              />
            );
          }}
        />
      )}
      <FAB
        icon="plus"
        style={styles.fab}
        color="white"
        onPress={() => router.push('/movimiento/nuevo')}
        onLongPress={() => setQuickOpen(true)}
      />
      <FAB
        icon="flash"
        small
        style={styles.fabQuick}
        color="white"
        onPress={() => setQuickOpen(true)}
      />
      <QuickAddSheet visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 16 },
  filterRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8, flexDirection: 'row' },
  filterChip: { marginRight: 4 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, color: '#555' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: AppColors.primary,
  },
  fabQuick: {
    position: 'absolute',
    right: 22,
    bottom: 88,
    backgroundColor: '#FF9800',
  },
});
