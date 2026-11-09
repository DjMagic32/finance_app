import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { transactions, workReceipts, workWeeks, workDisbursements, workConversions, debtTransactionAllocations, type Transaction } from '@/db/schema';

export type WorkReceiptInput = typeof workReceipts.$inferInsert;

function positiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} debe ser un monto positivo.`);
}

/** Persists a portion of a bank receipt, including the equivalent credited to a week. */
export function registerWorkReceipt(input: WorkReceiptInput, editId?: number) {
  positiveInteger(input.amountCents, 'El pago');
  positiveInteger(input.weekCreditCents, 'El crédito a la semana');
  if (!Number.isSafeInteger(input.personalCents) || !Number.isSafeInteger(input.employeeCents) || input.personalCents < 0 || input.employeeCents < 0 || input.personalCents + input.employeeCents !== input.amountCents || (input.employeeCents > 0 && !input.employeeId)) throw new Error('El reparto no coincide con el pago.');
  return db.transaction(tx => {
    const old = editId ? tx.select().from(workReceipts).where(eq(workReceipts.id, editId)).get() : null;
    if (editId && !old) throw new Error('El cobro ya no existe.');
    if (old && tx.select().from(workDisbursements).where(eq(workDisbursements.receiptId, old.id)).get()) throw new Error('Este cobro tiene pagos a empleados y no se puede editar.');
    const week = tx.select().from(workWeeks).where(eq(workWeeks.id, input.weekId)).get();
    if (!week) throw new Error('La semana ya no existe.');
    const credited = tx.select({ n: sql<number>`coalesce(sum(${workReceipts.weekCreditCents}), 0)` }).from(workReceipts).where(eq(workReceipts.weekId, input.weekId)).get()?.n ?? 0;
    if (credited - (old?.weekId === input.weekId ? old.weekCreditCents : 0) + input.weekCreditCents > week.expectedCents) throw new Error('El pago supera lo pendiente de la semana.');
    if (input.transactionId) {
      const bank = tx.select().from(transactions).where(eq(transactions.id, input.transactionId)).get();
      if (!bank || bank.type !== 'ingreso' || bank.currency !== input.currency) throw new Error('Selecciona un ingreso en la misma moneda.');
      const used = tx.select({ n: sql<number>`coalesce(sum(${workReceipts.amountCents}), 0)` }).from(workReceipts).where(eq(workReceipts.transactionId, bank.id)).get()?.n ?? 0;
      if (used - (old?.transactionId === bank.id ? old.amountCents : 0) + input.amountCents > Math.round(bank.amount * 100)) throw new Error('El reparto supera el movimiento bancario.');
    }
    if (old) return tx.update(workReceipts).set(input).where(eq(workReceipts.id, old.id)).returning().get();
    return tx.insert(workReceipts).values(input).returning().get();
  });
}

export function registerDisbursement(input: typeof workDisbursements.$inferInsert) {
  positiveInteger(input.amountCents, 'El pago');
  return db.transaction(tx => {
    const receipt = tx.select().from(workReceipts).where(eq(workReceipts.id, input.receiptId)).get();
    if (!receipt || !receipt.employeeId) throw new Error('No hay un empleado asignado.');
    const paid = tx.select({ n: sql<number>`coalesce(sum(${workDisbursements.amountCents}), 0)` }).from(workDisbursements).where(eq(workDisbursements.receiptId, input.receiptId)).get()?.n ?? 0;
    if (paid + input.amountCents > receipt.employeeCents) throw new Error('El pago supera lo pendiente al empleado.');
    if (input.transactionId) {
      if (tx.select().from(debtTransactionAllocations).where(eq(debtTransactionAllocations.transactionId, input.transactionId)).get()) throw new Error('Este movimiento ya está vinculado a una deuda.');
      const bank = tx.select().from(transactions).where(eq(transactions.id, input.transactionId)).get();
      if (!bank || bank.type !== 'gasto' || bank.currency !== receipt.currency) throw new Error('Selecciona un gasto en la misma moneda.');
      const used = tx.select({ n: sql<number>`coalesce(sum(${workDisbursements.amountCents}), 0)` }).from(workDisbursements).where(eq(workDisbursements.transactionId, bank.id)).get()?.n ?? 0;
      const converted = tx.select({ n: sql<number>`coalesce(sum(${workConversions.vesCents}), 0)` }).from(workConversions).where(eq(workConversions.transactionId, bank.id)).get()?.n ?? 0;
      if (used + converted + input.amountCents > Math.round(bank.amount * 100)) throw new Error('El pago supera el movimiento bancario.');
    }
    return tx.insert(workDisbursements).values(input).returning().get();
  });
}

export function registerConversion(input: typeof workConversions.$inferInsert) {
  positiveInteger(input.vesCents, 'Los bolívares');
  positiveInteger(input.usdtMicros, 'Los USDT');
  if (!Number.isSafeInteger(input.feeMicros) || input.feeMicros < 0) throw new Error('La comisión no es válida.');
  return db.transaction(tx => {
    if (input.transactionId) {
      if (tx.select().from(debtTransactionAllocations).where(eq(debtTransactionAllocations.transactionId, input.transactionId)).get()) throw new Error('Este movimiento ya está vinculado a una deuda.');
      const bank = tx.select().from(transactions).where(eq(transactions.id, input.transactionId)).get();
      if (!bank || bank.type !== 'gasto' || bank.currency !== 'VES') throw new Error('Selecciona un gasto en bolívares.');
      const used = tx.select({ n: sql<number>`coalesce(sum(${workConversions.vesCents}), 0)` }).from(workConversions).where(eq(workConversions.transactionId, bank.id)).get()?.n ?? 0;
      const paid = tx.select({ n: sql<number>`coalesce(sum(${workDisbursements.amountCents}), 0)` }).from(workDisbursements).where(eq(workDisbursements.transactionId, bank.id)).get()?.n ?? 0;
      if (used + paid + input.vesCents > Math.round(bank.amount * 100)) throw new Error('La conversión supera el movimiento bancario.');
    }
    return tx.insert(workConversions).values(input).returning().get();
  });
}

/** Personal share of bank movements; excludes portions held for employees and conversions. */
export function personalTransactionUsd(t: Transaction, receipts: (typeof workReceipts.$inferSelect)[], payments: (typeof workDisbursements.$inferSelect)[], conversions: (typeof workConversions.$inferSelect)[]): number {
  if (t.amount <= 0) return 0;
  const excludedCents = t.type === 'ingreso'
    ? receipts.filter(r => r.transactionId === t.id).reduce((n, r) => n + r.employeeCents, 0)
    : payments.filter(p => p.transactionId === t.id).reduce((n, p) => n + p.amountCents, 0)
      + conversions.filter(c => c.transactionId === t.id).reduce((n, c) => n + c.vesCents, 0);
  return t.amountUsd * Math.max(0, 1 - excludedCents / (t.amount * 100));
}

export function personalContext() {
  return {
    receipts: db.select().from(workReceipts).all(),
    payments: db.select().from(workDisbursements).all(),
    conversions: db.select().from(workConversions).all(),
  };
}
