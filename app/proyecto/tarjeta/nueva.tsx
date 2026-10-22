import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { createCard } from '@/services/projects';

export default function NuevaTarjetaScreen() {
  const router = useRouter();
  const { boardId, columnId } = useLocalSearchParams<{ boardId: string; columnId: string }>();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [estimatedText, setEstimatedText] = useState('');
  const [currency, setCurrency] = useState<'VES' | 'USD'>('USD');
  const [saving, setSaving] = useState(false);

  const estimatedValue = parseFloat(estimatedText.replace(',', '.'));
  const estimated = Number.isFinite(estimatedValue) && estimatedValue > 0 ? estimatedValue : null;
  const canSave = title.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = await createCard({
        boardId: Number(boardId),
        columnId: Number(columnId),
        title,
        note,
        estimatedAmount: estimated,
        estimatedCurrency: estimated ? currency : null,
      });
      router.replace(`/proyecto/tarjeta/${id}` as never);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Nueva tarjeta' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          label="Título"
          value={title}
          onChangeText={setTitle}
          mode="outlined"
          placeholder="Ej: Comprar inversor"
          autoFocus
        />
        <TextInput
          label="Notas (opcional)"
          value={note}
          onChangeText={setNote}
          mode="outlined"
          multiline
          numberOfLines={3}
          placeholder="Especificaciones, dónde comprar, contactos..."
        />

        <View>
          <Text style={styles.sectionLabel}>Costo estimado (opcional)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              label="Monto"
              value={estimatedText}
              onChangeText={setEstimatedText}
              keyboardType="decimal-pad"
              mode="outlined"
              style={{ flex: 1 }}
            />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <SegmentedButtons
                value={currency}
                onValueChange={(v) => setCurrency(v as 'VES' | 'USD')}
                buttons={[
                  { value: 'VES', label: 'Bs' },
                  { value: 'USD', label: '$' },
                ]}
              />
            </View>
          </View>
          <Text style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
            Después puedes dividir el costo en subtareas con sus propios precios.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button mode="outlined" style={{ flex: 1 }} onPress={() => router.back()}>
          Cancelar
        </Button>
        <Button
          mode="contained"
          style={{ flex: 2 }}
          disabled={!canSave}
          loading={saving}
          onPress={save}>
          Crear tarjeta
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 8 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});
