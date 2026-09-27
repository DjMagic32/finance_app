import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { S } from '@/constants/strings';
import { AppColors } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color }: { color: import('react-native').ColorValue }) => (
    <MaterialCommunityIcons name={name} size={26} color={color as string} />
  );
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: AppColors.primary, headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{ title: S.tabs.inicio, tabBarIcon: tabIcon('home-heart') }}
      />
      <Tabs.Screen
        name="movimientos"
        options={{ title: S.tabs.movimientos, tabBarIcon: tabIcon('swap-vertical') }}
      />
      <Tabs.Screen
        name="deudas"
        options={{ title: S.tabs.deudas, tabBarIcon: tabIcon('hand-coin') }}
      />
      <Tabs.Screen
        name="analisis"
        options={{ title: S.tabs.analisis, tabBarIcon: tabIcon('chart-arc') }}
      />
      <Tabs.Screen name="mas" options={{ title: S.tabs.mas, tabBarIcon: tabIcon('menu') }} />
    </Tabs>
  );
}
