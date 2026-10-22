import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, nowISO } from '@/db';
import {
  projectAllocations,
  projectBoards,
  projectCards,
  projectColumns,
  projectSubtasks,
  transactions,
  type ProjectBoard,
  type ProjectCard,
  type ProjectColumn,
  type ProjectSubtask,
  type Transaction,
} from '@/db/schema';

export type Currency = 'VES' | 'USD';

const DEFAULT_COLUMNS: Array<{ name: string; color: string; isDone: number }> = [
  { name: 'Por hacer', color: '#90A4AE', isDone: 0 },
  { name: 'En proceso', color: '#1565C0', isDone: 0 },
  { name: 'Pagado', color: '#F9A825', isDone: 0 },
  { name: 'Listo', color: '#2E7D32', isDone: 1 },
];

// ---------- Boards ----------

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  budgetAmount?: number | null;
  budgetCurrency?: Currency | null;
}

export async function createBoard(input: CreateBoardInput): Promise<number> {
  const now = nowISO();
  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${projectBoards.sortOrder}), -1) + 1` })
    .from(projectBoards);
  const [row] = await db
    .insert(projectBoards)
    .values({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon ?? 'view-dashboard',
      color: input.color ?? '#1565C0',
      budgetAmount: input.budgetAmount ?? null,
      budgetCurrency: input.budgetCurrency ?? null,
      sortOrder: nextOrder,
      createdAt: now,
    })
    .returning({ id: projectBoards.id });

  await db.insert(projectColumns).values(
    DEFAULT_COLUMNS.map((c, i) => ({
      boardId: row.id,
      name: c.name,
      color: c.color,
      sortOrder: i,
      isDone: c.isDone,
    })),
  );

  return row.id;
}

export async function updateBoard(
  id: number,
  patch: Partial<Omit<CreateBoardInput, 'name'>> & { name?: string },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.description !== undefined) values.description = patch.description?.trim() || null;
  if (patch.icon !== undefined) values.icon = patch.icon;
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.budgetAmount !== undefined) values.budgetAmount = patch.budgetAmount;
  if (patch.budgetCurrency !== undefined) values.budgetCurrency = patch.budgetCurrency;
  if (Object.keys(values).length > 0) {
    await db.update(projectBoards).set(values).where(eq(projectBoards.id, id));
  }
}

export async function archiveBoard(id: number, archived = true): Promise<void> {
  await db
    .update(projectBoards)
    .set({ isArchived: archived ? 1 : 0 })
    .where(eq(projectBoards.id, id));
}

export async function deleteBoard(id: number): Promise<void> {
  await db.delete(projectBoards).where(eq(projectBoards.id, id));
}

export async function listBoards(includeArchived = false): Promise<ProjectBoard[]> {
  const rows = await db
    .select()
    .from(projectBoards)
    .orderBy(asc(projectBoards.sortOrder), desc(projectBoards.id));
  return includeArchived ? rows : rows.filter((b) => b.isArchived === 0);
}

export async function getBoard(id: number): Promise<ProjectBoard | null> {
  const [row] = await db.select().from(projectBoards).where(eq(projectBoards.id, id)).limit(1);
  return row ?? null;
}

// ---------- Columns ----------

export async function listColumns(boardId: number): Promise<ProjectColumn[]> {
  return db
    .select()
    .from(projectColumns)
    .where(eq(projectColumns.boardId, boardId))
    .orderBy(asc(projectColumns.sortOrder), asc(projectColumns.id));
}

export async function createColumn(
  boardId: number,
  name: string,
  color = '#90A4AE',
  isDone = false,
): Promise<number> {
  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${projectColumns.sortOrder}), -1) + 1` })
    .from(projectColumns)
    .where(eq(projectColumns.boardId, boardId));
  const [row] = await db
    .insert(projectColumns)
    .values({ boardId, name: name.trim(), color, sortOrder: nextOrder, isDone: isDone ? 1 : 0 })
    .returning({ id: projectColumns.id });
  return row.id;
}

export async function updateColumn(
  id: number,
  patch: { name?: string; color?: string; isDone?: boolean },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.color !== undefined) values.color = patch.color;
  if (patch.isDone !== undefined) values.isDone = patch.isDone ? 1 : 0;
  if (Object.keys(values).length > 0) {
    await db.update(projectColumns).set(values).where(eq(projectColumns.id, id));
  }
}

export async function reorderColumns(boardId: number, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(projectColumns)
      .set({ sortOrder: i })
      .where(and(eq(projectColumns.id, orderedIds[i]), eq(projectColumns.boardId, boardId)));
  }
}

