import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const sqlite = openDatabaseSync('misfinanzas.db', { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });

const DEFAULT_CATEGORIES: Array<
  Pick<schema.Category, 'name' | 'icon' | 'color' | 'kind'> & { isEssential: number }
> = [
  { name: 'Comida y mercado', icon: 'cart', color: '#4CAF50', kind: 'gasto', isEssential: 1 },
  { name: 'Vivienda', icon: 'home', color: '#795548', kind: 'gasto', isEssential: 1 },
  { name: 'Servicios (luz, agua, internet)', icon: 'flash', color: '#FF9800', kind: 'gasto', isEssential: 1 },
  { name: 'Salud y medicinas', icon: 'medical-bag', color: '#F44336', kind: 'gasto', isEssential: 1 },
  { name: 'Transporte', icon: 'bus', color: '#2196F3', kind: 'gasto', isEssential: 1 },
  { name: 'Educación', icon: 'school', color: '#3F51B5', kind: 'gasto', isEssential: 1 },
  { name: 'Comida fuera', icon: 'silverware-fork-knife', color: '#FF5722', kind: 'gasto', isEssential: 0 },
  { name: 'Entretenimiento', icon: 'gamepad-variant', color: '#9C27B0', kind: 'gasto', isEssential: 0 },
  { name: 'Ropa y calzado', icon: 'tshirt-crew', color: '#E91E63', kind: 'gasto', isEssential: 0 },
  { name: 'Otros gastos', icon: 'dots-horizontal', color: '#607D8B', kind: 'gasto', isEssential: 0 },
  { name: 'Sueldo', icon: 'cash', color: '#4CAF50', kind: 'ingreso', isEssential: 0 },
  { name: 'Trabajos extra', icon: 'briefcase', color: '#009688', kind: 'ingreso', isEssential: 0 },
  { name: 'Remesas', icon: 'bank-transfer-in', color: '#00BCD4', kind: 'ingreso', isEssential: 0 },
  { name: 'Otros ingresos', icon: 'plus-circle', color: '#8BC34A', kind: 'ingreso', isEssential: 0 },
];

export async function seedIfEmpty() {
  const existing = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (existing.length > 0) return;
  await db.insert(schema.categories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })),
  );
  await db.insert(schema.gamification).values({ id: 1 }).onConflictDoNothing();
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
