import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db, todayISO } from '@/db';
import { categories, transactions } from '@/db/schema';
import { Semaforo } from '@/constants/theme';

export type Severity = 'ok' | 'warn' | 'alert';

export interface Insight {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  icon: string;
  color: string;
  // rank interno (mayor = más importante)
  weight: number;
}

interface MonthAgg {
  start: string;
  end: string;
  income: number;
  spent: number;
  byCat: Map<number, number>; // categoryId -> gasto USD
}

function monthKeyOffset(today: string, monthsAgo: number): { start: string; end: string } {
  const [y, m] = today.split('-').map(Number);
  const target = new Date(y, m - 1 - monthsAgo, 1);
  const ty = target.getFullYear();
  const tm = target.getMonth() + 1;
  const start = `${ty}-${String(tm).padStart(2, '0')}-01`;
  const lastDay = new Date(ty, tm, 0).getDate();
  const end = `${ty}-${String(tm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

async function aggregate(start: string, end: string): Promise<MonthAgg> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, start), lte(transactions.date, end)));

  let income = 0;
  let spent = 0;
  const byCat = new Map<number, number>();
  for (const t of rows) {
    if (t.type === 'ingreso') income += t.amountUsd;
    else {
      spent += t.amountUsd;
      if (t.categoryId != null) {
        byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountUsd);
      }
    }
  }
  return { start, end, income, spent, byCat };
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt0(n: number): string {
  return n.toLocaleString('es-VE', { maximumFractionDigits: 0 });
}

/** Genera un ranking de consejos concretos basados en tus movimientos reales. */
export async function computeInsights(): Promise<Insight[]> {
  const today = todayISO();
  const thisMonth = await aggregate(monthKeyOffset(today, 0).start, today);
  const prev1 = await aggregate(monthKeyOffset(today, 1).start, monthKeyOffset(today, 1).end);
  const prev2 = await aggregate(monthKeyOffset(today, 2).start, monthKeyOffset(today, 2).end);
  const prev3 = await aggregate(monthKeyOffset(today, 3).start, monthKeyOffset(today, 3).end);

  const catList = await db.select().from(categories);
  const catById = new Map(catList.map((c) => [c.id, c]));

  const insights: Insight[] = [];
  const dayOfMonth = Number(today.slice(8, 10));
  const [y, m] = today.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth; // 0-1

  // --- 1. Proyección de cierre de mes ---
  if (thisMonth.spent > 0 && dayOfMonth >= 5) {
    const projected = thisMonth.spent / monthProgress;
    const projBalance = thisMonth.income - projected;
    if (projBalance < -20) {
      insights.push({
        key: 'projection_negative',
        severity: 'alert',
        title: `Cerrarás el mes en -$${fmt0(-projBalance)}`,
        detail: `Al ritmo actual gastarás $${fmt0(projected)}. Frena o ajusta antes de fin de mes.`,
        icon: 'trending-down',
        color: Semaforo.rojo,
        weight: 100,
      });
    } else if (projBalance > 50) {
      insights.push({
        key: 'projection_positive',
        severity: 'ok',
        title: `Vas a cerrar con $${fmt0(projBalance)} a favor`,
        detail: `Si sigues así, ahorras $${fmt0(projBalance)} este mes. ¡Buen ritmo!`,
        icon: 'trending-up',
        color: Semaforo.verde,
        weight: 40,
      });
    }
  }

  // --- 2. Comparativa por categoría contra promedio de últimos 3 meses ---
  const priorMonths = [prev1, prev2, prev3].filter((m) => m.spent > 0);
  if (priorMonths.length >= 2) {
    const catAvg = new Map<number, number>();
    for (const cid of new Set(priorMonths.flatMap((m) => [...m.byCat.keys()]))) {
      const sum = priorMonths.reduce((s, m) => s + (m.byCat.get(cid) ?? 0), 0);
      catAvg.set(cid, sum / priorMonths.length);
    }

    const anomalies: Array<{ catId: number; now: number; avg: number; diff: number; pct: number }> = [];
    for (const [cid, now] of thisMonth.byCat.entries()) {
      const avg = catAvg.get(cid) ?? 0;
      if (avg < 5) continue; // demasiado pequeño para ser señal
      const projNow = now / monthProgress;
      const diff = projNow - avg;
      const pct = (diff / avg) * 100;
      if (pct >= 25 && diff >= 10) {
        anomalies.push({ catId: cid, now, avg, diff, pct });
      }
    }
    anomalies.sort((a, b) => b.diff - a.diff);
    for (const a of anomalies.slice(0, 2)) {
      const cat = catById.get(a.catId);
      if (!cat) continue;
      insights.push({
        key: `cat_up_${a.catId}`,
        severity: a.pct >= 60 ? 'alert' : 'warn',
        title: `${cat.name}: ${Math.round(a.pct)}% más que tu promedio`,
        detail: `Llevas $${fmt0(a.now)} este mes. Antes gastabas $${fmt0(a.avg)} en promedio.`,
        icon: cat.icon,
        color: cat.color,
        weight: 60 + Math.min(30, a.pct / 3),
      });
    }
  }

  // --- 3. Ratio no esencial ---
  if (thisMonth.spent > 30) {
    const noEsencial = [...thisMonth.byCat.entries()]
      .filter(([cid]) => catById.get(cid)?.isEssential === 0)
      .reduce((s, [, v]) => s + v, 0);
    const ratio = noEsencial / thisMonth.spent;
    if (ratio >= 0.4) {
      insights.push({
        key: 'nonessential_high',
        severity: ratio >= 0.55 ? 'alert' : 'warn',
        title: `${Math.round(ratio * 100)}% de tu gasto es no esencial`,
        detail: `Son $${fmt0(noEsencial)} en cosas prescindibles. Aquí es donde más fácil se recorta.`,
        icon: 'silverware-fork-knife',
        color: Semaforo.amarillo,
        weight: 55 + ratio * 30,
      });
    }
  }

  // --- 4. Top categoría del mes ---
  if (thisMonth.byCat.size > 0) {
    const top = [...thisMonth.byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    const cat = catById.get(top[0]);
    const share = top[1] / (thisMonth.spent || 1);
    if (cat && share >= 0.25) {
      insights.push({
        key: `top_cat_${cat.id}`,
        severity: 'ok',
        title: `${cat.name} se lleva ${Math.round(share * 100)}% de tus gastos`,
        detail: `Son $${fmt0(top[1])} este mes. Es tu categoría más pesada.`,
        icon: cat.icon,
        color: cat.color,
        weight: 30,
      });
    }
  }

  // --- 5. Días sin anotar ---
  const lastRow = await db
    .select({ date: transactions.date })
    .from(transactions)
    .orderBy(desc(transactions.date))
    .limit(1);
  if (lastRow.length > 0) {
    const last = lastRow[0].date;
    const daysGap = daysBetween(last, today);
    if (daysGap >= 3) {
      insights.push({
        key: 'no_logs',
        severity: 'warn',
        title: `Llevas ${daysGap} días sin anotar nada`,
        detail: 'Sin datos frescos no puedo darte buenos consejos. Anota lo que gastaste hoy.',
        icon: 'notebook-edit',
        color: Semaforo.amarillo,
        weight: 45,
      });
    }
  }

  // --- 6. Sin categorizar ---
  const sinCat = await db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(sql`${transactions.categoryId} IS NULL AND ${transactions.date} >= ${thisMonth.start}`);
  const sinCatCount = Number(sinCat[0]?.n ?? 0);
  if (sinCatCount >= 3) {
    insights.push({
      key: 'no_category',
      severity: 'warn',
      title: `Tienes ${sinCatCount} movimientos sin categorizar`,
      detail: 'Categorízalos para saber en qué se te va la plata este mes.',
      icon: 'tag-multiple',
      color: Semaforo.amarillo,
      weight: 35,
    });
  }

  insights.sort((a, b) => b.weight - a.weight);
  return insights;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = new Date(ay, am - 1, ad).getTime();
  const dbb = new Date(by, bm - 1, bd).getTime();
  return Math.round((dbb - da) / 86_400_000);
}

// --- Top categorías más usadas para quick-add ---

export interface TopCategoryRow {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  kind: 'ingreso' | 'gasto';
  count: number;
}

/** Categorías más usadas en los últimos 30 días. */
export async function getTopCategories(limit = 3): Promise<TopCategoryRow[]> {
  const today = todayISO();
  const [y, m, d] = today.split('-').map(Number);
  const past = new Date(y, m - 1, d);
  past.setDate(past.getDate() - 30);
  const since = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      cnt: sql<number>`count(*)`,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      kind: categories.kind,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(gte(transactions.date, since))
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows
    .filter((r) => r.categoryId != null)
    .map((r) => ({
      categoryId: r.categoryId as number,
      name: r.name,
      icon: r.icon,
      color: r.color,
      kind: r.kind as 'ingreso' | 'gasto',
      count: Number(r.cnt),
    }));
}
