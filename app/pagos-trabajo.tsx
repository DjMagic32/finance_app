import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button, Card, Chip, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { db, todayISO } from '@/db';
import DateField from '@/components/DateField';
import { transactions, workCompanies, workConversions, workDisbursements, workEmployees, workReceipts, workWeeks } from '@/db/schema';
import { registerConversion, registerDisbursement, registerWorkReceipt } from '@/services/work';

type Currency = 'VES' | 'USD' | 'USDT';
const parse = (s: string, places = 2) => {
  const value = s.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value)) return NaN;
  const n = Math.round(Number(value) * 10 ** places);
  return Number.isSafeInteger(n) ? n : NaN;
};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export default function PagosTrabajo() {
  const { data: weeks } = useLiveQuery(db.select().from(workWeeks));
  const { data: companies } = useLiveQuery(db.select().from(workCompanies));
  const { data: employees } = useLiveQuery(db.select().from(workEmployees));
  const { data: receipts } = useLiveQuery(db.select().from(workReceipts));
  const { data: disbursements } = useLiveQuery(db.select().from(workDisbursements));
  const { data: conversions } = useLiveQuery(db.select().from(workConversions));
  const { data: bank } = useLiveQuery(db.select().from(transactions));
  const [mode, setMode] = useState('receipt');
  const [editingId, setEditingId] = useState<number | undefined>();
  const [weekId, setWeekId] = useState<number | null>(null);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [currency, setCurrency] = useState<Currency>('VES');
  const [amount, setAmount] = useState('');
  const [credit, setCredit] = useState('');
  const [employeeAmount, setEmployeeAmount] = useState('0');
  const [usdt, setUsdt] = useState('');
  const [fee, setFee] = useState('0');
  const selectedWeek = weeks?.find(w => w.id === weekId);
  const selectedReceipt = receipts?.find(r => r.id === receiptId);
  const companyName = (id: number) => companies?.find(c => c.id === id)?.name ?? 'Empresa';
  const personName = (id: number | null) => employees?.find(e => e.id === id)?.name ?? 'Sin empleado';
  const reset = () => { setAmount(''); setCredit(''); setEmployeeAmount('0'); setUsdt(''); setFee('0'); setTransactionId(null); };

  const save = () => {
    try {
      if (!validDate(date)) throw new Error('Introduce una fecha válida en formato AAAA-MM-DD.');
      const cents = parse(amount);
      if (mode === 'receipt') {
        if (!selectedWeek) throw new Error('Selecciona una semana.');
        const emp = parse(employeeAmount);
        const credited = selectedWeek.currency === currency ? cents : parse(credit);
        registerWorkReceipt({ weekId: selectedWeek.id, transactionId, date, currency, amountCents: cents, weekCreditCents: credited, employeeId: emp > 0 ? employeeId : null, employeeCents: emp, personalCents: cents - emp }, editingId);
      } else if (mode === 'employee') {
        if (!selectedReceipt) throw new Error('Selecciona un reparto.');
        registerDisbursement({ receiptId: selectedReceipt.id, transactionId, date, amountCents: cents });
      } else {
        registerConversion({ transactionId, date, vesCents: cents, usdtMicros: parse(usdt, 6), feeMicros: parse(fee, 6) });
      }
      setEditingId(undefined); reset(); Alert.alert('Guardado', 'El registro se guardó correctamente.');
    } catch (e: any) { Alert.alert('No se pudo guardar', e?.message ?? 'Revisa los datos.'); }
  };

  const shareReceipt = async (r: typeof workReceipts.$inferSelect, target: 'empresa' | 'empleado') => {
    try {
      const week = weeks?.find(w => w.id === r.weekId);
      if (!week) throw new Error('No se encontró la semana.');
      const employeePayments = (disbursements ?? []).filter(d => d.receiptId === r.id);
      const employeePaid = employeePayments.reduce((n, d) => n + d.amountCents, 0);
      const details = employeePayments.map(d => `<li>${escape(d.date)}: ${(d.amountCents / 100).toFixed(2)} ${r.currency}</li>`).join('');
      const body = target === 'empresa'
        ? `<p>Fecha de recepción: ${escape(r.date)}</p><p>Recibido: ${(r.amountCents / 100).toFixed(2)} ${r.currency}</p><p>Aplicado a la semana: ${(r.weekCreditCents / 100).toFixed(2)} ${week.currency}</p>`
        : `<p>Empleado: ${escape(personName(r.employeeId))}</p><p>Asignado: ${(r.employeeCents / 100).toFixed(2)} ${r.currency}</p><p>Entregado: ${(employeePaid / 100).toFixed(2)} ${r.currency}</p><ul>${details}</ul><p>Pendiente: ${((r.employeeCents - employeePaid) / 100).toFixed(2)} ${r.currency}</p>`;
      const html = `<html><meta charset="utf-8"><body style="font-family:sans-serif;padding:32px"><h1>Comprobante de ${target === 'empresa' ? 'cobro' : 'pago a empleado'}</h1><p>Documento de control, no fiscal.</p><p>Empresa: ${escape(companyName(week.companyId))}</p><p>Semana: ${escape(week.startDate)} a ${escape(week.endDate)}</p>${body}</body></html>`;
      const pdf = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir comprobante' });
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'No se pudo generar el comprobante.'); }
  };

  const relevantBank = (bank ?? []).filter(t => mode === 'receipt' ? t.type === 'ingreso' && t.currency === currency : t.type === 'gasto' && t.currency === (mode === 'conversion' ? 'VES' : selectedReceipt?.currency));
  return <><Stack.Screen options={{ title: 'Pagos y conversiones' }} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 50 }}>
      <SegmentedButtons value={mode} onValueChange={v => { setMode(v); setEditingId(undefined); reset(); }} buttons={[{ value: 'receipt', label: 'Cobro' }, { value: 'employee', label: 'Empleado' }, { value: 'conversion', label: 'USDT' }]} />
      <Card><Card.Content style={{ gap: 8 }}>
        {mode === 'receipt' && <>
          <Text variant="titleMedium">Registrar cobro por semana</Text>
          <Text>Para un pago de varias semanas, registra una parte por cada semana y vincula el mismo movimiento.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(weeks ?? []).map(w => <Chip key={w.id} selected={weekId === w.id} onPress={() => setWeekId(w.id)}>{companyName(w.companyId)} · {w.startDate}</Chip>)}</View>
          {selectedWeek && <Text>Pendiente: {((selectedWeek.expectedCents - (receipts ?? []).filter(r => r.weekId === selectedWeek.id).reduce((n, r) => n + r.weekCreditCents, 0)) / 100).toFixed(2)} {selectedWeek.currency}</Text>}
          <SegmentedButtons value={currency} onValueChange={v => { setCurrency(v as Currency); setTransactionId(null); }} buttons={['VES', 'USD', 'USDT'].map(value => ({ value, label: value }))} />
          {selectedWeek && selectedWeek.currency !== currency && <TextInput mode="outlined" label={`Equivalente aplicado a la semana (${selectedWeek.currency})`} value={credit} onChangeText={setCredit} keyboardType="decimal-pad" />}
          <Text>Empleado (opcional):</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(employees ?? []).map(e => <Chip key={e.id} selected={employeeId === e.id} onPress={() => setEmployeeId(employeeId === e.id ? null : e.id)}>{e.name}</Chip>)}</View>
          <TextInput mode="outlined" label={`Parte del empleado (${currency})`} value={employeeAmount} onChangeText={setEmployeeAmount} keyboardType="decimal-pad" />
        </>}
        {mode === 'employee' && <><Text variant="titleMedium">Pago a empleado</Text>
          <Text>Selecciona el reparto al que corresponde el pago.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(receipts ?? []).filter(r => r.employeeId && r.employeeCents > (disbursements ?? []).filter(d => d.receiptId === r.id).reduce((n, d) => n + d.amountCents, 0)).map(r => <Chip key={r.id} selected={receiptId === r.id} onPress={() => { setReceiptId(r.id); setTransactionId(null); }}>{personName(r.employeeId)} · {r.date} · {r.currency}</Chip>)}</View>
        </>}
        {mode === 'conversion' && <><Text variant="titleMedium">Conversión de bolívares a USDT</Text>
          <TextInput mode="outlined" label="USDT recibidos" value={usdt} onChangeText={setUsdt} keyboardType="decimal-pad" />
          <TextInput mode="outlined" label="Comisión en USDT" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
        </>}
        <TextInput mode="outlined" label={mode === 'conversion' ? 'Bolívares entregados' : 'Monto del pago'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <DateField label="Fecha" value={date} onChange={setDate} />
        <Text>Movimiento bancario (opcional):</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{relevantBank.slice(-30).reverse().map(t => <Chip key={t.id} selected={transactionId === t.id} onPress={() => {
          if (transactionId === t.id) { setTransactionId(null); return; }
          const allocated = mode === 'receipt'
            ? (receipts ?? []).filter(r => r.transactionId === t.id && r.id !== editingId).reduce((n, r) => n + r.amountCents, 0)
            : (disbursements ?? []).filter(d => d.transactionId === t.id).reduce((n, d) => n + d.amountCents, 0) + (conversions ?? []).filter(c => c.transactionId === t.id).reduce((n, c) => n + c.vesCents, 0);
          setTransactionId(t.id); setDate(t.date); setAmount((Math.max(0, Math.round(t.amount * 100) - allocated) / 100).toFixed(2));
        }}>{t.date} · {t.amount} {t.currency}</Chip>)}</View>
        <Button mode="contained" onPress={save}>{editingId && mode === 'receipt' ? 'Guardar cambios' : 'Guardar'}</Button>
        {editingId && mode === 'receipt' && <Button onPress={() => { setEditingId(undefined); reset(); }}>Cancelar edición</Button>}
      </Card.Content></Card>
      <Card><Card.Content style={{ gap: 8 }}><Text variant="titleMedium">Cobros registrados</Text>
        {(receipts ?? []).map(r => { const w = weeks?.find(x => x.id === r.weekId); const paid = (disbursements ?? []).filter(d => d.receiptId === r.id).reduce((n, d) => n + d.amountCents, 0); return <View key={r.id}><Text>{w ? companyName(w.companyId) : 'Empresa'} · {w?.startDate} · {r.date}: {(r.amountCents / 100).toFixed(2)} {r.currency}</Text><Text>Tuyo: {(r.personalCents / 100).toFixed(2)} · Pendiente a {personName(r.employeeId)}: {((r.employeeCents - paid) / 100).toFixed(2)}</Text><Button onPress={() => { setMode('receipt'); setEditingId(r.id); setWeekId(r.weekId); setTransactionId(r.transactionId); setDate(r.date); setCurrency(r.currency); setAmount((r.amountCents / 100).toFixed(2)); setCredit((r.weekCreditCents / 100).toFixed(2)); setEmployeeId(r.employeeId); setEmployeeAmount((r.employeeCents / 100).toFixed(2)); }}>Editar reparto</Button><Button onPress={() => void shareReceipt(r, 'empresa')}>PDF para empresa</Button>{r.employeeId && <Button onPress={() => void shareReceipt(r, 'empleado')}>PDF para empleado</Button>}</View>; })}
        {(receipts ?? []).length === 0 && <Text>Sin cobros registrados.</Text>}
      </Card.Content></Card>
      <Card><Card.Content><Text variant="titleMedium">Conversiones registradas</Text>{(conversions ?? []).map(c => <Text key={c.id}>{c.date}: Bs {(c.vesCents / 100).toFixed(2)} → {(c.usdtMicros / 1e6).toFixed(6)} USDT · comisión {(c.feeMicros / 1e6).toFixed(6)}</Text>)}</Card.Content></Card>
      <Card><Card.Content style={{ gap: 8 }}><Text variant="titleMedium">Control de USDT</Text>
        <Text>USDT recibidos directamente (parte personal): {((receipts ?? []).filter(r => r.currency === 'USDT' && !r.transactionId).reduce((n, r) => n + r.personalCents, 0) / 100).toFixed(2)}</Text>
        <Text>USDT recibidos en conversiones: {((conversions ?? []).reduce((n, c) => n + c.usdtMicros, 0) / 1e6).toFixed(6)}</Text>
        <Text>Estos registros no calculan tu saldo de Binance ni se suman automáticamente al resumen en dólares.</Text>
      </Card.Content></Card>
    </ScrollView></>;
}
