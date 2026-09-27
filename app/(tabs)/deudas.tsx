import { MaterialCommunityIcons } from '@expo/vector-icons';
import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { Card, Chip, FAB, Text } from 'react-native-paper';

import { S } from '@/constants/strings';
import { AppColors, Semaforo } from '@/constants/theme';
import { db } from '@/db';
import { debts } from '@/db/schema';
import { amountLabel } from '@/services/debts';

const STATUS_UI = {
  activa: { label: 'Activa', color: AppColors.primary },
  pagada: { label: 'Pagada', color: Semaforo.verde },
  vencida: { label: '¡Vencida!', color: Semaforo.rojo },
} as const;

export default function DeudasScreen() {
  const router = useRouter();
  const { data: rows } = useLiveQuery(db.select().from(debts).orderBy(desc(debts.createdAt)));

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      {(rows ?? []).length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="hand-coin-outline" size={64} color="#bbb" />
          <Text style={styles.emptyText}>{S.deudas.vacio}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 90 }}
          renderItem={({ item: d }) => {
            const ui = STATUS_UI[d.status];
            return (
              <Card onPress={() => router.push(`/deuda/${d.id}`)}>
                <Card.Content style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{d.creditor}</Text>
                    <Text style={{ color: '#666' }}>
                      {amountLabel(d.totalAmount, d.currency)}
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
