import { MaterialCommunityIcons } from '@expo/vector-icons';
import { and, eq, gte, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { LineChart, PieChart } from 'react-native-gifted-charts';

import { S } from '@/constants/strings';
import { AppColors, Semaforo } from '@/constants/theme';
import { db, todayISO } from '@/db';
import { categories, transactions } from '@/db/schema';
import { getRateHistory } from '@/services/rates';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AnalisisScreen() {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: monthTx } = useLiveQuery(
    db
      .select({ tx: transactions, cat: categories })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, monthStart), lte(transactions.date, today))),
    [monthStart, today],
  );

  const [rateHistory, setRateHistory] = useState<Array<{ date: string; rate: number }>>([]);
  useEffect(() => {
    getRateHistory('paralelo').then(setRateHistory);
  }, [monthTx]);

  const gastos = (monthTx ?? []).filter((r) => r.tx.type === 'gasto');
  const totalGastos = gastos.reduce((s, r) => s + r.tx.amountUsd, 0);

  const byCategory = (() => {
    const map = new Map<string, { value: number; color: string }>();
    for (const r of gastos) {
      const name = r.cat?.name ?? 'Sin categoría';
      const color = r.cat?.color ?? '#888';
      const prev = map.get(name)?.value ?? 0;
      map.set(name, { value: prev + r.tx.amountUsd, color });
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value);
  })();

  // Devaluación: cuánto perdió el Bs desde el primer snapshot registrado
  const devaluacion = (() => {
    if (rateHistory.length < 2) return null;
    const first = rateHistory[0];
    const last = rateHistory[rateHistory.length - 1];
    if (first.rate <= 0) return null;
    const perdida = (1 - first.rate / last.rate) * 100;
    return { first, last, perdida };
  })();

  const lineData = rateHistory.map((r) => ({ value: r.rate }));

  if ((monthTx ?? []).length === 0 && rateHistory.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="chart-arc" size={64} color="#bbb" />
        <Text style={styles.emptyText}>{S.analisis.vacio}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      {byCategory.length > 0 && (
        <Card>
          <Card.Content>
            <Text variant="titleMedium">¿En qué se te va la plata este mes?</Text>
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <PieChart
                data={byCategory.map((c) => ({ value: c.value, color: c.color }))}
                donut
                radius={90}
                innerRadius={55}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                      ${fmt(totalGastos)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#888' }}>gastado</Text>
                  </View>
                )}
              />
            </View>
            {byCategory.map((c) => (
              <View key={c.name} style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: c.color }]} />
                <Text style={{ flex: 1 }}>{c.name}</Text>
                <Text style={{ fontWeight: 'bold' }}>
                  ${fmt(c.value)} ({Math.round((c.value / totalGastos) * 100)}%)
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      )}

      {lineData.length >= 2 && (
        <Card>
          <Card.Content>
            <Text variant="titleMedium">Tasa del dólar paralelo</Text>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
              Desde que empezaste a usar la app
            </Text>
            <LineChart
              data={lineData}
              color={AppColors.primary}
              thickness={2}
              hideDataPoints={lineData.length > 15}
              yAxisTextStyle={{ fontSize: 10 }}
              xAxisLabelTextStyle={{ fontSize: 9 }}
              adjustToWidth
              yAxisOffset={Math.floor(Math.min(...lineData.map((d) => d.value)) * 0.98)}
            />
          </Card.Content>
        </Card>
      )}

      {devaluacion && Math.abs(devaluacion.perdida) >= 0.5 && (
        <Card style={{ borderLeftWidth: 6, borderLeftColor: Semaforo.amarillo }}>
          <Card.Content>
            <Text variant="titleMedium">¿Te convino guardar bolívares?</Text>
            <Text style={{ marginTop: 6 }}>
              Desde el {devaluacion.first.date.split('-').reverse().join('/')}, los bolívares
              perdieron <Text style={{ fontWeight: 'bold', color: Semaforo.rojo }}>
                {fmt(devaluacion.perdida)}%
              </Text>{' '}
              de su valor en dólares.
            </Text>
            <Text style={{ marginTop: 6, color: '#555' }}>
              Ejemplo: Bs {fmt(devaluacion.last.rate)} compraban $1 hoy, pero el{' '}
              {devaluacion.first.date.split('-').reverse().join('/')} con eso comprabas $
              {fmt(devaluacion.last.rate / devaluacion.first.rate)}. Guardar en dólares te protege
              de la devaluación.
            </Text>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    backgroundColor: AppColors.fondo,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 16 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
