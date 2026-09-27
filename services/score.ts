import { and, eq, gte, isNull, lt, lte } from 'drizzle-orm';

import { db, todayISO } from '@/db';
import { categories, debtPayments, gamification, transactions } from '@/db/schema';
import { Semaforo } from '@/constants/theme';

export interface HealthScore {
  total: number; // 0-100
  balance: number; // 0-40
  constancia: number; // 0-20
  deudas: number; // 0-20
  esencial: number; // 0-20
  color: string;
  mensaje: string;
  consejo: string | null;
  ingresos: number;
  gastos: number;
}

const iso = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export async function computeHealthScore(): Promise<HealthScore> {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;

  const monthTx = await db
    .select({ tx: transactions, cat: categories })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, monthStart), lte(transactions.date, today)));

  const ingresos = monthTx
    .filter((r) => r.tx.type === 'ingreso')
    .reduce((s, r) => s + r.tx.amountUsd, 0);
  const gastos = monthTx
    .filter((r) => r.tx.type === 'gasto')
    .reduce((s, r) => s + r.tx.amountUsd, 0);

  // Balance: 40 pts si gastos <= ingresos; baja linealmente a 0 cuando gastos = 150% ingresos
  let balance: number;
  if (ingresos <= 0) {
    balance = gastos > 0 ? 0 : 40;
  } else if (gastos <= ingresos) {
    balance = 40;
  } else {
    const exceso = (gastos - ingresos) / (ingresos * 0.5);
    balance = Math.max(0, Math.round(40 * (1 - exceso)));
  }

  // Constancia: días con registro en los últimos 7
  const week = new Date();
  week.setDate(week.getDate() - 6);
  const weekTx = await db
    .select({ date: transactions.date })
    .from(transactions)
    .where(gte(transactions.date, iso(week)));
  const daysLogged = new Set(weekTx.map((t) => t.date)).size;
  const constancia = Math.round((daysLogged / 7) * 20);

  // Deudas: -10 por cada pago vencido
  const overdue = await db
    .select({ id: debtPayments.id })
    .from(debtPayments)
    .where(and(lt(debtPayments.dueDate, today), isNull(debtPayments.paidAt)));
  const deudas = Math.max(0, 20 - overdue.length * 10);

  // Gasto esencial: >= 60% en categorías esenciales → 20 pts, lineal por debajo
  const gastoEsencial = monthTx
    .filter((r) => r.tx.type === 'gasto' && r.cat?.isEssential === 1)
    .reduce((s, r) => s + r.tx.amountUsd, 0);
  let esencial: number;
  if (gastos <= 0) esencial = 20;
  else esencial = Math.min(20, Math.round((gastoEsencial / gastos / 0.6) * 20));

  const total = balance + constancia + deudas + esencial;

  let color: string, mensaje: string;
  if (total >= 70) {
    color = Semaforo.verde;
    mensaje = '¡Vas bien!';
  } else if (total >= 40) {
    color = Semaforo.amarillo;
    mensaje = 'Ojo con tus gastos';
  } else {
    color = Semaforo.rojo;
    mensaje = 'Alerta: gastas más de lo que ganas';
  }

  let consejo: string | null = null;
  if (balance < 20 && ingresos > 0) {
    consejo = 'Este mes gastas más de lo que ganas. Revisa tus gastos no esenciales.';
  } else if (overdue.length > 0) {
    consejo = `Tienes ${overdue.length} pago(s) vencido(s). Ponte al día para no endeudarte más.`;
  } else if (esencial < 12 && gastos > 0) {
    consejo = 'Más del 40% de tu gasto es en cosas no esenciales. ¡Cuidado!';
  } else if (constancia < 10) {
    consejo = 'Anota tus gastos todos los días para tener el control real.';
  }

  return { total, balance, constancia, deudas, esencial, color, mensaje, consejo, ingresos, gastos };
}

// ---- Racha y logros ----

export interface GamState {
  streakDays: number;
  bestStreak: number;
  badges: string[];
}

export const BADGE_DEFS: Record<string, { nombre: string; icon: string; desc: string }> = {
  primer_registro: { nombre: 'Primer paso', icon: 'foot-print', desc: 'Anotaste tu primer movimiento' },
  semana_completa: { nombre: 'Semana completa', icon: 'calendar-week', desc: '7 días seguidos anotando' },
  racha_30: { nombre: 'Constancia de hierro', icon: 'fire', desc: '30 días de racha' },
  deuda_pagada: { nombre: 'Libre de esa deuda', icon: 'check-decagram', desc: 'Pagaste una deuda completa' },
  mes_verde: { nombre: 'Mes en verde', icon: 'leaf', desc: 'Cerraste un mes gastando menos de lo que ganas' },
  meta_lograda: { nombre: 'Meta cumplida', icon: 'flag-checkered', desc: 'Alcanzaste una meta de ahorro' },
};

export async function getGamState(): Promise<GamState> {
  const [row] = await db.select().from(gamification).where(eq(gamification.id, 1)).limit(1);
  if (!row) return { streakDays: 0, bestStreak: 0, badges: [] };
  return {
    streakDays: row.streakDays,
    bestStreak: row.bestStreak,
    badges: JSON.parse(row.badges),
  };
}

export async function awardBadge(key: string): Promise<boolean> {
  const state = await getGamState();
  if (state.badges.includes(key)) return false;
  const badges = [...state.badges, key];
  await db
    .update(gamification)
    .set({ badges: JSON.stringify(badges) })
    .where(eq(gamification.id, 1));
  return true;
}

/** Llamar al guardar un movimiento. Devuelve badges nuevos ganados. */
export async function registerActivity(): Promise<string[]> {
  const today = todayISO();
  const [row] = await db.select().from(gamification).where(eq(gamification.id, 1)).limit(1);
  const earned: string[] = [];
  if (!row) return earned;

  let streak = row.streakDays;
  if (row.lastLogDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const anteayer = new Date();
    anteayer.setDate(anteayer.getDate() - 2);
    // gracia de 1 día: la racha sobrevive si anotaste ayer o anteayer
    if (row.lastLogDate === iso(yesterday) || row.lastLogDate === iso(anteayer)) {
      streak += 1;
    } else {
      streak = 1;
    }
    await db
      .update(gamification)
      .set({
        streakDays: streak,
        lastLogDate: today,
        bestStreak: Math.max(streak, row.bestStreak),
      })
      .where(eq(gamification.id, 1));
  }

  if (await awardBadge('primer_registro')) earned.push('primer_registro');
  if (streak >= 7 && (await awardBadge('semana_completa'))) earned.push('semana_completa');
  if (streak >= 30 && (await awardBadge('racha_30'))) earned.push('racha_30');
  return earned;
}

// ---- Alertas de riesgo al guardar un gasto ----

export async function evaluateExpenseRisk(amountUsd: number): Promise<string | null> {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthTx = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, monthStart), lte(transactions.date, today)));

  const ingresos = monthTx
    .filter((t) => t.type === 'ingreso')
    .reduce((s, t) => s + t.amountUsd, 0);
  const gastos =
    monthTx.filter((t) => t.type === 'gasto').reduce((s, t) => s + t.amountUsd, 0) + amountUsd;

  if (ingresos > 0 && amountUsd > ingresos * 0.2) {
    const pct = Math.round((amountUsd / ingresos) * 100);
    return `Compra grande: esto es el ${pct}% de lo que ganas al mes. ¿Seguro que lo necesitas?`;
  }
  if (ingresos > 0 && gastos > ingresos) {
    return 'Con este gasto quedas gastando más de lo que ganas este mes.';
  }
  return null;
}
