import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, DataTable, HelperText, Text } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import { BinanceAccount, getAccount, hasCredentials } from '@/services/binance';

function formatAmount(n: number): string {
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (n < 1000) return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}

export default function BinanceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [account, setAccount] = useState<BinanceAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    setError(null);
    try {
      setAccount(await getAccount());
    } catch (e: any) {
      setAccount(null);
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const has = await hasCredentials();
      setConfigured(has);
      if (has) {
        setLoading(true);
        await loadAccount();
      }
    })();
  }, [loadAccount]);

  if (configured === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.fondo }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Binance' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: AppColors.fondo }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom }}
        refreshControl={
          configured ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadAccount();
              }}
            />
          ) : undefined
        }>
        {!configured ? (
          <Card>
            <Card.Content style={{ gap: 10 }}>
              <Text variant="titleMedium">Binance no está conectado</Text>
              <Text style={{ color: '#666', fontSize: 13 }}>
                Ve a Ajustes, pega tu API Key y Secret (con permiso de solo lectura), y vuelve aquí.
              </Text>
              <Button mode="contained" icon="cog" onPress={() => router.push('/ajustes' as never)}>
                Ir a Ajustes
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <Card>
            <Card.Content style={{ gap: 6 }}>
              <Text variant="titleMedium">
                Cuenta {account?.accountType ? `(${account.accountType})` : ''}
              </Text>
              {error && (
                <HelperText type="error" visible>
                  {error}
                </HelperText>
              )}
              {loading ? (
                <ActivityIndicator />
              ) : account ? (
                account.balances.length === 0 ? (
                  <Text style={{ color: '#666' }}>No tienes saldo en spot.</Text>
                ) : (
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title>Activo</DataTable.Title>
                      <DataTable.Title numeric>Disponible</DataTable.Title>
                      <DataTable.Title numeric>Bloqueado</DataTable.Title>
                    </DataTable.Header>
                    {account.balances.map((b) => (
                      <DataTable.Row key={b.asset}>
                        <DataTable.Cell>{b.asset}</DataTable.Cell>
                        <DataTable.Cell numeric>{formatAmount(b.free)}</DataTable.Cell>
                        <DataTable.Cell numeric>{formatAmount(b.locked)}</DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>
                )
              ) : null}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </>
  );
}
