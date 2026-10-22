import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FAB, ProgressBar, Text } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { db } from '@/db';
import { projectBoards } from '@/db/schema';
import { boardTotals, type BoardTotals } from '@/services/projects';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProyectosScreen() {
  const router = useRouter();
  const { data: boards } = useLiveQuery(
    db.select().from(projectBoards).orderBy(projectBoards.sortOrder),
  );
  const activeBoards = (boards ?? []).filter((b) => b.isArchived === 0);
  const [totals, setTotals] = useState<Map<number, BoardTotals>>(new Map());

  const refreshTotals = useCallback(async () => {
    const m = new Map<number, BoardTotals>();
    for (const b of activeBoards) m.set(b.id, await boardTotals(b));
    setTotals(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoards.map((b) => b.id).join(',')]);

  useEffect(() => {
    refreshTotals();
  }, [refreshTotals]);

  useFocusEffect(
    useCallback(() => {
      refreshTotals();
    }, [refreshTotals]),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Proyectos' }} />
      {activeBoards.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="view-dashboard-outline" size={72} color="#bbb" />
          <Text style={styles.emptyTitle}>Organiza tus proyectos</Text>
          <Text style={styles.emptyText}>
            Crea un tablero para cada meta grande (poner un inversor, armar la cocina, ahorrar para
            un viaje). Divide en tarjetas y asocia los pagos reales de tu banco.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {activeBoards.map((b) => {
            const t = totals.get(b.id);
            const progress = t?.progress ?? null;
            const spent = b.budgetCurrency === 'USD' ? t?.allocatedUsd : t?.allocatedVes;
            const spentLabel =
              t == null
                ? '—'
                : b.budgetCurrency === 'USD'
                  ? `$${fmt(spent ?? 0)}`
                  : `Bs ${fmt(spent ?? 0)}`;
            const budgetLabel = b.budgetAmount
              ? b.budgetCurrency === 'USD'
                ? `$${fmt(b.budgetAmount)}`
                : `Bs ${fmt(b.budgetAmount)}`
              : 'sin presupuesto';
            return (
              <Pressable
                key={b.id}
                onPress={() => router.push(`/proyecto/${b.id}` as never)}
                style={({ pressed }) => [
                  styles.card,
                  { borderLeftColor: b.color, opacity: pressed ? 0.85 : 1 },
                ]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBubble, { backgroundColor: `${b.color}22` }]}>
                    <MaterialCommunityIcons name={b.icon as any} size={26} color={b.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                      {b.name}
                    </Text>
                    {b.description ? (
                      <Text numberOfLines={1} style={styles.desc}>
                        {b.description}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Tarjetas</Text>
                    <Text style={styles.statValue}>
                      {t?.doneCount ?? 0}/{t?.cardCount ?? 0}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Gastado</Text>
                    <Text style={styles.statValue}>{spentLabel}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Meta</Text>
                    <Text style={styles.statValue}>{budgetLabel}</Text>
                  </View>
                </View>

                {progress != null && (
                  <View style={{ marginTop: 10 }}>
                    <ProgressBar progress={progress} color={b.color} style={styles.progress} />
                    <Text style={styles.progressLabel}>{Math.round(progress * 100)}% del presupuesto</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
          <View style={{ height: 96 }} />
        </ScrollView>
      )}

      <FAB
        icon="plus"
        label={activeBoards.length === 0 ? 'Crear primer tablero' : undefined}
        style={styles.fab}
        color="white"
        onPress={() => router.push('/proyecto/nuevo' as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.fondo },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 14, lineHeight: 20 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: { color: '#777', fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1 },
  statLabel: { fontSize: 11, color: '#999', fontWeight: '600', letterSpacing: 0.3 },
  statValue: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  progress: { height: 8, borderRadius: 4, backgroundColor: '#eee' },
  progressLabel: { marginTop: 4, fontSize: 11, color: '#888' },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: AppColors.primary },
});
