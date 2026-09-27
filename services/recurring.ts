import { eq } from 'drizzle-orm';

import { db, nowISO, todayISO } from '@/db';
import { recurring, transactions, type Recurring } from '@/db/schema';
import { amountLabel } from '@/services/debts';
import { cancelReminders, schedulePaymentReminders } from '@/services/notifications';
import { getLatestRates } from '@/services/rates';
import { registerActivity } from '@/services/score';

function advance(dateISO: string, schedule: Recurring['schedule']): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (schedule === 'semanal') dt.setDate(dt.getDate() + 7);
  else if (schedule === 'quincenal') dt.setDate(dt.getDate() + 15);
  else dt.setMonth(dt.getMonth() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function scheduleFor(item: {
  name: string;
  amount: number;
  currency: 'VES' | 'USD';
  nextDue: string;
}): Promise<string> {
  const ids = await schedulePaymentReminders(
    item.name,
    amountLabel(item.amount, item.currency),
    item.nextDue,
  );
  return JSON.stringify(ids);
}

export interface RecurringInput {
  name: string;
  categoryId: number | null;
  amount: number;
  currency: 'VES' | 'USD';
  schedule: Recurring['schedule'];
  nextDue: string;
}

export async function createRecurring(input: RecurringInput) {
  const notificationIds = await scheduleFor(input);
  await db.insert(recurring).values({ ...input, notificationIds, createdAt: nowISO() });
}

export async function updateRecurring(id: number, input: RecurringInput) {
  const [row] = await db.select().from(recurring).where(eq(recurring.id, id)).limit(1);
  if (!row) return;
  await cancelReminders(JSON.parse(row.notificationIds));
  const notificationIds = await scheduleFor(input);
  await db.update(recurring).set({ ...input, notificationIds }).where(eq(recurring.id, id));
}

export async function deleteRecurring(id: number) {
  const [row] = await db.select().from(recurring).where(eq(recurring.id, id)).limit(1);
  if (!row) return;
  await cancelReminders(JSON.parse(row.notificationIds));
  await db.delete(recurring).where(eq(recurring.id, id));
}

/** Marca el pago del período: crea el movimiento (gasto) y avanza la próxima fecha. */
export async function payRecurring(id: number): Promise<string[]> {
  const [row] = await db.select().from(recurring).where(eq(recurring.id, id)).limit(1);
  if (!row) return [];

  const rates = await getLatestRates();
  const best = rates.paralelo ?? rates.bcv ?? rates.binance_p2p;
  const rate = best?.rate ?? null;
  const amountUsd =
    row.currency === 'USD' ? row.amount : rate ? row.amount / rate : row.amount;
  const amountVes =
    row.currency === 'VES' ? row.amount : rate ? row.amount * rate : row.amount;

  await db.insert(transactions).values({
    type: 'gasto',
    categoryId: row.categoryId,
    amount: row.amount,
    currency: row.currency,
    amountUsd,
    amountVes,
    rateUsed: rate,
    rateSource: best?.source ?? 'manual',
    note: row.name,
    date: todayISO(),
    createdAt: nowISO(),
  });

  await cancelReminders(JSON.parse(row.notificationIds));
  // avanza desde la fecha vencida hasta quedar en el futuro
  let next = advance(row.nextDue, row.schedule);
  const today = todayISO();
  while (next <= today) next = advance(next, row.schedule);

  const notificationIds = await scheduleFor({ ...row, nextDue: next });
  await db
    .update(recurring)
    .set({ nextDue: next, notificationIds })
    .where(eq(recurring.id, id));

  return registerActivity();
}
