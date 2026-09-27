import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SegmentedButtons, Text, TextInput } from 'react-native-paper';

import StepForm from '@/components/StepForm';
import { db, todayISO } from '@/db';
import { categories, type Recurring } from '@/db/schema';
import { createRecurring, deleteRecurring, updateRecurring } from '@/services/recurring';
import { setupNotifications } from '@/services/notifications';

export default function FijoForm({
  existing,
  onDone,
}: {
  existing?: Recurring;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.name ?? '');
  const [amountText, setAmountText] = useState(existing ? String(existing.amount) : '');
  const [currency, setCurrency] = useState<'VES' | 'USD'>(existing?.currency ?? 'VES');
  const [schedule, setSchedule] = useState<Recurring['schedule']>(
    existing?.schedule ?? 'mensual',
  );
  const [nextDue, setNextDue] = useState(existing?.nextDue ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(existing?.categoryId ?? null);
  const [saving, setSaving] = useState(false);

  const { data: cats } = useLiveQuery(
    db.select().from(categories).where(eq(categories.kind, 'gasto')).orderBy(categories.sortOrder),
  );

  const amount = parseFloat(amountText.replace(',', '.')) || 0;
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(nextDue) &&
    (nextDue >= todayISO() || nextDue === existing?.nextDue);

  const canNext = [
    name.trim().length > 0,
    amount > 0,
    dateOk,
    categoryId != null && !saving,
  ][step];

  const save = async () => {
    setSaving(true);
    await setupNotifications();
    const input = {
      name: name.trim(),
      categoryId,
      amount,
      currency,
      schedule,
      nextDue,
    };
    if (existing) await updateRecurring(existing.id, input);
    else await createRecurring(input);
    onDone();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Eliminar gasto fijo', 'Se borrará junto con sus recordatorios. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteRecurring(existing.id);
          onDone();
        },
      },
    ]);
  };

  return (
    <StepForm
      step={step}
      setStep={setStep}
      titles={['¿Qué pago es?', '¿Cuánto pagas?', '¿Cada cuánto toca?', '¿En qué categoría va?']}
      canNext={canNext}
      onSubmit={save}
      saving={saving}
      onDelete={existing ? remove : undefined}>
      {step === 0 && (
        <TextInput
          label="Nombre (ej: Internet, Luz, Netflix)"
          value={name}
          onChangeText={setName}
          mode="outlined"
          autoFocus={!existing}
        />
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
            label="Monto"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            mode="outlined"
            style={{ fontSize: 28 }}
            autoFocus
          />
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 14 }}>
          <SegmentedButtons
            value={schedule}
            onValueChange={(v) => setSchedule(v as Recurring['schedule'])}
            buttons={[
              { value: 'semanal', label: 'Semanal' },
              { value: 'quincenal', label: 'Quincenal' },
              { value: 'mensual', label: 'Mensual' },
            ]}
          />
          <TextInput
            label="Próximo pago (AAAA-MM-DD)"
            value={nextDue}
            onChangeText={setNextDue}
            placeholder={todayISO()}
            mode="outlined"
            error={nextDue.length > 0 && !dateOk}
          />
          {nextDue.length > 0 && !dateOk && (
            <Text style={{ color: 'red', fontSize: 12 }}>
              Escribe la fecha como 2026-08-15 y que no sea en el pasado.
            </Text>
          )}
        </View>
      )}

      {step === 3 && (
        <View style={styles.grid}>
          {(cats ?? []).map((c) => {
            const selected = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
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
    </StepForm>
  );
}

const styles = StyleSheet.create({
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
