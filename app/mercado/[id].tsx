import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Dialog, FAB, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';
import { db } from '@/db';
import { shoppingItems, shoppingLists, type ShoppingItem } from '@/db/schema';
import {
  getRateForConversion,
  listToText,
  normalizeName,
  previousPrice,
  registerListAsExpense,
} from '@/services/market';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PriceCompare = Record<number, { deltaPct: number; date: string } | null>;

export default function DetalleMercado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Number(id);
  const insets = useSafeAreaInsets();

  const { data: listRows } = useLiveQuery(
    db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)),
    [listId],
  );
  const { data: items } = useLiveQuery(
    db.select().from(shoppingItems).where(eq(shoppingItems.listId, listId)).orderBy(shoppingItems.id),
    [listId],
  );

  const list = listRows?.[0];
  const [compare, setCompare] = useState<PriceCompare>({});
  const [rate, setRate] = useState<number | null>(null);

  const [editing, setEditing] = useState<ShoppingItem | 'new' | null>(null);
  const [name, setName] = useState('');
  const [qtyText, setQtyText] = useState('1');
  const [priceText, setPriceText] = useState('');
  const [currency, setCurrency] = useState<'VES' | 'USD'>('VES');

  useEffect(() => {
    getRateForConversion().then(setRate);
  }, []);

  useEffect(() => {
    if (!list || !items) return;
    (async () => {
      const out: PriceCompare = {};
      for (const it of items) {
        if (it.priceUsd == null || it.priceUsd <= 0) {
          out[it.id] = null;
          continue;
        }
        const prev = await previousPrice(it.nameNorm, listId, list.date);
        out[it.id] = prev
          ? { deltaPct: ((it.priceUsd - prev.priceUsd) / prev.priceUsd) * 100, date: prev.date }
          : null;
      }
      setCompare(out);
    })();
  }, [items, list]);

  if (!list) return null;

  const openEditor = (item: ShoppingItem | 'new') => {
    if (item === 'new') {
      setName('');
      setQtyText('1');
      setPriceText('');
      setCurrency('VES');
    } else {
      setName(item.name);
      setQtyText(String(item.qty));
      setPriceText(item.price != null ? String(item.price) : '');
      setCurrency(item.currency);
    }
    setEditing(item);
  };

  const saveItem = async () => {
    const qty = parseFloat(qtyText.replace(',', '.')) || 1;
    const price = parseFloat(priceText.replace(',', '.')) || null;
    const priceUsd =
      price == null ? null : currency === 'USD' ? price : rate ? price / rate : null;
    const values = {
      name: name.trim(),
      nameNorm: normalizeName(name),
      qty,
      price,
      currency,
      priceUsd,
    };
    if (editing === 'new') {
      await db.insert(shoppingItems).values({ ...values, listId });
    } else if (editing) {
      await db.update(shoppingItems).set(values).where(eq(shoppingItems.id, editing.id));
    }
    setEditing(null);
  };

  const removeItem = (item: ShoppingItem) => {
    Alert.alert('Eliminar', `¿Borramos "${item.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => db.delete(shoppingItems).where(eq(shoppingItems.id, item.id)),
      },
    ]);
  };

  const toggleBought = (item: ShoppingItem) =>
    db
      .update(shoppingItems)
      .set({ bought: item.bought ? 0 : 1 })
      .where(eq(shoppingItems.id, item.id));

  const share = async () => {
    await Share.share({
      message: listToText(list.name, items ?? []),
    });
  };

  const asExpense = () => {
    Alert.alert(
      'Anotar como gasto',
      'Sumaremos los productos marcados como comprados y lo anotaremos como gasto de "Comida y mercado" de hoy.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Anotar',
          onPress: async () => {
            const ok = await registerListAsExpense(listId);
            Alert.alert(
              ok ? 'Listo' : 'Nada que anotar',
              ok
                ? 'Tu compra quedó registrada en Movimientos.'
                : 'Marca los productos comprados y ponles precio primero.',
            );
          },
        },
      ],
    );
  };

  const total = (items ?? [])
    .filter((i) => i.bought && i.priceUsd != null)
    .reduce((s, i) => s + i.priceUsd! * i.qty, 0);

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <Stack.Screen options={{ title: list.name }} />
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 90 + insets.bottom }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Button icon="share-variant" compact onPress={share}>
              Compartir
            </Button>
            <Button icon="cash-plus" compact onPress={asExpense}>
              Anotar como gasto
            </Button>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#666', marginTop: 40 }}>
            Agrega productos con el botón +{'\n'}Ponles precio para comparar entre compras.
          </Text>
        }
        renderItem={({ item: it }) => {
          const cmp = compare[it.id];
          return (
            <Card>
              <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => toggleBought(it)} hitSlop={8}>
                  <MaterialCommunityIcons
                    name={it.bought ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={28}
                    color={it.bought ? Semaforo.verde : '#999'}
                  />
                </Pressable>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => openEditor(it)}
                  onLongPress={() => removeItem(it)}>
                  <Text
                    variant="titleSmall"
                    style={it.bought ? { textDecorationLine: 'line-through', color: '#888' } : undefined}>
                    {it.name}
                    {it.qty !== 1 ? `  x${it.qty}` : ''}
                  </Text>
                  {it.price != null && (
                    <Text style={{ color: '#666', fontSize: 13 }}>
                      {it.currency === 'USD' ? '$' : 'Bs '}
                      {fmt(it.price)}
                      {it.priceUsd != null && it.currency === 'VES' ? ` (≈$${fmt(it.priceUsd)})` : ''}
                    </Text>
                  )}
                  {cmp && Math.abs(cmp.deltaPct) >= 1 && (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: 'bold',
                        color: cmp.deltaPct > 0 ? Semaforo.rojo : Semaforo.verde,
                      }}>
                      {cmp.deltaPct > 0 ? '▲ subió' : '▼ bajó'} {fmt(Math.abs(cmp.deltaPct))}% desde
                      el {cmp.date.split('-').reverse().join('/')}
                    </Text>
                  )}
                </Pressable>
              </Card.Content>
            </Card>
          );
        }}
        ListFooterComponent={
          total > 0 ? (
            <Text variant="titleMedium" style={{ textAlign: 'right', marginTop: 8 }}>
              Total comprado: ≈ ${fmt(total)}
            </Text>
          ) : null
        }
      />

      <Portal>
        <Dialog visible={editing != null} onDismiss={() => setEditing(null)}>
          <Dialog.Title>{editing === 'new' ? 'Nuevo producto' : 'Editar producto'}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <TextInput label="Producto" value={name} onChangeText={setName} mode="outlined" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                label="Cantidad"
                value={qtyText}
                onChangeText={setQtyText}
                keyboardType="decimal-pad"
                mode="outlined"
                style={{ width: 100 }}
              />
              <TextInput
                label="Precio (unidad)"
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="decimal-pad"
                mode="outlined"
                style={{ flex: 1 }}
              />
            </View>
            <SegmentedButtons
              value={currency}
              onValueChange={(v) => setCurrency(v as 'VES' | 'USD')}
              buttons={[
                { value: 'VES', label: 'Bs' },
                { value: 'USD', label: '$' },
              ]}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditing(null)}>Cancelar</Button>
            <Button onPress={saveItem} disabled={name.trim().length === 0}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: 16 + insets.bottom }]}
        color="white"
        onPress={() => openEditor('new')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 16, backgroundColor: AppColors.primary },
});
