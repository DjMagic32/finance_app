import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('deudas', {
      name: 'Deudas y pagos',
      importance: Notifications.AndroidImportance.MAX,
    });
    await Notifications.setNotificationChannelAsync('habitos', {
      name: 'Recordatorios de hábitos',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function at(dateISO: string, hour: number): Date | null {
  const [y, m, d] = dateISO.split('-').map(Number);
  const when = new Date(y, m - 1, d, hour, 0, 0);
  return when.getTime() > Date.now() ? when : null;
}

async function schedule(title: string, body: string, when: Date): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: 'deudas',
    },
  });
}

/** Programa recordatorios para un pago: 3 días antes, 1 día antes y el día del vencimiento. */
export async function schedulePaymentReminders(
  creditor: string,
  amountLabel: string,
  dueDateISO: string,
): Promise<string[]> {
  const ids: string[] = [];
  const plans: Array<{ when: Date | null; title: string; body: string }> = [];

  const [yy, mm, dd] = dueDateISO.split('-').map(Number);
  const d3 = new Date(yy, mm - 1, dd); // parseo local para no correr un día por zona horaria
  const threeBefore = new Date(d3);
  threeBefore.setDate(threeBefore.getDate() - 3);
  const oneBefore = new Date(d3);
  oneBefore.setDate(oneBefore.getDate() - 1);
  const iso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  plans.push({
    when: at(iso(threeBefore), 9),
    title: 'Pago en 3 días',
    body: `En 3 días vence tu pago de ${amountLabel} a ${creditor}`,
  });
  plans.push({
    when: at(iso(oneBefore), 9),
    title: 'Pago mañana',
    body: `Mañana vence tu pago de ${amountLabel} a ${creditor}`,
  });
  plans.push({
    when: at(dueDateISO, 8),
    title: '¡Hoy vence un pago!',
    body: `Hoy vence tu pago de ${amountLabel} a ${creditor}`,
  });

  for (const p of plans) {
    if (p.when) {
      try {
        ids.push(await schedule(p.title, p.body, p.when));
      } catch {}
    }
  }
  return ids;
}

export async function cancelReminders(ids: string[]) {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {}
  }
}

/** Notificación inmediata-diaria para deudas vencidas (se re-arma al abrir la app). */
export async function scheduleOverdueAlert(creditor: string, amountLabel: string): Promise<string> {
  const tomorrow9 = new Date();
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return schedule(
    'Deuda vencida',
    `Tienes un pago vencido de ${amountLabel} a ${creditor}. ¡No lo dejes crecer!`,
    tomorrow9,
  );
}

const HABIT_ID_KEY = 'habit-reminder';

export async function setDailyHabitReminder(enabled: boolean) {
  await Notifications.cancelScheduledNotificationAsync(HABIT_ID_KEY).catch(() => {});
  if (!enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: HABIT_ID_KEY,
    content: {
      title: '¿Anotaste tus gastos de hoy?',
      body: 'Toma 1 minuto y mantén tu racha viva 🔥',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
      channelId: 'habitos',
    },
  });
}
