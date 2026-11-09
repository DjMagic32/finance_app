import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button, Chip, Dialog, Portal, Text, TextInput } from 'react-native-paper';

import { db } from '@/db';
import { debtPayments, debts, debtTransactionAllocations, type Transaction } from '@/db/schema';
import { amountLabel, linkExpenseToDebt, unlinkExpenseFromDebt } from '@/services/debts';

export default function MovimientoDebtLink({ transaction }: { transaction: Transaction }) {
  const { data: debtRows } = useLiveQuery(db.select().from(debts));
  const { data: payments } = useLiveQuery(db.select().from(debtPayments));
  const { data: allocations } = useLiveQuery(db.select().from(debtTransactionAllocations));
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const all = allocations ?? [];
  const used = all.filter(a => a.transactionId === transaction.id).reduce((n, a) => n + a.amountCents, 0);
  const remaining = Math.max(0, Math.round(transaction.amount * 100) - used);
  const paymentById = new Map((payments ?? []).map(p => [p.id, p]));
  const linked = new Map<number, { expense: number; debt: number }>();
  for (const a of all.filter(a => a.transactionId === transaction.id)) {
    const debtId = paymentById.get(a.paymentId)?.debtId;
    if (debtId != null) {
      const previous = linked.get(debtId) ?? { expense: 0, debt: 0 };
      linked.set(debtId, { expense: previous.expense + a.amountCents, debt: previous.debt + a.debtAmountCents });
    }
  }
  const pendingFor = (debtId: number) => (payments ?? []).filter(p => p.debtId === debtId && !p.paidAt).reduce((sum, p) => sum + Math.max(0, Math.round(p.amount * 100) - all.filter(a => a.paymentId === p.id).reduce((n, a) => n + a.debtAmountCents, 0)), 0);
  const available = (debtRows ?? []).filter(d => pendingFor(d.id) > 0);
  const selectedDebt = available.find(d => d.id === selected);
  const equivalentRate = selectedDebt && selectedDebt.currency !== transaction.currency
    ? (selectedDebt.currency === 'USD' ? transaction.amountUsd : transaction.amountVes) / transaction.amount
    : 1;
  const hasEquivalentRate = Number.isFinite(equivalentRate) && equivalentRate > 0;

  const choose = (id: number) => {
    setSelected(id);
    const debt = available.find(d => d.id === id);
    if (!debt) return;
    const rate = debt.currency === transaction.currency ? 1 : (debt.currency === 'USD' ? transaction.amountUsd : transaction.amountVes) / transaction.amount;
    if (Number.isFinite(rate) && rate > 0) {
      // Round up the expense portion when necessary so a debt is not left
      // fractionally unpaid simply because the exchange rate falls between cents.
      const part = Math.min(remaining, Math.ceil(pendingFor(id) / rate));
      setAmount((part / 100).toFixed(2));
      setDebtAmount((Math.min(pendingFor(id), Math.round(part * rate)) / 100).toFixed(2));
    } else { setAmount((remaining / 100).toFixed(2)); setDebtAmount(''); }
  };
  const save = async () => {
    const value = amount.trim().replace(',', '.');
    const debtValue = selectedDebt?.currency === transaction.currency ? value : debtAmount.trim().replace(',', '.');
    if (!selected || !/^\d+(\.\d{1,2})?$/.test(value) || !/^\d+(\.\d{1,2})?$/.test(debtValue)) { Alert.alert('Monto inválido', 'Selecciona una deuda e introduce los montos válidos.'); return; }
    setBusy(true);
    try {
      await linkExpenseToDebt(transaction.id, selected, Math.round(Number(value) * 100), Math.round(Number(debtValue) * 100));
      setVisible(false); setSelected(null); setAmount(''); setDebtAmount('');
    } catch (e: any) { Alert.alert('No se pudo asociar', e?.message ?? 'Inténtalo nuevamente.'); }
    finally { setBusy(false); }
  };
  const unlink = (debtId: number, name: string) => Alert.alert('Desvincular deuda', `Se quitará de ${name} lo asociado con este gasto y se actualizará el saldo.`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desvincular', onPress: () => { void unlinkExpenseFromDebt(transaction.id, debtId).catch(e => Alert.alert('Error', e.message)); } },
  ]);

  return <>
    <View style={{ backgroundColor: 'white', paddingHorizontal: 14, paddingBottom: 10 }}>
      {[...linked.entries()].map(([id, amounts]) => {
        const debt = debtRows?.find(d => d.id === id);
        return <Chip key={id} onClose={() => unlink(id, debt?.creditor ?? 'la deuda')} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          {debt?.creditor ?? 'Deuda'} · {amountLabel(amounts.expense / 100, transaction.currency)}{debt && debt.currency !== transaction.currency ? ` → ${amountLabel(amounts.debt / 100, debt.currency)}` : ''}
        </Chip>;
      })}
      <Button icon="link-plus" compact disabled={remaining <= 0} onPress={() => setVisible(true)}>Asociar a deuda</Button>
    </View>
    <Portal><Dialog visible={visible} onDismiss={() => !busy && setVisible(false)}>
      <Dialog.Title>Asociar gasto a deuda</Dialog.Title>
      <Dialog.Content>
        <Text>Disponible del gasto: {amountLabel(remaining / 100, transaction.currency)}. El pago se aplica primero a las cuotas más antiguas.</Text>
        <ScrollView style={{ maxHeight: 220 }}><View style={{ gap: 6, paddingVertical: 10 }}>
          {available.length === 0 && <Text>No hay deudas con cuotas pendientes.</Text>}
          {available.map(d => <Chip key={d.id} selected={selected === d.id} onPress={() => choose(d.id)}>{d.creditor} · pendiente {amountLabel(pendingFor(d.id) / 100, d.currency)}</Chip>)}
        </View></ScrollView>
        {selectedDebt && <>
          <TextInput label={`Monto del gasto (${transaction.currency})`} value={amount} onChangeText={value => {
            setAmount(value);
            const number = Number(value.replace(',', '.'));
            if (selectedDebt.currency !== transaction.currency && hasEquivalentRate && Number.isFinite(number) && number >= 0) setDebtAmount((number * equivalentRate).toFixed(2));
          }} keyboardType="decimal-pad" mode="outlined" />
          {selectedDebt.currency !== transaction.currency && <>
            <Text style={{ marginTop: 8 }}>Confirma el equivalente en la moneda de la deuda. {hasEquivalentRate ? 'La sugerencia usa la tasa guardada en el movimiento; puedes cambiarla.' : 'Indícalo según la tasa usada para el pago.'}</Text>
            <TextInput label={`Abono a la deuda (${selectedDebt.currency})`} value={debtAmount} onChangeText={setDebtAmount} keyboardType="decimal-pad" mode="outlined" />
          </>}
          {(() => {
            const raw = (selectedDebt.currency === transaction.currency ? amount : debtAmount).trim().replace(',', '.');
            if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
            const cents = Math.round(Number(raw) * 100);
            if (!Number.isSafeInteger(cents) || cents <= 0 || cents > pendingFor(selectedDebt.id)) return null;
            const after = pendingFor(selectedDebt.id) - cents;
            return <Text style={{ marginTop: 8 }}>
              {after === 0 ? 'Este abono completará la deuda.' : `Después del abono quedarán pendientes ${amountLabel(after / 100, selectedDebt.currency)}.`}
            </Text>;
          })()}
        </>}
      </Dialog.Content>
      <Dialog.Actions><Button onPress={() => setVisible(false)} disabled={busy}>Cancelar</Button><Button onPress={() => void save()} disabled={!selected || busy} loading={busy}>Asociar</Button></Dialog.Actions>
    </Dialog></Portal>
  </>;
}
