import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, gte, lte } from 'drizzle-orm';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Portal, Text } from 'react-native-paper';

import { S } from '@/constants/strings';
import { AppColors, Semaforo } from '@/constants/theme';
import { db, todayISO } from '@/db';
import { transactions } from '@/db/schema';
import { getLatestRates, refreshRates, type RateInfo, type Rates } from '@/services/rates';
import { computeHealthScore, getGamState, type HealthScore } from '@/services/score';
import { setupNotifications } from '@/services/notifications';

function monthRange() {
  const today = todayISO();
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function RateRow({ label, info }: { label: string; info?: RateInfo }) {
  return (
    <View style={styles.rateRow}>
      <Text variant="bodyLarge">{label}</Text>
      {info ? (
        <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>
          Bs {fmt(info.rate)}
          {info.stale ? `  (${S.inicio.tasaVieja})` : ''}
        </Text>
      ) : (
        <Text variant="bodyMedium" style={{ color: '#888' }}>
          —
        </Text>
      )}
    </View>
  );
}

export default function InicioScreen() {
  const [rates, setRates] = useState<Rates>({});
  const [refreshing, setRefreshing] = useState(false);
  const [score, setScore] = useState<HealthScore | null>(null);
  const [streak, setStreak] = useState(0);
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('onboarded_v1').then((v) => {
      if (v !== '1') setWelcome(true);
    });
  }, []);

  const closeWelcome = async () => {
    setWelcome(false);
    await AsyncStorage.setItem('onboarded_v1', '1');
    await setupNotifications();
  };

  const { start, end } = monthRange();
  const { data: monthTx } = useLiveQuery(
    db
      .select()
      .from(transactions)
      .where(and(gte(transactions.date, start), lte(transactions.date, end))),
    [start, end],
  );

  const load = async () => {
    setRates(await getLatestRates());
    const fresh = await refreshRates();
    setRates(fresh);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    computeHealthScore().then(setScore);
    getGamState().then((g) => setStreak(g.streakDays));
  }, [monthTx]);

  const ingresos = (monthTx ?? [])
    .filter((t) => t.type === 'ingreso')
    .reduce((s, t) => s + t.amountUsd, 0);
  const gastos = (monthTx ?? [])
    .filter((t) => t.type === 'gasto')
    .reduce((s, t) => s + t.amountUsd, 0);
  const saldo = ingresos - gastos;
  const saldoColor = saldo >= 0 ? Semaforo.verde : Semaforo.rojo;

  const noRates = !rates.bcv && !rates.paralelo && !rates.binance_p2p;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <Portal>
        <Dialog visible={welcome} onDismiss={closeWelcome}>
          <Dialog.Title>¡Bienvenido a Mis Finanzas! 👋</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            <Text>
              Esta app te ayuda a cuidar la plata de tu hogar, sin palabras complicadas:
            </Text>
            <Text>1. Anota cada gasto e ingreso (¡toma 1 minuto!).</Text>
            <Text>
              2. Mira las tasas del dólar (BCV, paralelo y Binance) y cuánto vale tu plata de
              verdad.
            </Text>
            <Text>3. Registra tus deudas y te recordaremos los pagos.</Text>
            <Text>
              4. Tu Salud Financiera te dice con colores si vas bien 🟢, regular 🟡 o mal 🔴.
            </Text>
            <Text style={{ marginTop: 4, color: '#666' }}>
              Ahora te pediremos permiso para enviarte recordatorios. ¡Acéptalo para no olvidar
              ningún pago!
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeWelcome}>¡Empezar!</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Text variant="titleLarge">{S.inicio.saludo}</Text>

      {score && (
        <Card style={{ borderLeftWidth: 6, borderLeftColor: score.color }}>
          <Card.Content>
            <View style={styles.rateRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium">Salud Financiera</Text>
                <Text variant="titleLarge" style={{ color: score.color, fontWeight: 'bold' }}>
                  {score.mensaje}
                </Text>
              </View>
              <View style={[styles.scoreCircle, { borderColor: score.color }]}>
                <Text variant="headlineMedium" style={{ color: score.color, fontWeight: 'bold' }}>
                  {score.total}
                </Text>
                <Text style={{ fontSize: 10, color: '#888' }}>de 100</Text>
              </View>
            </View>
            {score.consejo && (
              <Text style={{ marginTop: 8, color: '#555' }}>
                <MaterialCommunityIcons name="lightbulb-on" size={14} color={Semaforo.amarillo} />{' '}
                {score.consejo}
              </Text>
            )}
            {streak > 0 && (
              <Text style={{ marginTop: 6 }}>
                <MaterialCommunityIcons name="fire" size={16} color="#FF6D00" /> {streak}{' '}
                {S.inicio.racha}
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

      <Card>
        <Card.Content>
          <Text variant="titleMedium">{S.inicio.saldoMes}</Text>
          <Text variant="displaySmall" style={{ color: saldoColor, fontWeight: 'bold' }}>
            ${fmt(saldo)}
          </Text>
          <View style={styles.rateRow}>
            <Text style={{ color: Semaforo.verde }}>
              <MaterialCommunityIcons name="arrow-down-bold" size={14} /> {S.inicio.ingresos}: $
              {fmt(ingresos)}
            </Text>
            <Text style={{ color: Semaforo.rojo }}>
              <MaterialCommunityIcons name="arrow-up-bold" size={14} /> {S.inicio.gastos}: $
              {fmt(gastos)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={{ gap: 8 }}>
          <Text variant="titleMedium">{S.inicio.tasasHoy}</Text>
          {noRates ? (
            <Text style={{ color: Semaforo.amarillo }}>{S.inicio.sinTasa}</Text>
          ) : (
            <>
              <RateRow label={S.inicio.bcv} info={rates.bcv} />
              <RateRow label={S.inicio.paralelo} info={rates.paralelo} />
              <RateRow label={S.inicio.binance} info={rates.binance_p2p} />
            </>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  scoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
