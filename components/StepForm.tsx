import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';

export default function StepForm({
  step,
  setStep,
  titles,
  canNext,
  onSubmit,
  saving = false,
  submitLabel = 'Guardar',
  onDelete,
  children,
}: {
  step: number;
  setStep: (s: number) => void;
  titles: string[];
  canNext: boolean;
  onSubmit: () => void;
  saving?: boolean;
  submitLabel?: string;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const count = titles.length;
  const isLast = step === count - 1;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.progressRow}>
        {titles.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i <= step ? AppColors.primary : '#ddd', flex: i === step ? 2 : 1 },
            ]}
          />
        ))}
      </View>
      <Text variant="titleLarge" style={styles.title}>
        {titles[step]}
      </Text>
      <Text style={styles.stepLabel}>
        Paso {step + 1} de {count}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        {onDelete && (
          <Button textColor={Semaforo.rojo} onPress={onDelete}>
            Eliminar
          </Button>
        )}
        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            style={{ flex: 1 }}
            disabled={step === 0}
            onPress={() => setStep(step - 1)}>
            Atrás
          </Button>
          {isLast ? (
            <Button
              mode="contained"
              style={{ flex: 2 }}
              disabled={!canNext || saving}
              loading={saving}
              onPress={onSubmit}>
              {submitLabel}
            </Button>
          ) : (
            <Button
              mode="contained"
              style={{ flex: 2 }}
              disabled={!canNext}
              onPress={() => setStep(step + 1)}>
              Siguiente
            </Button>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
  dot: { height: 6, borderRadius: 3 },
  title: { paddingHorizontal: 16, paddingTop: 14, fontWeight: 'bold' },
  stepLabel: { paddingHorizontal: 16, color: '#888', fontSize: 12, marginTop: 2 },
  footer: {
    padding: 16,
    gap: 4,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
});
