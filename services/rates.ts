import AsyncStorage from '@react-native-async-storage/async-storage';

import { db, nowISO, todayISO } from '@/db';
import { exchangeRates } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export type RateSource = 'bcv' | 'paralelo' | 'binance_p2p';

export interface RateInfo {
  source: RateSource;
  rate: number; // Bs por USD
  date: string; // yyyy-mm-dd del snapshot
  stale: boolean; // true si no es de hoy
}

export type Rates = Partial<Record<RateSource, RateInfo>>;

const CACHE_KEY = 'latest_rates_v1';
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDolarApi(): Promise<Array<{ source: RateSource; rate: number }>> {
  const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares');
  if (!res.ok) throw new Error(`dolarapi ${res.status}`);
  const data: Array<{ fuente: string; promedio: number }> = await res.json();
  const out: Array<{ source: RateSource; rate: number }> = [];
  for (const d of data) {
    if (d.fuente === 'oficial' && d.promedio > 0) out.push({ source: 'bcv', rate: d.promedio });
    if (d.fuente === 'paralelo' && d.promedio > 0)
      out.push({ source: 'paralelo', rate: d.promedio });
  }
  if (out.length === 0) throw new Error('dolarapi sin datos');
  return out;
}

async function fetchPydolarve(): Promise<Array<{ source: RateSource; rate: number }>> {
  const res = await fetchWithTimeout('https://pydolarve.org/api/v2/dollar?page=criptodolar');
  if (!res.ok) throw new Error(`pydolarve ${res.status}`);
  const data = await res.json();
  const monitors = data?.monitors ?? {};
  const out: Array<{ source: RateSource; rate: number }> = [];
  if (monitors.bcv?.price > 0) out.push({ source: 'bcv', rate: monitors.bcv.price });
  if (monitors.enparalelovzla?.price > 0)
    out.push({ source: 'paralelo', rate: monitors.enparalelovzla.price });
  if (out.length === 0) throw new Error('pydolarve sin datos');
  return out;
}

// API no documentada de Binance: se trata como dato opcional, nunca bloquea nada.
async function fetchBinanceP2P(): Promise<{ source: RateSource; rate: number }> {
  const res = await fetchWithTimeout(
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: 1,
        rows: 10,
        payTypes: [],
        asset: 'USDT',
        tradeType: 'BUY',
        fiat: 'VES',
        publisherType: null,
      }),
    },
  );
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const data = await res.json();
  const prices: number[] = (data?.data ?? [])
    .map((ad: any) => parseFloat(ad?.adv?.price))
    .filter((p: number) => Number.isFinite(p) && p > 0)
    .sort((a: number, b: number) => a - b);
  if (prices.length === 0) throw new Error('binance sin datos');
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  return { source: 'binance_p2p', rate: median };
}

async function saveSnapshot(source: RateSource, rate: number, date: string) {
  await db
    .insert(exchangeRates)
    .values({ date, source, rate, fetchedAt: nowISO() })
    .onConflictDoNothing();
}

/** Descarga las tasas de hoy si aún no hay snapshot. Nunca lanza error. */
export async function refreshRates(): Promise<Rates> {
  const today = todayISO();
  const results: Array<{ source: RateSource; rate: number }> = [];

  try {
    results.push(...(await fetchDolarApi()));
  } catch {
    try {
      results.push(...(await fetchPydolarve()));
    } catch {
      // sin conexión o APIs caídas: seguimos con lo local
    }
  }

  try {
    results.push(await fetchBinanceP2P());
  } catch {
    // opcional
  }

  for (const r of results) {
    try {
      await saveSnapshot(r.source, r.rate, today);
    } catch {}
  }

  const rates = await getLatestRates();
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rates));
  } catch {}
  return rates;
}

/** Última tasa conocida por fuente desde la DB local (funciona offline). */
export async function getLatestRates(): Promise<Rates> {
  const today = todayISO();
  const out: Rates = {};
  for (const source of ['bcv', 'paralelo', 'binance_p2p'] as RateSource[]) {
    const rows = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.source, source))
      .orderBy(desc(exchangeRates.date))
      .limit(1);
    if (rows.length > 0) {
      out[source] = {
        source,
        rate: rows[0].rate,
        date: rows[0].date,
        stale: rows[0].date !== today,
      };
    }
  }
  return out;
}

/** Historial de una fuente para el gráfico de línea. */
export async function getRateHistory(source: RateSource) {
  return db
    .select({ date: exchangeRates.date, rate: exchangeRates.rate })
    .from(exchangeRates)
    .where(eq(exchangeRates.source, source))
    .orderBy(exchangeRates.date);
}
