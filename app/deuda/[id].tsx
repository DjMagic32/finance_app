import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Divider, Text } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';
import { db, todayISO } from '@/db';
import { debtPayments, debts } from '@/db/schema';
import { amountLabel, deleteDebt, markPaymentPaid } from '@/services/debts';
import { awardBadge } from '@/services/score';

export default function DetalleDeuda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const debtId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: debtRows } = useLiveQuery(
    db.select().from(debts).where(eq(debts.id, debtId)),
    [debtId],
  );
  const { data: payments } = useLiveQuery(
    db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId)).orderBy(debtPayments.dueDate),
    [debtId],
  );

  const debt = debtRows?.[0];
  if (!debt) return null;

  const today = todayISO();
  const paid = (payments ?? []).filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  const progress = debt.totalAmount > 0 ? paid / debt.totalAmount : 0;

  const onPay = (paymentId: number) => {
    Alert.alert('Confirmar pago', '¿Marcamos esta cuota como pagada?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, ya pagué',
        onPress: async () => {
          await markPaymentPaid(paymentId);
          const pending = (payments ?? []).filter((p) => !p.paidAt && p.id !== paymentId);
          if (pending.length === 0) {
            const isNew = await awardBadge('deuda_pagada');
            Alert.alert(
              isNew ? '🏆 ¡Nuevo logro!' : '🎉 ¡Felicidades!',
              `Pagaste toda tu deuda con ${debt.creditor}. ¡Un peso menos encima!`,
            );
          }
        },
      },
    ]);
  };

  const onDelete = () => {
    Alert.alert('Eliminar deuda', 'Se borrará la deuda y sus recordatorios. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteDebt(debtId);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <Stack.Screen options={{ title: debt.creditor }} />
      <FlatList
        data={payments ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 + insets.bottom }}
        ListHeaderComponent={
          <Card style={{ marginBottom: 6 }}>
            <Card.Content>
              <Text variant="titleLarge">{amountLabel(debt.totalAmount, debt.currency)}</Text>
              {debt.description ? <Text style={{ color: '#666' }}>{debt.description}</Text> : null}
              <Text style={{ marginTop: 8, color: Semaforo.verde }}>
                Pagado: {amountLabel(paid, debt.currency)} ({Math.round(progress * 100)}%)
              </Text>
              <Divider style={{ marginVertical: 8 }} />
              <Text variant="titleSmall">Cuotas</Text>
            </Card.Content>
          </Card>
        }
        renderItem={({ item: p }) => {
          const overdue = !p.paidAt && p.dueDate < today;
          const icon = p.paidAt ? 'check-circle' : overdue ? 'alert-circle' : 'clock-outline';
          const color = p.paidAt ? Semaforo.verde : overdue ? Semaforo.rojo : '#888';
          return (
            <Card>
              <Card.Content
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <MaterialCommunityIcons name={icon} size={28} color={color} />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall">{amountLabel(p.amount, debt.currency)}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>
                    {overdue ? '¡Vencida! ' : ''}Vence: {p.dueDate.split('-').reverse().join('/')}
                  </Text>
                </View>
                {!p.paidAt && (
                  <Button mode="contained-tonal" compact onPress={() => onPay(p.id)}>
                    Ya pagué
                  </Button>
                )}
              </Card.Content>
            </Card>
          );
        }}
        ListFooterComponent={
          <View style={{ marginTop: 12, gap: 4 }}>
            <Button icon="pencil" onPress={() => router.push(`/deuda/editar/${debtId}`)}>
              Editar deuda
            </Button>
            <Button textColor={Semaforo.rojo} onPress={onDelete}>
              Eliminar deuda
            </Button>
          </View>
        }
      />
    </View>
  );
}
