import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { categories, transactions } from '@/db/schema';

function csvCell(v: string | number | null): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportTransactionsCSV() {
  const rows = await db
    .select({ tx: transactions, cat: categories })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(transactions.date);

  const header = 'fecha,tipo,categoria,monto,moneda,monto_usd,monto_ves,tasa,fuente_tasa,nota';
  const lines = rows.map((r) =>
    [
      r.tx.date,
      r.tx.type,
      r.cat?.name ?? '',
      r.tx.amount,
      r.tx.currency,
      r.tx.amountUsd.toFixed(2),
      r.tx.amountVes.toFixed(2),
      r.tx.rateUsed ?? '',
      r.tx.rateSource ?? '',
      r.tx.note ?? '',
    ]
      .map(csvCell)
      .join(','),
  );

  const file = new File(Paths.cache, 'mis-finanzas.csv');
  if (file.exists) file.delete();
  file.create();
  file.write('\uFEFF' + [header, ...lines].join('\n'));

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Exportar movimientos',
  });
}
