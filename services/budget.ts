import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';

import { db, todayISO } from '@/db';
import { debtPayments, debts, recurring, transactions } from '@/db/schema';
import { getLatestRates } from '@/services/rates';
import { Semaforo } from '@/constants/theme';

const SAVINGS_PCT_KEY = 'budget_savings_pct_v1';

export interface BudgetConfig {
  savingsPct: number; // 0-100
}

export interface BudgetStatus {
  monthIncome: number; // USD, entradas de este mes
  monthSpent: number; // USD, gastos ya anotados
  fixedUpcoming: number; // USD, recurrentes pendientes que vencen antes de fin de mes
  debtsUpcoming: number; // USD, cuotas pendientes que vencen antes de fin de mes
  savingsTarget: number; // USD, objetivo de ahorro del mes
  available: number; // USD, lo que aún puedes gastar sin romper el plan
  perDay: number; // USD, disponible / días restantes (incluyendo hoy)
  daysRemaining: number;
  savingsPct: number;
  color: string; // semáforo de qué tan bien vas
  headline: string; // línea principal para mostrar
  detail: string; // subtítulo con contexto
}

export async function getBudgetConfig(): Promise<BudgetConfig> {
  const raw = await AsyncStorage.getItem(SAVINGS_PCT_KEY);
  const savingsPct = raw != null ? Number(raw) : 20;
  return { savingsPct: Number.isFinite(savingsPct) ? clamp(savingsPct, 0, 90) : 20 };
}

export async function setBudgetConfig(cfg: BudgetConfig): Promise<void> {
  await AsyncStorage.setItem(SAVINGS_PCT_KEY, String(clamp(cfg.savingsPct, 0, 90)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function monthBounds(today: string): { start: string; end: string; daysRemaining: number } {
  const [y, m] = today.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const d = Number(today.slice(8, 10));
  const daysRemaining = Math.max(1, lastDay - d + 1);
  return { start, end, daysRemaining };
}

function toUsd(amount: number, currency: 'VES' | 'USD', rate: number | null): number {
  if (currency === 'USD') return amount;
  if (!rate || rate <= 0) return 0;
  return amount / rate;
}

export async function computeBudget(): Promise<BudgetStatus> {
  const today = todayISO();
  const { start, end, daysRemaining } = monthBounds(today);
  const cfg = await getBudgetConfig();

  const monthTx = await db
    .select()
    .from(transactions)
    .where(and(gte(transactions.date, start), lte(transactions.date, end)));

  const monthIncome = monthTx.filter((t) => t.type === 'ingreso').reduce((s, t) => s + t.amountUsd, 0);
  const monthSpent = monthTx.filter((t) => t.type === 'gasto').reduce((s, t) => s + t.amountUsd, 0);

  const rates = await getLatestRates();
  const rate = rates.paralelo?.rate ?? rates.bcv?.rate ?? rates.binance_p2p?.rate ?? null;

  // Recurrentes activos con nextDue dentro del mes (incluye atrasados)
  const activeRecurring = await db
    .select()
    .from(recurring)
    .where(and(eq(recurring.isActive, 1), lte(recurring.nextDue, end)));
  const fixedUpcoming = activeRecurring.reduce(
    (s, r) => s + toUsd(r.amount, r.currency, rate),
    0,
  );

  // Deudas: cuotas no pagadas con dueDate <= end
  const pendingPayments = await db
    .select({ p: debtPayments, d: debts })
    .from(debtPayments)
    .innerJoin(debts, eq(debtPayments.debtId, debts.id))
    .where(and(isNull(debtPayments.paidAt), lte(debtPayments.dueDate, end)));
  const debtsUpcoming = pendingPayments.reduce(
    (s, r) => s + toUsd(r.p.amount, r.d.currency, rate),
    0,
  );

  // Objetivo de ahorro sobre el mayor de: ingresos del mes o promedio implícito.
  // Si aún no hay ingresos este mes, no forzamos una meta imposible.
  const savingsTarget = monthIncome > 0 ? monthIncome * (cfg.savingsPct / 100) : 0;

  const cashInHand = monthIncome - monthSpent;
  const commitments = fixedUpcoming + debtsUpcoming + savingsTarget;
  const available = cashInHand - commitments;
  const perDay = available / daysRemaining;

  let color: string;
  let headline: string;
  let detail: string;

  if (monthIncome <= 0 && monthSpent <= 0) {
    color = Semaforo.amarillo;
    headline = 'Empieza anotando tus ingresos y gastos del mes';
    detail = 'Cuando anotes al menos un ingreso, te digo cuánto puedes gastar por día.';
  } else if (available < 0) {
    color = Semaforo.rojo;
    headline = `Te pasaste $${fmt(-available)}`;
    detail = `Vas gastando $${fmt(monthSpent)} y aún debes $${fmt(fixedUpcoming + debtsUpcoming)} en fijos y cuotas.`;
  } else if (perDay < 2) {
    color = Semaforo.amarillo;
    headline = `Solo $${fmt(available)} para ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}`;
    detail = `Eso son $${fmt(perDay)} al día. Cuida los gastos no esenciales.`;
  } else {
    color = Semaforo.verde;
    headline = `Puedes gastar hasta $${fmt(perDay)} al día`;
    detail = `Te quedan $${fmt(available)} para los próximos ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}.`;
  }

  return {
    monthIncome,
    monthSpent,
    fixedUpcoming,
    debtsUpcoming,
    savingsTarget,
    available,
    perDay,
    daysRemaining,
    savingsPct: cfg.savingsPct,
    color,
    headline,
    detail,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
