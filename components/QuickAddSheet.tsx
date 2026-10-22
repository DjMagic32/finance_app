import { MaterialCommunityIcons } from '@expo/vector-icons';
import { desc, eq } from 'drizzle-orm';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Text, TextInput } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';
import { db, nowISO, todayISO } from '@/db';
import { categories, transactions, type Category } from '@/db/schema';
import { getTopCategories, type TopCategoryRow } from '@/services/insights';
import { getLatestRates } from '@/services/rates';
import { evaluateExpenseRisk, registerActivity } from '@/services/score';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

interface LastTx {
  id: number;
  type: 'ingreso' | 'gasto';
  amount: number;
  currency: 'VES' | 'USD';
  categoryId: number | null;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  note: string | null;
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function QuickAddSheet({ visible, onClose, onSaved }: Props) {
  const [tops, setTops] = useState<TopCategoryRow[]>([]);
  const [last, setLast] = useState<LastTx | null>(null);
  const [chosen, setChosen] = useState<{ cat: Category; type: 'ingreso' | 'gasto' } | null>(null);
  const [repeatMode, setRepeatMode] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) {
      setChosen(null);
      setRepeatMode(false);
      setAmountText('');
      return;
    }
    setLoading(true);
    (async () => {
      const [topRes, catRows, lastRes] = await Promise.all([
        getTopCategories(4),
        db.select().from(categories),
        db.select().from(transactions).orderBy(desc(transactions.id)).limit(1),
      ]);
      setTops(topRes);
      const catById = new Map(catRows.map((c) => [c.id, c]));
      if (lastRes.length > 0) {
        const t = lastRes[0];
        const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
        setLast({
          id: t.id,
          type: t.type,
          amount: t.amount,
          currency: t.currency,
          categoryId: t.categoryId,
          categoryName: cat?.name,
          categoryIcon: cat?.icon,
          categoryColor: cat?.color,
          note: t.note,
        });
      } else {
        setLast(null);
      }
      setLoading(false);
    })();
  }, [visible]);

  const pickCategory = async (row: TopCategoryRow) => {
    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, row.categoryId))
      .limit(1);
    if (cat) {
      setChosen({ cat, type: cat.kind });
      setAmountText('');
    }
  };

  const startRepeat = () => {
    if (!last) return;
    setRepeatMode(true);
    setAmountText(String(last.amount));
  };

  const save = async () => {
    const amount = parseFloat(amountText.replace(',', '.')) || 0;
    if (amount <= 0) return;
    setSaving(true);
    try {
      let type: 'ingreso' | 'gasto';
      let categoryId: number | null;
      let currency: 'VES' | 'USD';
      let note: string | null = null;

      if (repeatMode && last) {
        type = last.type;
        categoryId = last.categoryId;
        currency = last.currency;
        note = last.note;
      } else if (chosen) {
        type = chosen.type;
        categoryId = chosen.cat.id;
        currency = 'VES';
      } else {
        setSaving(false);
        return;
      }

      const rates = await getLatestRates();
      const best = rates.paralelo ?? rates.bcv ?? rates.binance_p2p;
      const rate = best?.rate ?? null;
      const amountUsd = currency === 'USD' ? amount : rate ? amount / rate : 0;
      const amountVes = currency === 'VES' ? amount : rate ? amount * rate : amount;

      if (type === 'gasto') {
        const warn = await evaluateExpenseRisk(amountUsd);
        if (warn) {
          const ok = await new Promise<boolean>((resolve) => {
            Alert.alert('Piénsalo un momento', warn, [
              { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Guardar igual', onPress: () => resolve(true) },
            ]);
          });
          if (!ok) {
            setSaving(false);
            return;
          }
        }
      }

      await db.insert(transactions).values({
        type,
        categoryId,
        amount,
        currency,
        amountUsd,
        amountVes,
        rateUsed: rate,
        rateSource: best?.source ?? 'manual',
        note,
        date: todayISO(),
        createdAt: nowISO(),
      });

      await registerActivity();
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const amountValid = parseFloat(amountText.replace(',', '.')) > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>
            Anotar rápido
          </Text>

          {loading ? (
            <ActivityIndicator />
          ) : chosen || repeatMode ? (
            <View style={{ gap: 12 }}>
              <View style={styles.pickedRow}>
                {chosen ? (
                  <>
                    <MaterialCommunityIcons
                      name={chosen.cat.icon as any}
                      size={26}
                      color={chosen.cat.color}
                    />
                    <Text style={{ flex: 1, fontWeight: 'bold' }}>{chosen.cat.name}</Text>
                    <Text style={{ color: chosen.type === 'gasto' ? Semaforo.rojo : Semaforo.verde }}>
                      {chosen.type === 'gasto' ? 'Gasto' : 'Ingreso'}
                    </Text>
                  </>
                ) : last ? (
                  <>
                    <MaterialCommunityIcons
                      name={(last.categoryIcon as any) ?? 'repeat'}
                      size={26}
                      color={last.categoryColor ?? '#888'}
                    />
                    <Text style={{ flex: 1, fontWeight: 'bold' }}>
                      Repetir: {last.categoryName ?? 'sin categoría'}
                    </Text>
                    <Text style={{ color: last.type === 'gasto' ? Semaforo.rojo : Semaforo.verde }}>
                      {last.type === 'gasto' ? 'Gasto' : 'Ingreso'}
                    </Text>
                  </>
                ) : null}
              </View>
              <TextInput
                label={chosen ? 'Monto (Bs)' : `Monto (${last?.currency === 'USD' ? '$' : 'Bs'})`}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                mode="outlined"
                autoFocus
                style={{ fontSize: 24 }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  mode="text"
                  onPress={() => {
                    setChosen(null);
                    setRepeatMode(false);
                    setAmountText('');
                  }}
                  style={{ flex: 1 }}>
                  Atrás
                </Button>
                <Button
                  mode="contained"
                  onPress={save}
                  loading={saving}
                  disabled={!amountValid || saving}
                  style={{ flex: 2 }}>
                  Guardar
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {last && (
                <>
                  <Pressable style={styles.optRow} onPress={startRepeat}>
                    <MaterialCommunityIcons name="repeat" size={26} color={AppColors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold' }}>Repetir último</Text>
                      <Text style={{ color: '#666', fontSize: 13 }}>
                        {last.categoryName ?? 'sin categoría'} ·{' '}
                        {last.currency === 'USD' ? '$' : 'Bs '}
                        {fmt(last.amount)}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#888" />
                  </Pressable>
                  <Divider style={{ marginVertical: 4 }} />
                </>
              )}
              {tops.length === 0 ? (
                <Text style={{ color: '#666', padding: 8 }}>
                  Aún no hay categorías frecuentes. Anota unos movimientos y aquí aparecerán.
                </Text>
              ) : (
                tops.map((t) => (
                  <Pressable
                    key={t.categoryId}
                    style={styles.optRow}
                    onPress={() => pickCategory(t)}>
                    <MaterialCommunityIcons name={t.icon as any} size={26} color={t.color} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold' }}>{t.name}</Text>
                      <Text style={{ color: '#666', fontSize: 13 }}>
                        {t.count} vez{t.count === 1 ? '' : 'es'} en los últimos 30 días
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#888" />
                  </Pressable>
                ))
              )}
              <Divider style={{ marginVertical: 4 }} />
              <Button mode="text" onPress={onClose}>
                Cancelar
              </Button>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 8,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    marginBottom: 12,
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
});