export async function deleteColumn(id: number): Promise<void> {
  await db.delete(projectColumns).where(eq(projectColumns.id, id));
}

// ---------- Cards ----------

export interface CreateCardInput {
  boardId: number;
  columnId: number;
  title: string;
  note?: string | null;
  estimatedAmount?: number | null;
  estimatedCurrency?: Currency | null;
  dueDate?: string | null;
}

export async function createCard(input: CreateCardInput): Promise<number> {
  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${projectCards.sortOrder}), -1) + 1` })
    .from(projectCards)
    .where(eq(projectCards.columnId, input.columnId));
  const [row] = await db
    .insert(projectCards)
    .values({
      boardId: input.boardId,
      columnId: input.columnId,
      title: input.title.trim(),
      note: input.note?.trim() || null,
      estimatedAmount: input.estimatedAmount ?? null,
      estimatedCurrency: input.estimatedCurrency ?? null,
      dueDate: input.dueDate ?? null,
      sortOrder: nextOrder,
      createdAt: nowISO(),
    })
    .returning({ id: projectCards.id });
  return row.id;
}

export async function updateCard(
  id: number,
  patch: Partial<Omit<CreateCardInput, 'boardId'>>,
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title.trim();
  if (patch.note !== undefined) values.note = patch.note?.trim() || null;
  if (patch.estimatedAmount !== undefined) values.estimatedAmount = patch.estimatedAmount;
  if (patch.estimatedCurrency !== undefined) values.estimatedCurrency = patch.estimatedCurrency;
  if (patch.dueDate !== undefined) values.dueDate = patch.dueDate;
  if (patch.columnId !== undefined) values.columnId = patch.columnId;
  if (Object.keys(values).length > 0) {
    await db.update(projectCards).set(values).where(eq(projectCards.id, id));
  }
}

export async function moveCard(cardId: number, newColumnId: number): Promise<void> {
  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${projectCards.sortOrder}), -1) + 1` })
    .from(projectCards)
    .where(eq(projectCards.columnId, newColumnId));

  const [col] = await db
    .select()
    .from(projectColumns)
    .where(eq(projectColumns.id, newColumnId))
    .limit(1);
  const completedAt = col?.isDone ? nowISO() : null;

  await db
    .update(projectCards)
    .set({ columnId: newColumnId, sortOrder: nextOrder, completedAt })
    .where(eq(projectCards.id, cardId));
}

export async function archiveCard(id: number, archived = true): Promise<void> {
  await db
    .update(projectCards)
    .set({ isArchived: archived ? 1 : 0 })
    .where(eq(projectCards.id, id));
}

export async function deleteCard(id: number): Promise<void> {
  await db.delete(projectCards).where(eq(projectCards.id, id));
}

export async function getCard(id: number): Promise<ProjectCard | null> {
  const [row] = await db.select().from(projectCards).where(eq(projectCards.id, id)).limit(1);
  return row ?? null;
}

export async function listCardsForBoard(boardId: number): Promise<ProjectCard[]> {
  return db
    .select()
    .from(projectCards)
    .where(and(eq(projectCards.boardId, boardId), eq(projectCards.isArchived, 0)))
    .orderBy(asc(projectCards.sortOrder), desc(projectCards.id));
}

// ---------- Subtasks ----------

export async function listSubtasks(cardId: number): Promise<ProjectSubtask[]> {
  return db
    .select()
    .from(projectSubtasks)
    .where(eq(projectSubtasks.cardId, cardId))
    .orderBy(asc(projectSubtasks.sortOrder), asc(projectSubtasks.id));
}

