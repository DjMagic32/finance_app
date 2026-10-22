import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://api.binance.com';
const RECV_WINDOW = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const HMAC_BLOCK_SIZE = 64;

const API_KEY_STORE = 'binance_api_key';
const API_SECRET_STORE = 'binance_api_secret';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface BinanceAccount {
  balances: BinanceBalance[];
  canTrade: boolean;
  canWithdraw: boolean;
  accountType: string;
}

export class BinanceAuthError extends Error {}
export class BinanceNotConfiguredError extends Error {
  constructor() {
    super('Binance no está configurado. Guarda tu API key y secret primero.');
  }
}

export async function saveCredentials(creds: BinanceCredentials): Promise<void> {
  const apiKey = creds.apiKey.trim();
  const apiSecret = creds.apiSecret.trim();
  if (!apiKey || !apiSecret) {
    throw new Error('API key y secret son obligatorios');
  }
  await SecureStore.setItemAsync(API_KEY_STORE, apiKey);
  await SecureStore.setItemAsync(API_SECRET_STORE, apiSecret);
}

export async function getCredentials(): Promise<BinanceCredentials | null> {
  const apiKey = await SecureStore.getItemAsync(API_KEY_STORE);
  const apiSecret = await SecureStore.getItemAsync(API_SECRET_STORE);
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

export async function deleteCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORE);
  await SecureStore.deleteItemAsync(API_SECRET_STORE);
}

export async function hasCredentials(): Promise<boolean> {
  return (await getCredentials()) !== null;
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  // Copiamos a un buffer nuevo para satisfacer el tipo Uint8Array<ArrayBuffer> que pide expo-crypto.
  const input = new Uint8Array(bytes.length);
  input.set(bytes);
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, input);
  return new Uint8Array(buf);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

// HMAC-SHA256 según RFC 2104, montado sobre el SHA-256 nativo de expo-crypto.
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  let keyBytes = utf8Bytes(secret);
  if (keyBytes.length > HMAC_BLOCK_SIZE) {
    keyBytes = await sha256(keyBytes);
  }
  if (keyBytes.length < HMAC_BLOCK_SIZE) {
    const padded = new Uint8Array(HMAC_BLOCK_SIZE);
    padded.set(keyBytes);
    keyBytes = padded;
  }
  const iKeyPad = new Uint8Array(HMAC_BLOCK_SIZE);
  const oKeyPad = new Uint8Array(HMAC_BLOCK_SIZE);
  for (let i = 0; i < HMAC_BLOCK_SIZE; i++) {
    iKeyPad[i] = keyBytes[i] ^ 0x36;
    oKeyPad[i] = keyBytes[i] ^ 0x5c;
  }
  const msgBytes = utf8Bytes(message);
  const inner = new Uint8Array(iKeyPad.length + msgBytes.length);
  inner.set(iKeyPad, 0);
  inner.set(msgBytes, iKeyPad.length);
  const innerHash = await sha256(inner);
  const outer = new Uint8Array(oKeyPad.length + innerHash.length);
  outer.set(oKeyPad, 0);
  outer.set(innerHash, oKeyPad.length);
  return toHex(await sha256(outer));
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function encodeParams(params: Record<string, string | number>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const creds = await getCredentials();
  if (!creds) throw new BinanceNotConfiguredError();

  const withTs = {
    ...params,
    recvWindow: RECV_WINDOW,
    timestamp: Date.now(),
  };
  const query = encodeParams(withTs);
  const signature = await hmacSha256Hex(creds.apiSecret, query);
  const url = `${BASE_URL}${path}?${query}&signature=${signature}`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'X-MBX-APIKEY': creds.apiKey },
  });

  if (res.status === 401 || res.status === 403) {
    throw new BinanceAuthError(
      'La clave API fue rechazada. Revisa que sea correcta y que tenga permiso de lectura.',
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Binance ${res.status}: ${text || 'error desconocido'}`);
  }
  return (await res.json()) as T;
}

/** Balances spot. Filtra activos con saldo > 0 y los ordena por total desc. */
export async function getAccount(): Promise<BinanceAccount> {
  const raw = await signedGet<{
    accountType: string;
    canTrade: boolean;
    canWithdraw: boolean;
    balances: Array<{ asset: string; free: string; locked: string }>;
  }>('/api/v3/account');

  const balances: BinanceBalance[] = raw.balances
    .map((b) => {
      const free = parseFloat(b.free) || 0;
      const locked = parseFloat(b.locked) || 0;
      return { asset: b.asset, free, locked, total: free + locked };
    })
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    balances,
    canTrade: raw.canTrade,
    canWithdraw: raw.canWithdraw,
    accountType: raw.accountType,
  };
}

export async function testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getAccount();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
