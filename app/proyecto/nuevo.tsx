import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { createBoard } from '@/services/projects';

const COLOR_SWATCHES = [
  '#1565C0',
  '#2E7D32',
  '#F9A825',
  '#C62828',
  '#6A1B9A',
  '#00897B',
  '#EF6C00',
  '#546E7A',
];

const ICON_CHOICES = [
  'view-dashboard',
  'home-city',
  'solar-power',
  'tools',
  'silverware-fork-knife',
  'car',
  'airplane',
  'cash-multiple',
  'school',
  'medical-bag',
  'party-popper',
  'wrench',
];

export default function NuevoTableroScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [budgetText, setBudgetText] = useState('');
  const [currency, setCurrency] = useState<'VES' | 'USD'>('USD');
  const [saving, setSaving] = useState(false);

  const budgetValue = parseFloat(budgetText.replace(',', '.'));
  const budget = Number.isFinite(budgetValue) && budgetValue > 0 ? budgetValue : null;
  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = await createBoard({
        name,
        description,
        icon,
        color,
        budgetAmount: budget,
        budgetCurrency: budget ? currency : null,
      });
      router.replace(`/proyecto/${id}` as never);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Nuevo tablero' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          label="Nombre del tablero"
          value={name}
          onChangeText={setName}
          mode="outlined"
          placeholder="Ej: Inversor solar"
          autoFocus
        />
        <TextInput
          label="Descripción (opcional)"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          multiline
          numberOfLines={2}
        />

        <View>
          <Text style={styles.sectionLabel}>Presupuesto total (opcional)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              label="Monto"
              value={budgetText}
              onChangeText={setBudgetText}
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
        </View>

        <View>
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.swatchRow}>
            {COLOR_SWATCHES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c, borderColor: color === c ? '#000' : 'transparent' },
                ]}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>Icono</Text>
          <View style={styles.iconGrid}>
            {ICON_CHOICES.map((i) => (
              <Pressable
                key={i}
                onPress={() => setIcon(i)}
                style={[
                  styles.iconChip,
                  { borderColor: icon === i ? color : '#ddd', backgroundColor: icon === i ? `${color}22` : 'white' },
                ]}>
                <MaterialCommunityIcons name={i as any} size={24} color={icon === i ? color : '#666'} />
              </Pressable>
            ))}
          </View>
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
          Crear tablero
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 13, color: '#666', fontWeight: '600', marginBottom: 8 },
  swatchRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  iconGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  iconChip: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});
