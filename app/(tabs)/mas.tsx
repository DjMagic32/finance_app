import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { List } from 'react-native-paper';

import { S } from '@/constants/strings';
import { AppColors } from '@/constants/theme';

export default function MasScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: AppColors.fondo }}>
      <List.Item
        title="Proyectos"
        description="Tableros kanban para metas grandes (inversor, cocina, viaje...)"
        left={(p) => <List.Icon {...p} icon="view-dashboard" />}
        onPress={() => router.push('/proyectos' as never)}
      />
      <List.Item
        title="Lista de mercado"
        description="Compara precios entre compras"
        left={(p) => <List.Icon {...p} icon="cart" />}
        onPress={() => router.push('/mercado')}
      />
      <List.Item
        title="Gastos fijos"
        description="Servicios y pagos que se repiten"
        left={(p) => <List.Icon {...p} icon="calendar-sync" />}
        onPress={() => router.push('/fijos')}
      />
      <List.Item
        title={S.mas.notas}
        left={(p) => <List.Icon {...p} icon="notebook" />}
        onPress={() => router.push('/notas')}
      />
      <List.Item
        title={S.mas.logros}
        left={(p) => <List.Icon {...p} icon="trophy" />}
        onPress={() => router.push('/logros')}
      />
      <List.Item
        title="Mercantil"
        description="Estado de cuenta y clave"
        left={(p) => <List.Icon {...p} icon="bank" />}
        onPress={() => router.push('/mercantil' as never)}
      />
      <List.Item
        title="Conectar Binance"
        description="Ver tus balances y movimientos"
        left={(p) => <List.Icon {...p} icon="bitcoin" />}
        onPress={() => router.push('/binance' as never)}
      />
      <List.Item
        title={S.mas.ajustes}
        left={(p) => <List.Icon {...p} icon="cog" />}
        onPress={() => router.push('/ajustes')}
      />
    </View>
  );
}
