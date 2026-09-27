import { and, desc, eq, lt, ne } from 'drizzle-orm';

import { db, nowISO, todayISO } from '@/db';
import { shoppingItems, shoppingLists, transactions, categories } from '@/db/schema';
import { getLatestRates } from '@/services/rates';
import { registerActivity } from '@/services/score';

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export async function getRateForConversion(): Promise<number | null> {
  const rates = await getLatestRates();
  return (rates.paralelo ?? rates.bcv ?? rates.binance_p2p)?.rate ?? null;
}

/** Precio anterior del mismo producto en una lista más vieja (en USD para comparar justo). */
export async function previousPrice(
  nameNorm: string,
  currentListId: number,
  currentListDate: string,
): Promise<{ priceUsd: number; date: string } | null> {
  const rows = await db
    .select({ item: shoppingItems, list: shoppingLists })
    .from(shoppingItems)
    .innerJoin(shoppingLists, eq(shoppingItems.listId, shoppingLists.id))
    .where(
      and(
        eq(shoppingItems.nameNorm, nameNorm),
        ne(shoppingItems.listId, currentListId),
        lt(shoppingLists.date, currentListDate),
      ),
    )
    .orderBy(desc(shoppingLists.date))
    .limit(5);
  const withPrice = rows.find((r) => r.item.priceUsd != null && r.item.priceUsd > 0);
  if (!withPrice) return null;
  return { priceUsd: withPrice.item.priceUsd!, date: withPrice.list.date };
}

/** Registra el total de lo comprado de la lista como un gasto en "Comida y mercado". */
export async function registerListAsExpense(listId: number): Promise<boolean> {
  const items = await db
    .select()
    .from(shoppingItems)
    .where(and(eq(shoppingItems.listId, listId), eq(shoppingItems.bought, 1)));

  const rate = await getRateForConversion();
  let totalUsd = 0;
  let totalVes = 0;
  for (const it of items) {
    if (it.price == null) continue;
    const line = it.price * it.qty;
    if (it.currency === 'USD') {
      totalUsd += line;
      if (rate) totalVes += line * rate;
    } else {
      totalVes += line;
      if (rate) totalUsd += line / rate;
    }
  }
  if (totalUsd <= 0 && totalVes <= 0) return false;

  const [cat] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, 'Comida y mercado'))
    .limit(1);
  const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)).limit(1);

  await db.insert(transactions).values({
    type: 'gasto',
    categoryId: cat?.id ?? null,
    amount: totalVes > 0 ? totalVes : totalUsd,
    currency: totalVes > 0 ? 'VES' : 'USD',
    amountUsd: totalUsd,
    amountVes: totalVes,
    rateUsed: rate,
    rateSource: rate ? 'paralelo' : 'manual',
    note: `Mercado: ${list?.name ?? ''}`.trim(),
    date: todayISO(),
    createdAt: nowISO(),
  });
  await registerActivity();
  return true;
}

/** Texto de la lista para compartir (Google Keep, WhatsApp, etc.). */
export function listToText(
  listName: string,
  items: Array<{ name: string; qty: number; price: number | null; currency: string; bought: number }>,
): string {
  const lines = items.map((it) => {
    const check = it.bought ? '✅' : '⬜';
    const qty = it.qty !== 1 ? ` x${it.qty}` : '';
    const price =
      it.price != null ? ` — ${it.currency === 'USD' ? '$' : 'Bs '}${it.price.toLocaleString('es-VE')}` : '';
    return `${check} ${it.name}${qty}${price}`;
  });
  return `🛒 ${listName}\n\n${lines.join('\n')}`;
}
