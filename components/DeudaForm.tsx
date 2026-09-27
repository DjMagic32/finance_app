import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { SegmentedButtons, Text, TextInput } from 'react-native-paper';

import StepForm from '@/components/StepForm';
import { todayISO } from '@/db';
import { type Debt } from '@/db/schema';
import { createDebt, rebuildDebt, updateDebtBasic } from '@/services/debts';
import { setupNotifications } from '@/services/notifications';
import { getLatestRates } from '@/services/rates';

export default function DeudaForm({
  existing,
  hasPaid = false,
  firstDueDate,
  installmentCount,
  onDone,
}: {
  existing?: Debt;
  hasPaid?: boolean; // con pagos hechos solo se puede editar nombre y descripción
  firstDueDate?: string;
  installmentCount?: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [creditor, setCreditor] = useState(existing?.creditor ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amountText, setAmountText] = useState(existing ? String(existing.totalAmount) : '');
  const [currency, setCurrency] = useState<'VES' | 'USD'>(existing?.currency ?? 'USD');
  const [schedule, setSchedule] = useState<Debt['schedule']>(existing?.schedule ?? 'unica');
  const [installmentsText, setInstallmentsText] = useState(String(installmentCount ?? 2));
  const [dueDate, setDueDate] = useState(firstDueDate ?? '');
  const [rate, setRate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLatestRates().then((r) => {
      const best = r.paralelo ?? r.bcv ?? r.binance_p2p;
      if (best) setRate(best.rate);
    });
  }, []);

  const amount = parseFloat(amountText.replace(',', '.')) || 0;
  const installments = schedule === 'unica' ? 1 : parseInt(installmentsText, 10) || 1;
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && (dueDate >= todayISO() || dueDate === firstDueDate);

  const creditorOk = creditor.trim().length > 0;
  const canNext = hasPaid
    ? creditorOk && !saving
    : [creditorOk, amount > 0, dateOk && !saving][step];

  const save = async () => {
    setSaving(true);

    if (existing && hasPaid) {
      await updateDebtBasic(existing.id, creditor.trim(), description.trim() || null);
      onDone();
      return;
    }

    const granted = await setupNotifications();
    const totalAmountUsd = currency === 'USD' ? amount : rate ? amount / rate : amount;
    const input = {
      creditor: creditor.trim(),
      description: description.trim() || null,
      totalAmount: amount,
      currency,
      totalAmountUsd,
      dueDate,
      schedule,
      installments,
    };

    if (existing) await rebuildDebt(existing.id, input);
    else await createDebt(input);

    onDone();
    if (!granted) {
      setTimeout(
        () =>
          Alert.alert(
            'Sin permiso de notificaciones',
            'La deuda se guardó, pero no podré recordarte los pagos. Activa las notificaciones en Ajustes del teléfono.',
          ),
        400,
      );
    }
  };

  const titles = hasPaid
    ? ['¿A quién le debes?']
    : ['¿A quién le debes?', '¿Cuánto debes?', '¿Cómo la vas a pagar?'];

  return (
    <StepForm
      step={step}
      setStep={setStep}
      titles={titles}
      canNext={canNext}
      onSubmit={save}
      saving={saving}
      submitLabel="Guardar deuda">
      {step === 0 && (
        <View style={{ gap: 14 }}>
          <TextInput
            label="¿A quién le debes?"
            value={creditor}
            onChangeText={setCreditor}
            mode="outlined"
            autoFocus={!existing}
          />
          <TextInput
            label="¿Por qué? (opcional)"
            value={description}
            onChangeText={setDescription}
            mode="outlined"
          />
          {hasPaid && (
            <Text style={{ color: '#666' }}>
              Esta deuda ya tiene pagos hechos, por eso solo puedes cambiar el nombre y la
              descripción. Si necesitas cambiar montos, elimínala y créala de nuevo.
            </Text>
          )}
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
            label="Monto total"
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
            onValueChange={(v) => setSchedule(v as Debt['schedule'])}
            buttons={[
              { value: 'unica', label: 'Un pago' },
              { value: 'semanal', label: 'Semanal' },
              { value: 'quincenal', label: 'Quincenal' },
              { value: 'mensual', label: 'Mensual' },
            ]}
          />
          {schedule !== 'unica' && (
            <TextInput
              label="¿En cuántas cuotas?"
              value={installmentsText}
              onChangeText={setInstallmentsText}
              keyboardType="number-pad"
              mode="outlined"
            />
          )}
          <TextInput
            label={
              schedule === 'unica' ? 'Fecha de pago (AAAA-MM-DD)' : 'Primera cuota (AAAA-MM-DD)'
            }
            value={dueDate}
            onChangeText={setDueDate}
            placeholder={todayISO()}
            mode="outlined"
            error={dueDate.length > 0 && !dateOk}
          />
          {dueDate.length > 0 && !dateOk && (
            <Text style={{ color: 'red', fontSize: 12 }}>
              Escribe la fecha como 2026-08-15 y que no sea en el pasado.
            </Text>
          )}
        </View>
      )}
    </StepForm>
  );
}
