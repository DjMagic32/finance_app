import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Chip, HelperText, List, SegmentedButtons, Snackbar, Switch, Text, TextInput } from 'react-native-paper';

import { AppColors } from '@/constants/theme';
import {
  BinanceAccount,
  deleteCredentials as deleteBinanceCreds,
  getAccount as getBinanceAccount,
  getCredentials as getBinanceCreds,
  saveCredentials as saveBinanceCreds,
  testConnection as testBinanceConnection,
} from '@/services/binance';
import { getBudgetConfig, setBudgetConfig } from '@/services/budget';
import { exportTransactionsCSV } from '@/services/export';
import {
  copyPasswordWithAutoClear,
  getMercantilCreds,
  saveMercantilCreds,
} from '@/services/mercantil';
import { setDailyHabitReminder, setupNotifications } from '@/services/notifications';

const HABIT_KEY = 'habit_reminder_enabled';

export default function AjustesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [snack, setSnack] = useState<string | null>(null);
  const clearHandle = useRef<number | null>(null);

  // --- Recordatorios ---
  const [habit, setHabit] = useState(false);

  // --- Presupuesto ---
  const [savingsPct, setSavingsPct] = useState<number>(20);

  // --- Binance ---
  const [binanceConnected, setBinanceConnected] = useState(false);
  const [binanceAccount, setBinanceAccount] = useState<BinanceAccount | null>(null);
  const [binanceKey, setBinanceKey] = useState('');
  const [binanceSecret, setBinanceSecret] = useState('');
  const [showBinanceSecret, setShowBinanceSecret] = useState(false);
  const [savingBinance, setSavingBinance] = useState(false);

  // --- Mercantil ---
  const [mercUser, setMercUser] = useState('');
  const [mercPass, setMercPass] = useState('');
  const [showMercPass, setShowMercPass] = useState(false);
  const [savingMerc, setSavingMerc] = useState(false);

  // --- Datos ---
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const h = await AsyncStorage.getItem(HABIT_KEY);
      setHabit(h === '1');

      const bc = await getBinanceCreds();
      if (bc) {
        setBinanceConnected(true);
        try {
          setBinanceAccount(await getBinanceAccount());
        } catch {
          // no bloqueamos si falla, se muestra sin balances
        }
      }

      const mc = await getMercantilCreds();
      setMercUser(mc.username);
      setMercPass(mc.password);

      const cfg = await getBudgetConfig();
      setSavingsPct(cfg.savingsPct);
    })();

    return () => {
      if (clearHandle.current) clearTimeout(clearHandle.current);
    };
  }, []);

  // --- Handlers ---

  const toggleHabit = async (value: boolean) => {
    setHabit(value);
    await AsyncStorage.setItem(HABIT_KEY, value ? '1' : '0');
    if (value) {
      const granted = await setupNotifications();
      if (!granted) {
        setHabit(false);
        await AsyncStorage.setItem(HABIT_KEY, '0');
        Alert.alert('Sin permiso', 'Activa las notificaciones de la app en los Ajustes del teléfono.');
        return;
      }
    }
    await setDailyHabitReminder(value);
  };

  const onSaveBinance = async () => {
    if (!binanceKey.trim() || !binanceSecret.trim()) {
      Alert.alert('Faltan datos', 'API Key y Secret son obligatorios.');
      return;
    }
    setSavingBinance(true);
    try {
      await saveBinanceCreds({ apiKey: binanceKey, apiSecret: binanceSecret });
      const result = await testBinanceConnection();
      if (!result.ok) {
        await deleteBinanceCreds();
        Alert.alert('No pudimos conectar', result.error);
        setSavingBinance(false);
        return;
      }
      setBinanceKey('');
      setBinanceSecret('');
      setShowBinanceSecret(false);
      setBinanceConnected(true);
      setBinanceAccount(await getBinanceAccount());
      setSnack('Binance conectado.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setSavingBinance(false);
    }
  };

  const onDisconnectBinance = () => {
    Alert.alert('Desconectar Binance', 'Se borrarán las claves de este teléfono. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          await deleteBinanceCreds();
          setBinanceConnected(false);
          setBinanceAccount(null);
          setSnack('Binance desconectado.');
        },
      },
    ]);
  };

  const onSaveMerc = async () => {
    setSavingMerc(true);
    try {
      await saveMercantilCreds({ username: mercUser, password: mercPass });
      setSnack('Datos de Mercantil guardados.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setSavingMerc(false);
    }
  };

  const onCopyMercPass = async () => {
    if (!mercPass) return;
    if (clearHandle.current) clearTimeout(clearHandle.current);
    clearHandle.current = await copyPasswordWithAutoClear(mercPass);
    setSnack('Clave copiada. Se borra del portapapeles en 45 s.');
  };

  const onCopyMercUser = async () => {
    if (!mercUser) return;
    const clip = await import('expo-clipboard');
    await clip.setStringAsync(mercUser);
    setSnack('Usuario copiado.');
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

  // --- Render ---

  return (
    <>
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
          <Card.Content style={{ gap: 10 }}>
            <Text variant="titleMedium">Meta de ahorro mensual</Text>
            <Text style={{ color: '#666', fontSize: 13 }}>
              ¿Qué parte de tus ingresos quieres apartar como ahorro? Con eso te calculo cuánto
              puedes gastar por día sin romper el plan.
            </Text>
            <SegmentedButtons
              value={String(savingsPct)}
              onValueChange={async (v) => {
                const n = Number(v);
                setSavingsPct(n);
                await setBudgetConfig({ savingsPct: n });
                setSnack(`Meta de ahorro: ${n}%.`);
              }}
              buttons={[
                { value: '0', label: '0%' },
                { value: '10', label: '10%' },
                { value: '20', label: '20%' },
                { value: '30', label: '30%' },
                { value: '40', label: '40%' },
              ]}
            />
          </Card.Content>
        </Card>

        <Card>
          <Card.Content style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="titleMedium" style={{ flex: 1 }}>
                Binance
              </Text>
              <Chip
                icon={binanceConnected ? 'check-circle' : 'alert-circle-outline'}
                compact
                style={{ backgroundColor: binanceConnected ? '#E8F5E9' : '#FFF3E0' }}>
                {binanceConnected ? 'Conectado' : 'No conectado'}
              </Chip>
            </View>

            {binanceConnected ? (
              <>
                {binanceAccount && (
                  <Text style={{ color: '#666', fontSize: 13 }}>
                    Cuenta {binanceAccount.accountType} · {binanceAccount.balances.length} activos con
                    saldo
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button mode="contained" icon="chart-line" onPress={() => router.push('/binance' as never)} style={{ flex: 1 }}>
                    Ver balances
                  </Button>
                  <Button mode="outlined" icon="link-off" onPress={onDisconnectBinance} textColor={AppColors.gasto}>
                    Desconectar
                  </Button>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: '#666', fontSize: 13 }}>
                  Crea una API Key en Binance con <Text style={{ fontWeight: 'bold' }}>solo "Enable Reading"</Text>.
                  Se guarda cifrada solo en este teléfono.
                </Text>
                <TextInput
                  label="API Key"
                  value={binanceKey}
                  onChangeText={setBinanceKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  mode="outlined"
                />
                <TextInput
                  label="Secret Key"
                  value={binanceSecret}
                  onChangeText={setBinanceSecret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showBinanceSecret}
                  mode="outlined"
                  right={
                    <TextInput.Icon
                      icon={showBinanceSecret ? 'eye-off' : 'eye'}
                      onPress={() => setShowBinanceSecret((v) => !v)}
                    />
                  }
                />
                <Button mode="contained" icon="link-variant" onPress={onSaveBinance} loading={savingBinance}>
                  Conectar
                </Button>
              </>
            )}
          </Card.Content>
        </Card>

        <Card>
          <Card.Content style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="titleMedium" style={{ flex: 1 }}>
                Mercantil
              </Text>
              <Chip
                icon={mercUser && mercPass ? 'check-circle' : 'alert-circle-outline'}
                compact
                style={{ backgroundColor: mercUser && mercPass ? '#E8F5E9' : '#FFF3E0' }}>
                {mercUser && mercPass ? 'Guardado' : 'Sin guardar'}
              </Chip>
            </View>
            <Text style={{ color: '#666', fontSize: 13 }}>
              Bóveda de tu usuario y clave del banco. La app no los usa sola: al abrir el banco, tú
              tocas "Copiar" y los pegas en el login. La clave copiada se auto-borra del portapapeles
              en 45 segundos.
            </Text>
            <TextInput
              label="Usuario"
              value={mercUser}
              onChangeText={setMercUser}
              autoCapitalize="none"
              autoCorrect={false}
              mode="outlined"
              right={mercUser ? <TextInput.Icon icon="content-copy" onPress={onCopyMercUser} /> : undefined}
            />
            <TextInput
              label="Clave"
              value={mercPass}
              onChangeText={setMercPass}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showMercPass}
              mode="outlined"
              right={
                <TextInput.Icon icon={showMercPass ? 'eye-off' : 'eye'} onPress={() => setShowMercPass((v) => !v)} />
              }
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button mode="contained" icon="content-save" onPress={onSaveMerc} loading={savingMerc} style={{ flex: 1 }}>
                Guardar
              </Button>
              <Button mode="outlined" icon="content-copy" onPress={onCopyMercPass} disabled={!mercPass} style={{ flex: 1 }}>
                Copiar clave
              </Button>
            </View>
            <Button mode="text" icon="bank" onPress={() => router.push('/mercantil' as never)}>
              Ir a descargar estado de cuenta
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content style={{ gap: 8 }}>
            <Text variant="titleMedium">Respaldo de tus datos</Text>
            <Text style={{ color: '#666', fontSize: 13 }}>
              Tus datos solo viven en este teléfono. Exporta tus movimientos a un archivo CSV y guárdalo
              en Google Drive o donde prefieras.
            </Text>
            <Button mode="contained" onPress={onExport} loading={exporting} icon="export">
              Exportar movimientos (CSV)
            </Button>
          </Card.Content>
        </Card>

        <HelperText type="info" visible style={{ textAlign: 'center' }}>
          Todas las claves y datos se guardan solo en este teléfono, cifrados.
        </HelperText>
      </ScrollView>

      <Snackbar visible={!!snack} onDismiss={() => setSnack(null)} duration={3000}>
        {snack ?? ''}
      </Snackbar>
    </>
  );
}
