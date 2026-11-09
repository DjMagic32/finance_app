import { asc, eq } from 'drizzle-orm';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { db, todayISO } from '@/db';
import { debtPayments, debts, debtTransactionAllocations, transactions } from '@/db/schema';
import { amountLabel } from '@/services/debts';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function displayDate(value: string): string {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : value;
}

/** Generates a personal summary of recorded debt payments, not a fiscal invoice. */
export async function sharePaidDebtReceipt(debtId: number): Promise<void> {
  const [debt] = await db.select().from(debts).where(eq(debts.id, debtId)).limit(1);
  if (!debt || debt.status !== 'pagada') throw new Error('El comprobante está disponible cuando la deuda está pagada.');
  const installments = await db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId)).orderBy(asc(debtPayments.dueDate), asc(debtPayments.id));
  if (!installments.length || installments.some(p => !p.paidAt)) throw new Error('No se pudieron confirmar todas las cuotas como pagadas.');
  const linkedRows = await db.select({ allocation: debtTransactionAllocations, transaction: transactions })
    .from(debtTransactionAllocations)
    .innerJoin(debtPayments, eq(debtTransactionAllocations.paymentId, debtPayments.id))
    .innerJoin(transactions, eq(debtTransactionAllocations.transactionId, transactions.id))
    .where(eq(debtPayments.debtId, debtId));
  const lines = installments.map(p => {
    const entries = linkedRows.filter(row => row.allocation.paymentId === p.id);
    const details = entries.length
      ? entries.map(({ allocation, transaction }) => {
        const amount = amountLabel(allocation.debtAmountCents / 100, debt.currency);
        const source = transaction.currency === debt.currency ? '' : ` (gasto: ${amountLabel(allocation.amountCents / 100, transaction.currency)})`;
        return `<li>Movimiento del ${escapeHtml(displayDate(transaction.date))}: ${escapeHtml(amount + source)}</li>`;
      }).join('')
      : `<li>Marcada como pagada en la app el ${escapeHtml(displayDate(p.paidAt!))}, sin movimiento vinculado.</li>`;
    return `<tr><td>${escapeHtml(displayDate(p.dueDate))}</td><td>${escapeHtml(amountLabel(p.amount, debt.currency))}</td><td><ul>${details}</ul></td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;color:#222;padding:32px}h1{font-size:24px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px;vertical-align:top}ul{margin:0;padding-left:18px}.note{color:#555;font-size:12px}</style></head><body><h1>Registro de deuda pagada</h1><p class="note">Documento de control personal. No es una factura fiscal ni un comprobante emitido por el acreedor.</p><p><strong>Acreedor:</strong> ${escapeHtml(debt.creditor)}</p>${debt.description ? `<p><strong>Descripción:</strong> ${escapeHtml(debt.description)}</p>` : ''}<p><strong>Total:</strong> ${escapeHtml(amountLabel(debt.totalAmount, debt.currency))}</p><p><strong>Estado:</strong> Pagada</p><p><strong>Generado:</strong> ${escapeHtml(displayDate(todayISO()))}</p><table><thead><tr><th>Vencimiento</th><th>Cuota</th><th>Registro de pago</th></tr></thead><tbody>${lines}</tbody></table></body></html>`;
  if (!(await Sharing.isAvailableAsync())) throw new Error('La opción de compartir no está disponible en este dispositivo.');
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir registro de deuda pagada' });
}
