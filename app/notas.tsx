import { MaterialCommunityIcons } from '@expo/vector-icons';
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Dialog, FAB, Portal, ProgressBar, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';
import { db, nowISO } from '@/db';
import { notes } from '@/db/schema';
import { awardBadge } from '@/services/score';

function fmt(n: number) {
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}

export default function NotasScreen() {
  const insets = useSafeAreaInsets();
  const { data: rows } = useLiveQuery(db.select().from(notes).orderBy(desc(notes.updatedAt)));
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState<'nota' | 'meta'>('nota');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [goalText, setGoalText] = useState('');

  const [savingTo, setSavingTo] = useState<number | null>(null);
  const [saveAmountText, setSaveAmountText] = useState('');

  const goal = parseFloat(goalText.replace(',', '.')) || 0;
  const canSave = title.trim().length > 0 && (kind === 'nota' || goal > 0);

  const save = async () => {
    await db.insert(notes).values({
      title: title.trim(),
      body: body.trim() || null,
      kind,
      goalAmountUsd: kind === 'meta' ? goal : null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
    setVisible(false);
    setTitle('');
    setBody('');
    setGoalText('');
  };

  const addSaving = async () => {
    const amount = parseFloat(saveAmountText.replace(',', '.')) || 0;
    if (savingTo == null || amount <= 0) return;
    const [row] = await db.select().from(notes).where(eq(notes.id, savingTo)).limit(1);
    if (!row) return;
    const newSaved = row.goalSavedUsd + amount;
    await db
      .update(notes)
      .set({ goalSavedUsd: newSaved, updatedAt: nowISO() })
      .where(eq(notes.id, savingTo));
    setSavingTo(null);
    setSaveAmountText('');
    if (row.goalAmountUsd && newSaved >= row.goalAmountUsd) {
      const isNew = await awardBadge('meta_lograda');
      Alert.alert(
        isNew ? '🏆 ¡Nuevo logro!' : '🎉 ¡Lo lograste!',
        `Completaste tu meta "${row.title}". ¡Así se ahorra!`,
      );
    }
  };

  const remove = (id: number) => {
    Alert.alert('Eliminar', '¿Borramos esta nota?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => db.delete(notes).where(eq(notes.id, id)) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      {(rows ?? []).length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="notebook-outline" size={64} color="#bbb" />
          <Text style={styles.emptyText}>
            Guarda notas de tus finanzas o crea metas de ahorro.{'\n'}Ejemplo: "Ahorrar $100 para
            diciembre".
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 90 + insets.bottom }}
          renderItem={({ item: n }) => {
            const progress =
              n.kind === 'meta' && n.goalAmountUsd
                ? Math.min(1, n.goalSavedUsd / n.goalAmountUsd)
                : 0;
            return (
              <Card onLongPress={() => remove(n.id)}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons
                      name={n.kind === 'meta' ? 'flag' : 'note-text'}
                      size={22}
                      color={n.kind === 'meta' ? Semaforo.verde : AppColors.primary}
                    />
                    <Text variant="titleMedium" style={{ flex: 1 }}>
                      {n.title}
                    </Text>
                  </View>
                  {n.body ? <Text style={{ color: '#666', marginTop: 4 }}>{n.body}</Text> : null}
                  {n.kind === 'meta' && n.goalAmountUsd ? (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      <ProgressBar progress={progress} color={Semaforo.verde} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: '#666' }}>
                          ${fmt(n.goalSavedUsd)} de ${fmt(n.goalAmountUsd)}
                        </Text>
                        <Button compact onPress={() => setSavingTo(n.id)}>
                          Abonar
                        </Button>
                      </View>
                    </View>
                  ) : null}
                </Card.Content>
              </Card>
            );
          }}
        />
      )}

      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>Nueva {kind}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <SegmentedButtons
              value={kind}
              onValueChange={(v) => setKind(v as 'nota' | 'meta')}
              buttons={[
                { value: 'nota', label: 'Nota' },
                { value: 'meta', label: 'Meta de ahorro' },
              ]}
            />
            <TextInput label="Título" value={title} onChangeText={setTitle} mode="outlined" />
            <TextInput
              label="Detalle (opcional)"
              value={body}
              onChangeText={setBody}
              mode="outlined"
              multiline
            />
            {kind === 'meta' && (
              <TextInput
                label="¿Cuánto quieres ahorrar? ($)"
                value={goalText}
                onChangeText={setGoalText}
                keyboardType="decimal-pad"
                mode="outlined"
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVisible(false)}>Cancelar</Button>
            <Button onPress={save} disabled={!canSave}>
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={savingTo != null} onDismiss={() => setSavingTo(null)}>
          <Dialog.Title>Abonar a la meta</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="¿Cuánto ahorraste? ($)"
              value={saveAmountText}
              onChangeText={setSaveAmountText}
              keyboardType="decimal-pad"
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSavingTo(null)}>Cancelar</Button>
            <Button onPress={addSaving}>Abonar</Button>
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
