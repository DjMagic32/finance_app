import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

import { db, nowISO } from '@/db';
import { transactions } from '@/db/schema';
import { getLatestRates } from '@/services/rates';

const PASSWORD_STORE = 'mercantil_password';
const USERNAME_STORE = 'mercantil_username';

export const MERCANTIL_SOURCE = 'mercantil_pdf';
export const MERCANTIL_URL = 'https://www30.mercantilbanco.com/login';
export const MERCANTIL_STATEMENTS_URL = 'https://www30.mercantilbanco.com/account/account-statements';
export const MERCANTIL_HOST_SUFFIX = 'mercantilbanco.com';

// Portapapeles: tiempo antes de auto-borrar la clave.
const CLIPBOARD_CLEAR_MS = 45_000;

export interface MercantilCreds {
  username: string;
  password: string;
}

export async function saveMercantilCreds(creds: Partial<MercantilCreds>): Promise<void> {
  if (creds.username !== undefined) {
    if (creds.username.trim()) {
      await SecureStore.setItemAsync(USERNAME_STORE, creds.username.trim());
    } else {
      await SecureStore.deleteItemAsync(USERNAME_STORE);
    }
  }
  if (creds.password !== undefined) {
    if (creds.password.length > 0) {
      await SecureStore.setItemAsync(PASSWORD_STORE, creds.password);
    } else {
      await SecureStore.deleteItemAsync(PASSWORD_STORE);
    }
  }
}

export async function getMercantilCreds(): Promise<MercantilCreds> {
  const username = (await SecureStore.getItemAsync(USERNAME_STORE)) ?? '';
  const password = (await SecureStore.getItemAsync(PASSWORD_STORE)) ?? '';
  return { username, password };
}

/** Copia al portapapeles y programa auto-borrado. Devuelve el timeout id. */
export async function copyPasswordWithAutoClear(password: string): Promise<number> {
  await Clipboard.setStringAsync(password);
  const currentAtCopy = password;
  const handle = setTimeout(async () => {
    try {
      const now = await Clipboard.getStringAsync();
      if (now === currentAtCopy) {
        await Clipboard.setStringAsync('');
      }
    } catch {
      // ignoramos
    }
  }, CLIPBOARD_CLEAR_MS);
  return handle as unknown as number;
}

export function isMercantilUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === MERCANTIL_HOST_SUFFIX || u.hostname.endsWith('.' + MERCANTIL_HOST_SUFFIX);
  } catch {
    return false;
  }
}

// -------- Movimientos parseados del PDF --------

export interface ParsedMovement {
  date: string; // yyyy-mm-dd
  ref: string; // NUMERO del banco
  description: string;
  cargos: number; // Bs
  abonos: number; // Bs
}

export interface ImportSummary {
  inserted: number;
  duplicated: number;
  fromDate: string | null;
  toDate: string | null;
}

/** Inserta los movimientos parseados. Deduplica por (source, ref). */
export async function importMovements(movs: ParsedMovement[]): Promise<ImportSummary> {
  if (movs.length === 0) return { inserted: 0, duplicated: 0, fromDate: null, toDate: null };

  const rates = await getLatestRates();
  const fallbackRate = rates.paralelo?.rate ?? rates.bcv?.rate ?? rates.binance_p2p?.rate ?? null;
  const rateSource = rates.paralelo
    ? 'paralelo'
    : rates.bcv
      ? 'bcv'
      : rates.binance_p2p
        ? 'binance_p2p'
        : null;

  const sorted = [...movs].sort((a, b) => a.date.localeCompare(b.date));
  const fromDate = sorted[0].date;
  const toDate = sorted[sorted.length - 1].date;

  // Antes de insertar el PDF, borramos cualquier movimiento previo de notificación
  // en el mismo rango (el PDF gana como fuente de verdad).
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.externalSource, 'mercantil_notif'),
        gte(transactions.date, fromDate),
        lte(transactions.date, toDate),
      ),
    );

  let inserted = 0;
  let duplicated = 0;

  for (const m of movs) {
    const isGasto = m.cargos > 0;
    const amountVes = isGasto ? m.cargos : m.abonos;
    if (amountVes <= 0) continue;
    const amountUsd = fallbackRate ? amountVes / fallbackRate : 0;

    const res = await db
      .insert(transactions)
      .values({
        type: isGasto ? 'gasto' : 'ingreso',
        categoryId: null,
        amount: amountVes,
        currency: 'VES',
        amountUsd,
        amountVes,
        rateUsed: fallbackRate,
        rateSource,
        note: null,
        bankDescription: m.description.slice(0, 500),
        date: m.date,
        createdAt: nowISO(),
        externalSource: MERCANTIL_SOURCE,
        externalRef: m.ref,
      })
      .onConflictDoNothing()
      .returning({ id: transactions.id });

    if (res.length > 0) inserted++;
    else duplicated++;
  }

  return { inserted, duplicated, fromDate, toDate };
}

/** Cuenta cuántos movimientos hay ya de Mercantil (para mostrar en UI). */
export async function countMercantilMovements(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.externalSource, MERCANTIL_SOURCE));
  return Number(rows[0]?.n ?? 0);
}
