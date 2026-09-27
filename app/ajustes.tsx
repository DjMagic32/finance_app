import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, List, Switch, Text } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { exportTransactionsCSV } from '@/services/export';
import { setDailyHabitReminder, setupNotifications } from '@/services/notifications';

const HABIT_KEY = 'habit_reminder_enabled';

export default function AjustesScreen() {
  const insets = useSafeAreaInsets();
  const [habit, setHabit] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HABIT_KEY).then((v) => setHabit(v === '1'));
  }, []);

  const toggleHabit = async (value: boolean) => {
    setHabit(value);
    await AsyncStorage.setItem(HABIT_KEY, value ? '1' : '0');
    if (value) {
      const granted = await setupNotifications();
      if (!granted) {
        setHabit(false);
        await AsyncStorage.setItem(HABIT_KEY, '0');
        Alert.alert(
          'Sin permiso',
          'Activa las notificaciones de la app en los Ajustes del teléfono.',
        );
        return;
      }
    }
    await setDailyHabitReminder(value);
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await exportTransactionsCSV();
    } catch (e: any) {
      Alert.alert('Error', `No se pudo exportar: ${e?.message ?? e}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom }}>
      <Card>
        <List.Item
          title="Recordatorio diario (8 pm)"
          description="¿Anotaste tus gastos de hoy?"
          right={() => <Switch value={habit} onValueChange={toggleHabit} />}
        />
      </Card>

      <Card>
        <Card.Content style={{ gap: 8 }}>
          <Text variant="titleMedium">Respaldo de tus datos</Text>
          <Text style={{ color: '#666', fontSize: 13 }}>
            Tus datos solo viven en este teléfono. Exporta tus movimientos a un archivo CSV y
            guárdalo en Google Drive o donde prefieras.
          </Text>
          <Button mode="contained" onPress={onExport} loading={exporting} icon="export">
            Exportar movimientos (CSV)
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}
