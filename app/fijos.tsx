import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, FAB, Text } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';
import { db, todayISO } from '@/db';
import { recurring } from '@/db/schema';
import { amountLabel } from '@/services/debts';
import { payRecurring } from '@/services/recurring';
import { BADGE_DEFS } from '@/services/score';

const SCHEDULE_LABEL = { semanal: 'semanal', quincenal: 'quincenal', mensual: 'mensual' } as const;

export default function FijosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: rows } = useLiveQuery(db.select().from(recurring).orderBy(recurring.nextDue));
  const today = todayISO();

  const onPay = (id: number, name: string) => {
    Alert.alert('Confirmar pago', `¿Ya pagaste "${name}"? Lo anotaremos como gasto de hoy.`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, ya pagué',
        onPress: async () => {
          const earned = await payRecurring(id);
          if (earned.length > 0) {
            const b = BADGE_DEFS[earned[0]];
            setTimeout(() => Alert.alert('🏆 ¡Nuevo logro!', `${b.nombre}: ${b.desc}`), 300);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      {(rows ?? []).length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="calendar-sync" size={64} color="#bbb" />
          <Text style={styles.emptyText}>
            Registra tus pagos que se repiten (internet, luz, alquiler...){'\n'}y te recordaremos
            cuando toque pagarlos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 90 + insets.bottom }}
          renderItem={({ item: r }) => {
            const overdue = r.nextDue < today;
            const dueToday = r.nextDue === today;
            return (
              <Card onPress={() => router.push(`/fijo/${r.id}`)}>
                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons
                    name={overdue ? 'alert-circle' : 'calendar-sync'}
                    size={30}
                    color={overdue ? Semaforo.rojo : dueToday ? Semaforo.amarillo : AppColors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{r.name}</Text>
                    <Text style={{ color: '#666' }}>
                      {amountLabel(r.amount, r.currency)} · {SCHEDULE_LABEL[r.schedule]}
                    </Text>
                    <Text style={{ color: overdue ? Semaforo.rojo : '#888', fontSize: 12 }}>
                      {overdue ? '¡Vencido! Tocaba el ' : dueToday ? '¡Toca hoy! ' : 'Próximo: '}
                      {r.nextDue.split('-').reverse().join('/')}
                    </Text>
                  </View>
                  <Button mode="contained-tonal" compact onPress={() => onPay(r.id, r.name)}>
                    Ya pagué
                  </Button>
                </Card.Content>
              </Card>
            );
          }}
        />
      )}
      <FAB
        icon="plus"
        style={[styles.fab, { bottom: 16 + insets.bottom }]}
        color="white"
        onPress={() => router.push('/fijo/nuevo')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 16 },
  fab: { position: 'absolute', right: 16, backgroundColor: AppColors.primary },
});
