import { MaterialCommunityIcons } from '@expo/vector-icons';
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Dialog, FAB, Portal, Text, TextInput } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { db, nowISO, todayISO } from '@/db';
import { shoppingItems, shoppingLists } from '@/db/schema';

export default function MercadoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: lists } = useLiveQuery(
    db.select().from(shoppingLists).orderBy(desc(shoppingLists.date), desc(shoppingLists.id)),
  );
  const { data: allItems } = useLiveQuery(db.select().from(shoppingItems));

  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');

  const create = async () => {
    const today = todayISO();
    const finalName = name.trim() || `Mercado ${today.split('-').reverse().join('/')}`;
    const [list] = await db
      .insert(shoppingLists)
      .values({ name: finalName, date: today, createdAt: nowISO() })
      .returning();
    setVisible(false);
    setName('');
    router.push(`/mercado/${list.id}`);
  };

  const remove = (id: number, listName: string) => {
    Alert.alert('Eliminar lista', `¿Borramos "${listName}" con todos sus productos?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await db.delete(shoppingItems).where(eq(shoppingItems.listId, id));
          await db.delete(shoppingLists).where(eq(shoppingLists.id, id));
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      {(lists ?? []).length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="cart-outline" size={64} color="#bbb" />
          <Text style={styles.emptyText}>
            Crea tu lista de mercado con precios.{'\n'}Cuando repitas la compra, te diremos qué
            subió de precio y qué no.
          </Text>
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 90 + insets.bottom }}
          renderItem={({ item: l }) => {
            const items = (allItems ?? []).filter((i) => i.listId === l.id);
            const bought = items.filter((i) => i.bought).length;
            return (
              <Card
                onPress={() => router.push(`/mercado/${l.id}`)}
                onLongPress={() => remove(l.id, l.name)}>
                <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="cart" size={30} color={AppColors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{l.name}</Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>
                      {l.date.split('-').reverse().join('/')} · {bought}/{items.length} comprados
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#bbb" />
                </Card.Content>
              </Card>
            );
          }}
        />
      )}

      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>Nueva lista</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Nombre (opcional)"
              value={name}
              onChangeText={setName}
              placeholder={`Mercado ${todayISO().split('-').reverse().join('/')}`}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVisible(false)}>Cancelar</Button>
            <Button onPress={create}>Crear</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: 16 + insets.bottom }]}
        color="white"
        onPress={() => setVisible(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 16 },
  fab: { position: 'absolute', right: 16, backgroundColor: AppColors.primary },
});
