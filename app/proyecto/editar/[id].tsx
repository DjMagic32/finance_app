import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { db } from '@/db';
import { projectBoards, type ProjectBoard } from '@/db/schema';
import { updateBoard } from '@/services/projects';

const COLOR_SWATCHES = ['#1565C0', '#2E7D32', '#F9A825', '#C62828', '#6A1B9A', '#00897B', '#EF6C00', '#546E7A'];
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

export default function EditarTableroScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [board, setBoard] = useState<ProjectBoard | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [budgetText, setBudgetText] = useState('');
  const [currency, setCurrency] = useState<'VES' | 'USD'>('USD');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.select()
      .from(projectBoards)
      .where(eq(projectBoards.id, Number(id)))
      .limit(1)
      .then((rows) => {
        const b = rows[0];
        if (!b) return;
        setBoard(b);
        setName(b.name);
        setDescription(b.description ?? '');
        setColor(b.color);
        setIcon(b.icon);
        setBudgetText(b.budgetAmount != null ? String(b.budgetAmount) : '');
        if (b.budgetCurrency) setCurrency(b.budgetCurrency);
      });
  }, [id]);

  if (!board) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const budgetValue = parseFloat(budgetText.replace(',', '.'));
  const budget = Number.isFinite(budgetValue) && budgetValue > 0 ? budgetValue : null;
  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateBoard(board.id, {
        name,
        description,
        icon,
        color,
        budgetAmount: budget,
        budgetCurrency: budget ? currency : null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Editar tablero' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput label="Nombre" value={name} onChangeText={setName} mode="outlined" />
        <TextInput
          label="Descripción"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          multiline
          numberOfLines={2}
        />
        <View>
          <Text style={styles.sectionLabel}>Presupuesto total</Text>
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
                style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? '#000' : 'transparent' }]}
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
        <Button mode="contained" style={{ flex: 2 }} disabled={!canSave} loading={saving} onPress={save}>
          Guardar
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
