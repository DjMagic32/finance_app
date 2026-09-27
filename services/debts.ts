import { and, eq, isNull, lt } from 'drizzle-orm';

import { db, nowISO, todayISO } from '@/db';
import { debtPayments, debts, type Debt } from '@/db/schema';
import {
  cancelReminders,
  schedulePaymentReminders,
  scheduleOverdueAlert,
} from '@/services/notifications';

export function amountLabel(amount: number, currency: 'VES' | 'USD') {
  const n = amount.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  return currency === 'USD' ? `$${n}` : `Bs ${n}`;
}

function addPeriod(date: Date, schedule: Debt['schedule']) {
  const d = new Date(date);
  if (schedule === 'semanal') d.setDate(d.getDate() + 7);
  else if (schedule === 'quincenal') d.setDate(d.getDate() + 15);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

const iso = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export interface NewDebtInput {
  creditor: string;
  description: string | null;
  totalAmount: number;
  currency: 'VES' | 'USD';
  totalAmountUsd: number;
  dueDate: string; // primera (o única) fecha de pago
  schedule: Debt['schedule'];
  installments: number; // 1 si es única
}

export async function createDebt(input: NewDebtInput) {
  const installments = input.schedule === 'unica' ? 1 : Math.max(1, input.installments);
  const installmentAmount = input.totalAmount / installments;

  const dueDates: string[] = [];
  const [yy, mm, dd] = input.dueDate.split('-').map(Number);
  let cursor = new Date(yy, mm - 1, dd); // parseo local para no correr un día por zona horaria
  for (let i = 0; i < installments; i++) {
    dueDates.push(iso(cursor));
    cursor = addPeriod(cursor, input.schedule);
  }

  const [debt] = await db
    .insert(debts)
    .values({
      creditor: input.creditor,
      description: input.description,
      totalAmount: input.totalAmount,
      currency: input.currency,
      totalAmountUsd: input.totalAmountUsd,
      startDate: todayISO(),
      dueDate: dueDates[dueDates.length - 1],
      schedule: input.schedule,
      installmentAmount,
      createdAt: nowISO(),
    })
    .returning();

  for (const dueDate of dueDates) {
    const notificationIds = await schedulePaymentReminders(
      input.creditor,
      amountLabel(installmentAmount, input.currency),
      dueDate,
    );
    await db.insert(debtPayments).values({
      debtId: debt.id,
      dueDate,
      amount: installmentAmount,
      notificationIds: JSON.stringify(notificationIds),
    });
  }
  return debt;
}

/** Edita nombre/descripción. Si cambió el acreedor, reprograma los recordatorios pendientes. */
export async function updateDebtBasic(
  debtId: number,
  creditor: string,
  description: string | null,
) {
  const [debt] = await db.select().from(debts).where(eq(debts.id, debtId)).limit(1);
  if (!debt) return;
  const creditorChanged = debt.creditor !== creditor;
  await db.update(debts).set({ creditor, description }).where(eq(debts.id, debtId));

  if (creditorChanged) {
    const pending = await db
      .select()
      .from(debtPayments)
      .where(and(eq(debtPayments.debtId, debtId), isNull(debtPayments.paidAt)));
    for (const p of pending) {
      await cancelReminders(JSON.parse(p.notificationIds));
      const ids = await schedulePaymentReminders(
        creditor,
        amountLabel(p.amount, debt.currency),
        p.dueDate,
      );
      await db
        .update(debtPayments)
        .set({ notificationIds: JSON.stringify(ids) })
        .where(eq(debtPayments.id, p.id));
    }
  }
}

/** Reconstruye una deuda sin pagos hechos: borra cuotas y recordatorios y los regenera. */
export async function rebuildDebt(debtId: number, input: NewDebtInput) {
  const payments = await db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId));
  if (payments.some((p) => p.paidAt)) {
    throw new Error('No se puede reconstruir una deuda con pagos hechos');
  }
  for (const p of payments) {
    await cancelReminders(JSON.parse(p.notificationIds));
  }
  await db.delete(debtPayments).where(eq(debtPayments.debtId, debtId));

  const installments = input.schedule === 'unica' ? 1 : Math.max(1, input.installments);
  const installmentAmount = input.totalAmount / installments;
  const dueDates: string[] = [];
  const [yy, mm, dd] = input.dueDate.split('-').map(Number);
  let cursor = new Date(yy, mm - 1, dd);
  for (let i = 0; i < installments; i++) {
    dueDates.push(iso(cursor));
    cursor = addPeriod(cursor, input.schedule);
  }

  await db
    .update(debts)
    .set({
      creditor: input.creditor,
      description: input.description,
      totalAmount: input.totalAmount,
      currency: input.currency,
      totalAmountUsd: input.totalAmountUsd,
      dueDate: dueDates[dueDates.length - 1],
      schedule: input.schedule,
      installmentAmount,
      status: 'activa',
    })
    .where(eq(debts.id, debtId));

  for (const dueDate of dueDates) {
    const notificationIds = await schedulePaymentReminders(
      input.creditor,
      amountLabel(installmentAmount, input.currency),
      dueDate,
    );
    await db.insert(debtPayments).values({
      debtId,
      dueDate,
      amount: installmentAmount,
      notificationIds: JSON.stringify(notificationIds),
    });
  }
}

export async function markPaymentPaid(paymentId: number) {
  const [payment] = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.id, paymentId))
    .limit(1);
  if (!payment || payment.paidAt) return;

  await cancelReminders(JSON.parse(payment.notificationIds));
  await db
    .update(debtPayments)
    .set({ paidAt: nowISO(), notificationIds: '[]' })
    .where(eq(debtPayments.id, paymentId));

  const pending = await db
    .select({ id: debtPayments.id })
    .from(debtPayments)
    .where(and(eq(debtPayments.debtId, payment.debtId), isNull(debtPayments.paidAt)));
  if (pending.length === 0) {
    await db.update(debts).set({ status: 'pagada' }).where(eq(debts.id, payment.debtId));
  }
}

export async function deleteDebt(debtId: number) {
  const payments = await db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId));
  for (const p of payments) {
    await cancelReminders(JSON.parse(p.notificationIds));
  }
  await db.delete(debtPayments).where(eq(debtPayments.debtId, debtId));
  await db.delete(debts).where(eq(debts.id, debtId));
}

/** Al abrir la app: marca deudas vencidas y re-arma la alerta diaria. Devuelve # de pagos vencidos. */
export async function checkOverdue(): Promise<number> {
  const today = todayISO();
  const overdue = await db
    .select({ payment: debtPayments, debt: debts })
    .from(debtPayments)
    .innerJoin(debts, eq(debtPayments.debtId, debts.id))
    .where(and(lt(debtPayments.dueDate, today), isNull(debtPayments.paidAt)));

  for (const { payment, debt } of overdue) {
    if (debt.status === 'activa') {
      await db.update(debts).set({ status: 'vencida' }).where(eq(debts.id, debt.id));
    }
    try {
      await scheduleOverdueAlert(debt.creditor, amountLabel(payment.amount, debt.currency));
    } catch {}
  }
  return overdue.length;
}