export async function createSubtask(
  cardId: number,
  title: string,
  estimatedAmount?: number | null,
  estimatedCurrency?: Currency | null,
): Promise<number> {
  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${projectSubtasks.sortOrder}), -1) + 1` })
    .from(projectSubtasks)
    .where(eq(projectSubtasks.cardId, cardId));
  const [row] = await db
    .insert(projectSubtasks)
    .values({
      cardId,
      title: title.trim(),
      estimatedAmount: estimatedAmount ?? null,
      estimatedCurrency: estimatedCurrency ?? null,
      sortOrder: nextOrder,
    })
    .returning({ id: projectSubtasks.id });
  return row.id;
}

export async function toggleSubtask(id: number): Promise<void> {
  const [row] = await db.select().from(projectSubtasks).where(eq(projectSubtasks.id, id)).limit(1);
  if (!row) return;
  await db
    .update(projectSubtasks)
    .set({ done: row.done === 1 ? 0 : 1 })
    .where(eq(projectSubtasks.id, id));
}

export async function updateSubtask(
  id: number,
  patch: { title?: string; estimatedAmount?: number | null; estimatedCurrency?: Currency | null },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title.trim();
  if (patch.estimatedAmount !== undefined) values.estimatedAmount = patch.estimatedAmount;
  if (patch.estimatedCurrency !== undefined) values.estimatedCurrency = patch.estimatedCurrency;
  if (Object.keys(values).length > 0) {
    await db.update(projectSubtasks).set(values).where(eq(projectSubtasks.id, id));
  }
}

export async function deleteSubtask(id: number): Promise<void> {
  await db.delete(projectSubtasks).where(eq(projectSubtasks.id, id));
}

// ---------- Allocations ----------

export interface AllocationWithContext {
  id: number;
  transactionId: number;
  cardId: number;
  subtaskId: number | null;
  amount: number;
  currency: Currency;
  amountUsd: number;
  amountVes: number;
  createdAt: string;
}

/**
 * Allocates a portion of a transaction to a project card.
 * Converts amount to USD/VES using the transaction's own stored rate,
 * so the allocation stays consistent with the source movement.
 */
export async function allocateTransaction(input: {
  transactionId: number;
  cardId: number;
  subtaskId?: number | null;
  amount: number;
}): Promise<number> {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, input.transactionId))
    .limit(1);
  if (!tx) throw new Error('Movimiento no encontrado');

  const rate = tx.rateUsed && tx.rateUsed > 0 ? tx.rateUsed : null;
  const currency = tx.currency;
  const amount = input.amount;
  const amountUsd =
    currency === 'USD' ? amount : rate ? amount / rate : (amount * tx.amountUsd) / tx.amount;
  const amountVes =
    currency === 'VES' ? amount : rate ? amount * rate : (amount * tx.amountVes) / tx.amount;

  const [row] = await db
    .insert(projectAllocations)
    .values({
      transactionId: input.transactionId,
      cardId: input.cardId,
      subtaskId: input.subtaskId ?? null,
      amount,
      currency,
      amountUsd,
      amountVes,
      createdAt: nowISO(),
    })
    .returning({ id: projectAllocations.id });
  return row.id;
}

export async function removeAllocation(id: number): Promise<void> {
  await db.delete(projectAllocations).where(eq(projectAllocations.id, id));
}

export async function listAllocationsForTransaction(txId: number) {
  const rows = await db
    .select({
      alloc: projectAllocations,
      card: projectCards,
      board: projectBoards,
    })
    .from(projectAllocations)
    .innerJoin(projectCards, eq(projectCards.id, projectAllocations.cardId))
    .innerJoin(projectBoards, eq(projectBoards.id, projectCards.boardId))
    .where(eq(projectAllocations.transactionId, txId))
    .orderBy(desc(projectAllocations.id));
  return rows;
}

export async function listAllocationsForCard(cardId: number) {
  const rows = await db
    .select({ alloc: projectAllocations, tx: transactions })
    .from(projectAllocations)
    .innerJoin(transactions, eq(transactions.id, projectAllocations.transactionId))
    .where(eq(projectAllocations.cardId, cardId))
    .orderBy(desc(transactions.date), desc(transactions.id));
  return rows;
}

/**
 * How much of the transaction amount (in its own currency) is still unassigned.
 * Negative wouldn't happen under normal operation but is clamped at 0.
 */
export async function remainingUnallocated(tx: Transaction): Promise<number> {
  const [row] = await db
    .select({ sum: sql<number>`coalesce(sum(${projectAllocations.amount}), 0)` })
    .from(projectAllocations)
    .where(eq(projectAllocations.transactionId, tx.id));
  const used = row?.sum ?? 0;
  return Math.max(0, tx.amount - used);
}

// ---------- Totals ----------

export interface CardTotals {
  cardId: number;
  estimatedAmount: number | null;
  estimatedCurrency: Currency | null;
  allocatedUsd: number;
  allocatedVes: number;
  allocationCount: number;
  /** Progress 0..1 against estimated (in matching currency). null if no estimate. */
  progress: number | null;
}

export async function cardTotals(card: ProjectCard): Promise<CardTotals> {
  const [row] = await db
    .select({
      allocatedUsd: sql<number>`coalesce(sum(${projectAllocations.amountUsd}), 0)`,
      allocatedVes: sql<number>`coalesce(sum(${projectAllocations.amountVes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(projectAllocations)
    .where(eq(projectAllocations.cardId, card.id));
  const allocatedUsd = row?.allocatedUsd ?? 0;
  const allocatedVes = row?.allocatedVes ?? 0;
  const count = row?.count ?? 0;

  let progress: number | null = null;
  if (card.estimatedAmount && card.estimatedAmount > 0) {
    const spent = card.estimatedCurrency === 'USD' ? allocatedUsd : allocatedVes;
    progress = Math.min(1, Math.max(0, spent / card.estimatedAmount));
  }

  return {
    cardId: card.id,
    estimatedAmount: card.estimatedAmount,
    estimatedCurrency: card.estimatedCurrency as Currency | null,
    allocatedUsd,
    allocatedVes,
    allocationCount: count,
    progress,
  };
}

export async function cardTotalsBatch(cardIds: number[]): Promise<Map<number, CardTotals>> {
  const result = new Map<number, CardTotals>();
  if (cardIds.length === 0) return result;

  const cards = await db.select().from(projectCards).where(inArray(projectCards.id, cardIds));
  const sums = await db
    .select({
      cardId: projectAllocations.cardId,
      allocatedUsd: sql<number>`coalesce(sum(${projectAllocations.amountUsd}), 0)`,
      allocatedVes: sql<number>`coalesce(sum(${projectAllocations.amountVes}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(projectAllocations)
    .where(inArray(projectAllocations.cardId, cardIds))
    .groupBy(projectAllocations.cardId);
  const sumsByCard = new Map(sums.map((s) => [s.cardId, s]));

  for (const card of cards) {
    const s = sumsByCard.get(card.id);
    const allocatedUsd = s?.allocatedUsd ?? 0;
    const allocatedVes = s?.allocatedVes ?? 0;
    const count = s?.count ?? 0;
    let progress: number | null = null;
    if (card.estimatedAmount && card.estimatedAmount > 0) {
      const spent = card.estimatedCurrency === 'USD' ? allocatedUsd : allocatedVes;
      progress = Math.min(1, Math.max(0, spent / card.estimatedAmount));
    }
    result.set(card.id, {
      cardId: card.id,
      estimatedAmount: card.estimatedAmount,
      estimatedCurrency: card.estimatedCurrency as Currency | null,
      allocatedUsd,
      allocatedVes,
      allocationCount: count,
      progress,
    });
  }
  return result;
}

export interface BoardTotals {
  boardId: number;
  cardCount: number;
  doneCount: number;
  estimatedUsd: number; // sum of card estimates, converted using 1 USD = ignores rate — use card's own currency
  allocatedUsd: number;
  allocatedVes: number;
  budgetAmount: number | null;
  budgetCurrency: Currency | null;
  progress: number | null;
}

export async function boardTotals(board: ProjectBoard): Promise<BoardTotals> {
  const [row] = await db
    .select({
      cardCount: sql<number>`count(*)`,
    })
    .from(projectCards)
    .where(and(eq(projectCards.boardId, board.id), eq(projectCards.isArchived, 0)));

  const [doneRow] = await db
    .select({ doneCount: sql<number>`count(*)` })
    .from(projectCards)
    .innerJoin(projectColumns, eq(projectColumns.id, projectCards.columnId))
    .where(
      and(
        eq(projectCards.boardId, board.id),
        eq(projectCards.isArchived, 0),
        eq(projectColumns.isDone, 1),
      ),
    );

  const [allocRow] = await db
    .select({
      allocatedUsd: sql<number>`coalesce(sum(${projectAllocations.amountUsd}), 0)`,
      allocatedVes: sql<number>`coalesce(sum(${projectAllocations.amountVes}), 0)`,
    })
    .from(projectAllocations)
    .innerJoin(projectCards, eq(projectCards.id, projectAllocations.cardId))
    .where(eq(projectCards.boardId, board.id));

  const allocatedUsd = allocRow?.allocatedUsd ?? 0;
  const allocatedVes = allocRow?.allocatedVes ?? 0;

  let progress: number | null = null;
  if (board.budgetAmount && board.budgetAmount > 0) {
    const spent = board.budgetCurrency === 'USD' ? allocatedUsd : allocatedVes;
    progress = Math.min(1, Math.max(0, spent / board.budgetAmount));
  }

  return {
    boardId: board.id,
    cardCount: row?.cardCount ?? 0,
    doneCount: doneRow?.doneCount ?? 0,
    estimatedUsd: 0,
    allocatedUsd,
    allocatedVes,
    budgetAmount: board.budgetAmount,
    budgetCurrency: board.budgetCurrency as Currency | null,
    progress,
  };
}
