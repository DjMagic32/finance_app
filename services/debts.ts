import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';

import { db, nowISO, todayISO } from '@/db';
import { debtPayments, debts, debtTransactionAllocations, transactions, workDisbursements, workConversions, type Debt } from '@/db/schema';
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
  const totalCents = Math.round(input.totalAmount * 100);
  const baseCents = Math.floor(totalCents / installments);
  const installmentAmount = totalCents / 100 / installments;

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

  for (const [index, dueDate] of dueDates.entries()) {
    const paymentAmount = (baseCents + (index < totalCents % installments ? 1 : 0)) / 100;
    const notificationIds = await schedulePaymentReminders(
      input.creditor,
      amountLabel(paymentAmount, input.currency),
      dueDate,
    );
    await db.insert(debtPayments).values({
      debtId: debt.id,
      dueDate,
      amount: paymentAmount,
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
  if (payments.some((p) => p.paidAt || db.select().from(debtTransactionAllocations).where(eq(debtTransactionAllocations.paymentId, p.id)).get())) {
    throw new Error('No se puede reconstruir una deuda con pagos hechos');
  }
  for (const p of payments) {
    await cancelReminders(JSON.parse(p.notificationIds));
  }
  await db.delete(debtPayments).where(eq(debtPayments.debtId, debtId));

  const installments = input.schedule === 'unica' ? 1 : Math.max(1, input.installments);
  const totalCents = Math.round(input.totalAmount * 100);
  const baseCents = Math.floor(totalCents / installments);
  const installmentAmount = totalCents / 100 / installments;
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

  for (const [index, dueDate] of dueDates.entries()) {
    const paymentAmount = (baseCents + (index < totalCents % installments ? 1 : 0)) / 100;
    const notificationIds = await schedulePaymentReminders(
      input.creditor,
      amountLabel(paymentAmount, input.currency),
      dueDate,
    );
    await db.insert(debtPayments).values({
      debtId,
      dueDate,
      amount: paymentAmount,
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
  if (db.select().from(debtTransactionAllocations).where(eq(debtTransactionAllocations.paymentId, paymentId)).get()) {
    throw new Error('Esta cuota tiene abonos vinculados. Completa el saldo desde un movimiento.');
  }

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
    await db.delete(debtTransactionAllocations).where(eq(debtTransactionAllocations.paymentId, p.id));
  }
  await db.delete(debtPayments).where(eq(debtPayments.debtId, debtId));
  await db.delete(debts).where(eq(debts.id, debtId));
}

/** Aplica un gasto a las cuotas pendientes más antiguas, con un equivalente explícito. */
export async function linkExpenseToDebt(transactionId: number, debtId: number, amountCents: number, debtAmountCents = amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isSafeInteger(debtAmountCents) || debtAmountCents <= 0) throw new Error('Introduce montos positivos válidos.');
  const touched = db.transaction(tx => {
    const expense = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    const debt = tx.select().from(debts).where(eq(debts.id, debtId)).get();
    if (!expense || expense.type !== 'gasto' || !debt) throw new Error('El gasto o la deuda ya no existe.');
    if (expense.currency === debt.currency && debtAmountCents !== amountCents) throw new Error('En la misma moneda, ambos montos deben coincidir.');
    if (tx.select().from(workDisbursements).where(eq(workDisbursements.transactionId, transactionId)).get() || tx.select().from(workConversions).where(eq(workConversions.transactionId, transactionId)).get()) throw new Error('Este movimiento ya está vinculado a un pago de empleado o conversión.');
    const used = tx.select({ amount: sql<number>`coalesce(sum(${debtTransactionAllocations.amountCents}), 0)` }).from(debtTransactionAllocations).where(eq(debtTransactionAllocations.transactionId, transactionId)).get()?.amount ?? 0;
    if (used + amountCents > Math.round(expense.amount * 100)) throw new Error('El monto supera lo disponible en el gasto.');
    const installments = tx.select().from(debtPayments).where(eq(debtPayments.debtId, debtId)).orderBy(asc(debtPayments.dueDate), asc(debtPayments.id)).all();
    const pending = installments.filter(p => !p.paidAt).map(p => {
      const paid = tx.select({ amount: sql<number>`coalesce(sum(${debtTransactionAllocations.debtAmountCents}), 0)` }).from(debtTransactionAllocations).where(eq(debtTransactionAllocations.paymentId, p.id)).get()?.amount ?? 0;
      return { payment: p, remaining: Math.max(0, Math.round(p.amount * 100) - paid) };
    });
    if (debtAmountCents > pending.reduce((n, p) => n + p.remaining, 0)) throw new Error('El monto supera el saldo pendiente de la deuda.');
    let remaining = debtAmountCents;
    let debtAllocated = 0;
    let expenseAllocated = 0;
    const changed: typeof debtPayments.$inferSelect[] = [];
    for (const item of pending) {
      if (!remaining) break;
      const amount = Math.min(remaining, item.remaining);
      if (!amount) continue;
      debtAllocated += amount;
      const expenseSoFar = Math.round(amountCents * debtAllocated / debtAmountCents);
      const expensePart = expenseSoFar - expenseAllocated;
      if (expensePart <= 0) throw new Error('El equivalente es demasiado pequeño para repartirlo entre estas cuotas.');
      expenseAllocated = expenseSoFar;
      tx.insert(debtTransactionAllocations).values({ transactionId, paymentId: item.payment.id, amountCents: expensePart, debtAmountCents: amount, createdAt: nowISO() })
        .onConflictDoUpdate({ target: [debtTransactionAllocations.transactionId, debtTransactionAllocations.paymentId], set: { amountCents: sql`${debtTransactionAllocations.amountCents} + ${expensePart}`, debtAmountCents: sql`${debtTransactionAllocations.debtAmountCents} + ${amount}` } }).run();
      remaining -= amount;
      changed.push(item.payment);
      if (amount === item.remaining) {
        tx.update(debtPayments).set({ paidAt: nowISO(), notificationIds: '[]' }).where(eq(debtPayments.id, item.payment.id)).run();
      }
    }
    const unpaid = tx.select({ id: debtPayments.id }).from(debtPayments).where(and(eq(debtPayments.debtId, debtId), isNull(debtPayments.paidAt))).all();
    const overdue = tx.select({ id: debtPayments.id }).from(debtPayments).where(and(eq(debtPayments.debtId, debtId), isNull(debtPayments.paidAt), lt(debtPayments.dueDate, todayISO()))).get();
    tx.update(debts).set({ status: !unpaid.length ? 'pagada' : overdue ? 'vencida' : 'activa' }).where(eq(debts.id, debtId)).run();
    return changed;
  });
  await refreshDebtReminders(debtId, touched);
}

/** Desvincula todas las partes de un gasto destinadas a una deuda. */
export async function unlinkExpenseFromDebt(transactionId: number, debtId: number) {
  const reopened = db.transaction(tx => {
    const items = tx.select({ allocation: debtTransactionAllocations, payment: debtPayments }).from(debtTransactionAllocations)
      .innerJoin(debtPayments, eq(debtTransactionAllocations.paymentId, debtPayments.id))
      .where(and(eq(debtTransactionAllocations.transactionId, transactionId), eq(debtPayments.debtId, debtId))).all();
    for (const item of items) {
      tx.delete(debtTransactionAllocations).where(eq(debtTransactionAllocations.id, item.allocation.id)).run();
      if (item.payment.paidAt) tx.update(debtPayments).set({ paidAt: null }).where(eq(debtPayments.id, item.payment.id)).run();
    }
    const overdue = tx.select({ id: debtPayments.id }).from(debtPayments).where(and(eq(debtPayments.debtId, debtId), isNull(debtPayments.paidAt), lt(debtPayments.dueDate, todayISO()))).get();
    if (items.length) tx.update(debts).set({ status: overdue ? 'vencida' : 'activa' }).where(eq(debts.id, debtId)).run();
    return items.map(x => x.payment);
  });
  await refreshDebtReminders(debtId, reopened);
}

async function refreshDebtReminders(debtId: number, changed: (typeof debtPayments.$inferSelect)[]) {
  const debt = db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (debt) for (const p of changed) {
    try {
      await cancelReminders(JSON.parse(p.notificationIds));
      const current = db.select().from(debtPayments).where(eq(debtPayments.id, p.id)).get();
      if (!current || current.paidAt) continue;
      const linked = db.select({ n: sql<number>`coalesce(sum(${debtTransactionAllocations.debtAmountCents}), 0)` }).from(debtTransactionAllocations).where(eq(debtTransactionAllocations.paymentId, p.id)).get()?.n ?? 0;
      const ids = await schedulePaymentReminders(debt.creditor, amountLabel(Math.max(0, p.amount - linked / 100), debt.currency), p.dueDate);
      await db.update(debtPayments).set({ notificationIds: JSON.stringify(ids) }).where(eq(debtPayments.id, p.id));
    } catch { /* El saldo sigue actualizado aunque falle una notificación. */ }
  }
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
      const linked = db.select({ n: sql<number>`coalesce(sum(${debtTransactionAllocations.debtAmountCents}), 0)` }).from(debtTransactionAllocations).where(eq(debtTransactionAllocations.paymentId, payment.id)).get()?.n ?? 0;
      await scheduleOverdueAlert(debt.creditor, amountLabel(Math.max(0, payment.amount - linked / 100), debt.currency));
    } catch {}
  }
  return overdue.length;
}
