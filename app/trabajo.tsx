import DictationInput from '@/components/DictationInput';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Button, Card, Chip, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { db } from '@/db';
import DateField from '@/components/DateField';
import { workCompanies, workEmployees, workWeeks, workReceipts } from '@/db/schema';

type Currency = 'VES' | 'USD' | 'USDT';

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export default function TrabajoScreen() {
  const router = useRouter();
  const { data: companies } = useLiveQuery(db.select().from(workCompanies));
  const { data: employees } = useLiveQuery(db.select().from(workEmployees));
  const { data: weeks } = useLiveQuery(db.select().from(workWeeks));
  const [companyName, setCompanyName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('VES');
  const [busy, setBusy] = useState(false);
  const [editingWeekId, setEditingWeekId] = useState<number | null>(null);

  const saveName = async (kind: 'company' | 'employee') => {
    const name = (kind === 'company' ? companyName : employeeName).trim();
    if (!name) return;
    try {
      if (kind === 'company') {
        const [row] = await db.insert(workCompanies).values({ name }).returning();
        setCompanyId(row.id);
        setCompanyName('');
      } else {
        await db.insert(workEmployees).values({ name });
        setEmployeeName('');
      }
    } catch { Alert.alert('Error', 'No se pudo guardar el nombre.'); }
  };

  const saveWeek = async () => {
    const normalized = amount.trim().replace(',', '.');
    const value = Number(normalized);
    if (!companyId || !validDate(start) || !validDate(end) || end < start || !/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isSafeInteger(Math.round(value * 100)) || value <= 0) {
      Alert.alert('Revisa los datos', 'Selecciona una empresa, introduce fechas válidas AAAA-MM-DD y un monto positivo de hasta dos decimales.');
      return;
    }
    setBusy(true);
    try {
      if (editingWeekId !== null && db.select().from(workReceipts).where(eq(workReceipts.weekId, editingWeekId)).get()) throw new Error('Esta semana ya tiene cobros y no se puede editar.');
      const values = { companyId, startDate: start, endDate: end, currency, expectedCents: Math.round(value * 100) };
      if (editingWeekId === null) await db.insert(workWeeks).values(values);
      else await db.update(workWeeks).set(values).where(eq(workWeeks.id, editingWeekId));
      setEditingWeekId(null);
      setStart(''); setEnd(''); setAmount('');
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'No se pudo guardar la semana.'); }
    finally { setBusy(false); }
  };

  return <>
    <Stack.Screen options={{ title: 'Trabajo y pagos' }} />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <Button mode="contained" icon="cash-multiple" onPress={() => router.push('/pagos-trabajo' as never)}>Pagos, comprobantes y USDT</Button>
      <Card><Card.Content style={{ gap: 8 }}>
        <Text variant="titleMedium">Empresas</Text>
        <DictationInput label="Nombre de la empresa" value={companyName} onChangeText={setCompanyName} mode="outlined" />
        <Button onPress={() => void saveName('company')} disabled={!companyName.trim()}>Añadir empresa</Button>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(companies ?? []).map(c => <Chip key={c.id} selected={companyId === c.id} onPress={() => setCompanyId(c.id)}>{c.name}</Chip>)}
        </View>
      </Card.Content></Card>
      <Card><Card.Content style={{ gap: 8 }}>
        <Text variant="titleMedium">Empleados</Text>
        <DictationInput label="Nombre" value={employeeName} onChangeText={setEmployeeName} mode="outlined" />
        <Button onPress={() => void saveName('employee')} disabled={!employeeName.trim()}>Añadir empleado</Button>
        <Text>{(employees ?? []).map(e => e.name).join(', ') || 'Todavía no hay empleados.'}</Text>
      </Card.Content></Card>
      <Card><Card.Content style={{ gap: 8 }}>
        <Text variant="titleMedium">{editingWeekId === null ? 'Registrar semana pendiente' : 'Editar semana'}</Text>
        <Text>Selecciona la empresa arriba e indica lo que esperas cobrar.</Text>
        <DateField label="Inicio" value={start} onChange={setStart} />
        <DateField label="Fin" value={end} onChange={setEnd} />
        <SegmentedButtons value={currency} onValueChange={v => setCurrency(v as Currency)} buttons={['VES', 'USD', 'USDT'].map(value => ({ value, label: value }))} />
        <TextInput label="Monto esperado" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" mode="outlined" />
        <Button mode="contained" loading={busy} disabled={busy} onPress={() => void saveWeek()}>Guardar semana</Button>
        {editingWeekId !== null && <Button onPress={() => { setEditingWeekId(null); setStart(''); setEnd(''); setAmount(''); }}>Cancelar edición</Button>}
      </Card.Content></Card>
      <Card><Card.Content style={{ gap: 8 }}>
        <Text variant="titleMedium">Semanas registradas</Text>
        {(weeks ?? []).length === 0 && <Text>Aún no hay semanas registradas.</Text>}
        {(weeks ?? []).map(w => <View key={w.id}>
          <Text>{companies?.find(c => c.id === w.companyId)?.name ?? 'Empresa'} · {w.startDate} a {w.endDate} · {(w.expectedCents / 100).toFixed(2)} {w.currency}</Text>
          <Button onPress={() => { setEditingWeekId(w.id); setCompanyId(w.companyId); setStart(w.startDate); setEnd(w.endDate); setCurrency(w.currency); setAmount((w.expectedCents / 100).toFixed(2)); }}>Editar</Button>
        </View>)}
      </Card.Content></Card>
    </ScrollView>
  </>;
}
