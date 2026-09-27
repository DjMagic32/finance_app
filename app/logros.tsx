import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Text } from 'react-native-paper';

import { AppColors, Semaforo } from '@/constants/theme';
import { BADGE_DEFS, getGamState, type GamState } from '@/services/score';

export default function LogrosScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<GamState | null>(null);

  useEffect(() => {
    getGamState().then(setState);
  }, []);

  if (!state) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: AppColors.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom }}>
      <Card>
        <Card.Content style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="fire" size={32} color="#FF6D00" />
            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
              {state.streakDays}
            </Text>
            <Text style={{ fontSize: 12, color: '#666' }}>racha actual</Text>
          </View>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="trophy" size={32} color={Semaforo.amarillo} />
            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
              {state.bestStreak}
            </Text>
            <Text style={{ fontSize: 12, color: '#666' }}>mejor racha</Text>
          </View>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="medal" size={32} color={AppColors.primary} />
            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
              {state.badges.length}
            </Text>
            <Text style={{ fontSize: 12, color: '#666' }}>logros</Text>
          </View>
        </Card.Content>
      </Card>

      {Object.entries(BADGE_DEFS).map(([key, def]) => {
        const earned = state.badges.includes(key);
        return (
          <Card key={key} style={{ opacity: earned ? 1 : 0.45 }}>
            <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <MaterialCommunityIcons
                name={def.icon as any}
                size={36}
                color={earned ? Semaforo.amarillo : '#999'}
              />
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium">{def.nombre}</Text>
                <Text style={{ color: '#666', fontSize: 13 }}>{def.desc}</Text>
              </View>
              {earned && (
                <MaterialCommunityIcons name="check-circle" size={24} color={Semaforo.verde} />
              )}
            </Card.Content>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stat: { alignItems: 'center', gap: 2 },
});
