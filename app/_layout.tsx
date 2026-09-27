import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import { S } from '@/constants/strings';
import { paperTheme } from '@/constants/theme';
import { db, seedIfEmpty } from '@/db';
import migrations from '@/drizzle/migrations';
import { checkOverdue } from '@/services/debts';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (success) {
      seedIfEmpty()
        .then(() => setSeeded(true))
        .then(() => checkOverdue().catch(() => {}));
    }
  }, [success]);

  useEffect(() => {
    if (seeded || error) {
      SplashScreen.hideAsync();
    }
  }, [seeded, error]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text>Error preparando la base de datos: {error.message}</Text>
      </View>
    );
  }

  if (!seeded) return null;

  return (
    <PaperProvider theme={paperTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="movimiento/nuevo"
          options={{ presentation: 'modal', title: S.movimientos.nuevo }}
        />
        <Stack.Screen
          name="movimiento/[id]"
          options={{ presentation: 'modal', title: 'Editar movimiento' }}
        />
        <Stack.Screen name="fijos" options={{ title: 'Gastos fijos' }} />
        <Stack.Screen name="mercado/index" options={{ title: 'Lista de mercado' }} />
        <Stack.Screen name="mercado/[id]" options={{ title: 'Mercado' }} />
        <Stack.Screen
          name="fijo/nuevo"
          options={{ presentation: 'modal', title: 'Nuevo gasto fijo' }}
        />
        <Stack.Screen
          name="fijo/[id]"
          options={{ presentation: 'modal', title: 'Editar gasto fijo' }}
        />
        <Stack.Screen
          name="deuda/nueva"
          options={{ presentation: 'modal', title: 'Nueva deuda' }}
        />
        <Stack.Screen name="deuda/[id]" options={{ title: 'Deuda' }} />
        <Stack.Screen
          name="deuda/editar/[id]"
          options={{ presentation: 'modal', title: 'Editar deuda' }}
        />
        <Stack.Screen name="notas" options={{ title: S.mas.notas }} />
        <Stack.Screen name="logros" options={{ title: S.mas.logros }} />
        <Stack.Screen name="ajustes" options={{ title: S.mas.ajustes }} />
      </Stack>
    </PaperProvider>
  );
}
