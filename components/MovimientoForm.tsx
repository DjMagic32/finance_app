import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SegmentedButtons, Text, TextInput } from 'react-native-paper';

import StepForm from '@/components/StepForm';
import { S } from '@/constants/strings';
import { AppColors, Semaforo } from '@/constants/theme';
import { db, nowISO, todayISO } from '@/db';
import { categories, transactions, type Transaction } from '@/db/schema';
import { getLatestRates } from '@/services/rates';
import { BADGE_DEFS, evaluateExpenseRisk, registerActivity } from '@/services/score';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MovimientoForm({
  existing,
  onDone,
}: {
  existing?: Transaction;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<'gasto' | 'ingreso'>(existing?.type ?? 'gasto');
  const [currency, setCurrency] = useState<'VES' | 'USD'>(existing?.currency ?? 'VES');
  const [amountText, setAmountText] = useState(existing ? String(existing.amount) : '');
  const [categoryId, setCategoryId] = useState<number | null>(existing?.categoryId ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [rate, setRate] = useState<number | null>(existing?.rateUsed ?? null);
  const [rateSource, setRateSource] = useState<string>(existing?.rateSource ?? 'manual');
  const [manualRateText, setManualRateText] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: cats } = useLiveQuery(
    db.select().from(categories).where(eq(categories.kind, type)).orderBy(categories.sortOrder),
    [type],
  );

  useEffect(() => {
    if (existing?.rateUsed) return;
    getLatestRates().then((r) => {
      const best = r.paralelo ?? r.bcv ?? r.binance_p2p;
      if (best) {
        setRate(best.rate);
        setRateSource(best.source);
      }
    });
  }, []);

  const pickType = (v: 'gasto' | 'ingreso') => {
    if (v !== type) setCategoryId(null);
    setType(v);
    setStep(1);
  };

  const amount = parseFloat(amountText.replace(',', '.')) || 0;
  const manualRate = parseFloat(manualRateText.replace(',', '.')) || 0;
  const effectiveRate = rate ?? (manualRate > 0 ? manualRate : null);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayISO();
  const equivalent =
    amount > 0 && effectiveRate
      ? currency === 'VES'
        ? `≈ $${fmt(amount / effectiveRate)} ${S.movimientos.alCambioDe}`
        : `≈ Bs ${fmt(amount * effectiveRate)} ${S.movimientos.alCambioDe}`
      : null;

  const canNext = [
    true,
    amount > 0 && effectiveRate != null,
    categoryId != null,
    dateOk && !saving,
  ][step];

  const save = async () => {
    if (!effectiveRate) return;
    setSaving(true);
    const amountUsd = currency === 'USD' ? amount : amount / effectiveRate;
    const amountVes = currency === 'VES' ? amount : amount * effectiveRate;

    if (type === 'gasto' && !existing) {
      const warning = await evaluateExpenseRisk(amountUsd);
      if (warning) {
        const ok = await new Promise<boolean>((resolve) =>
          Alert.alert('Piénsalo un momento', warning, [
            { text: S.comun.cancelar, style: 'cancel', onPress: () => resolve(false) },
            { text: 'Guardar igual', onPress: () => resolve(true) },
          ]),
        );
        if (!ok) {
          setSaving(false);
          return;
        }
      }
    }

    const values = {
      type,
      categoryId,
      amount,
      currency,
      amountUsd,
      amountVes,
      rateUsed: effectiveRate,
      rateSource: rate ? rateSource : 'manual',
      note: note.trim() || null,
      date,
    };

    if (existing) {
      await db.update(transactions).set(values).where(eq(transactions.id, existing.id));
      onDone();
    } else {
      await db.insert(transactions).values({ ...values, createdAt: nowISO() });
      const earned = await registerActivity();
      onDone();
      if (earned.length > 0) {
        const b = BADGE_DEFS[earned[0]];
        setTimeout(() => Alert.alert('🏆 ¡Nuevo logro!', `${b.nombre}: ${b.desc}`), 400);
      }
    }
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Eliminar movimiento', '¿Seguro que lo borramos?', [
      { text: S.comun.cancelar, style: 'cancel' },
      {
        text: S.comun.eliminar,
        style: 'destructive',
        onPress: async () => {
          await db.delete(transactions).where(eq(transactions.id, existing.id));
          onDone();
        },
      },
    ]);
  };

  const titles = [
    '¿Qué quieres anotar?',
    '¿Cuánto fue?',
    type === 'gasto' ? '¿En qué fue?' : '¿De dónde vino?',
    'Últimos detalles',
  ];

  return (
    <StepForm
      step={step}
      setStep={setStep}
      titles={titles}
      canNext={canNext}
      onSubmit={save}
      saving={saving}
      submitLabel={S.movimientos.guardar}
      onDelete={existing ? remove : undefined}>
      {step === 0 && (
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => pickType('gasto')}
            style={[styles.bigOption, type === 'gasto' && styles.bigOptionSelected]}>
            <MaterialCommunityIcons name="arrow-up-bold-circle" size={44} color={Semaforo.rojo} />
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium">Un gasto</Text>
              <Text style={styles.optionDesc}>Dinero que salió: mercado, pasaje, luz...</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => pickType('ingreso')}
            style={[styles.bigOption, type === 'ingreso' && styles.bigOptionSelected]}>
            <MaterialCommunityIcons name="arrow-down-bold-circle" size={44} color={Semaforo.verde} />
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium">Un ingreso</Text>
              <Text style={styles.optionDesc}>Dinero que entró: sueldo, venta, remesa...</Text>
            </View>
          </Pressable>
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 14 }}>
          <SegmentedButtons
            value={currency}
            onValueChange={(v) => setCurrency(v as 'VES' | 'USD')}
            buttons={[
              { value: 'VES', label: 'Bolívares (Bs)' },
              { value: 'USD', label: 'Dólares ($)' },
            ]}
          />
          <TextInput
            label={S.movimientos.monto}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            mode="outlined"
            style={{ fontSize: 28 }}
            autoFocus
          />
          {equivalent && (
            <Text variant="titleMedium" style={{ color: AppColors.primary }}>
              {equivalent}
            </Text>
          )}
          {!rate && (
            <TextInput
              label={S.movimientos.tasaManual}
              value={manualRateText}
              onChangeText={setManualRateText}
              keyboardType="decimal-pad"
              mode="outlined"
            />
          )}
        </View>
      )}

      {step === 2 && (
        <View style={styles.grid}>
          {(cats ?? []).map((c) => {
            const selected = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  setCategoryId(c.id);
                  setStep(3);
                }}
                style={[
                  styles.catItem,
                  { borderColor: selected ? c.color : '#ddd', backgroundColor: selected ? `${c.color}22` : 'white' },
                ]}>
                <MaterialCommunityIcons name={c.icon as any} size={28} color={c.color} />
                <Text style={styles.catLabel} numberOfLines={2}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {step === 3 && (
        <View style={{ gap: 14 }}>
          <TextInput
            label={`${S.movimientos.fecha} (AAAA-MM-DD)`}
            value={date}
            onChangeText={setDate}
            mode="outlined"
            error={!dateOk}
          />
          <TextInput label={S.movimientos.nota} value={note} onChangeText={setNote} mode="outlined" />
          {equivalent && (
            <Text style={{ color: '#666' }}>
              {type === 'gasto' ? 'Gasto' : 'Ingreso'} de{' '}
              {currency === 'VES' ? `Bs ${fmt(amount)}` : `$${fmt(amount)}`} ({equivalent})
            </Text>
          )}
        </View>
      )}
    </StepForm>
  );
}

const styles = StyleSheet.create({
  bigOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ddd',
    padding: 18,
  },
  bigOptionSelected: { borderColor: AppColors.primary },
  optionDesc: { color: '#777', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catItem: {
    width: '31%',
    borderWidth: 2,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    gap: 4,
    minHeight: 76,
  },
  catLabel: { fontSize: 11, textAlign: 'center' },
});
