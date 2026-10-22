import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  kind: text('kind', { enum: ['ingreso', 'gasto'] }).notNull(),
  isEssential: integer('is_essential').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  isArchived: integer('is_archived').notNull().default(0),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['ingreso', 'gasto'] }).notNull(),
    categoryId: integer('category_id').references(() => categories.id),
    amount: real('amount').notNull(),
    currency: text('currency', { enum: ['VES', 'USD'] }).notNull(),
    amountUsd: real('amount_usd').notNull(),
    amountVes: real('amount_ves').notNull(),
    rateUsed: real('rate_used'),
    rateSource: text('rate_source'),
    note: text('note'),
    bankDescription: text('bank_description'),
    date: text('date').notNull(),
    createdAt: text('created_at').notNull(),
    externalSource: text('external_source'),
    externalRef: text('external_ref'),
  },
  (t) => [uniqueIndex('idx_tx_source_ref').on(t.externalSource, t.externalRef)],
);

export const debts = sqliteTable('debts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  creditor: text('creditor').notNull(),
  description: text('description'),
  totalAmount: real('total_amount').notNull(),
  currency: text('currency', { enum: ['VES', 'USD'] }).notNull(),
  totalAmountUsd: real('total_amount_usd').notNull(),
  startDate: text('start_date').notNull(),
  dueDate: text('due_date').notNull(),
  schedule: text('schedule', { enum: ['unica', 'semanal', 'quincenal', 'mensual'] }).notNull(),
  installmentAmount: real('installment_amount').notNull(),
  status: text('status', { enum: ['activa', 'pagada', 'vencida'] }).notNull().default('activa'),
  createdAt: text('created_at').notNull(),
});

export const debtPayments = sqliteTable('debt_payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  debtId: integer('debt_id').notNull().references(() => debts.id),
  dueDate: text('due_date').notNull(),
  amount: real('amount').notNull(),
  paidAt: text('paid_at'),
  notificationIds: text('notification_ids').notNull().default('[]'),
});

export const exchangeRates = sqliteTable('exchange_rates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  source: text('source', { enum: ['bcv', 'paralelo', 'binance_p2p'] }).notNull(),
  rate: real('rate').notNull(),
  fetchedAt: text('fetched_at').notNull(),
}, (t) => [uniqueIndex('idx_rates_date_source').on(t.date, t.source)]);

export const recurring = sqliteTable('recurring', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  amount: real('amount').notNull(),
  currency: text('currency', { enum: ['VES', 'USD'] }).notNull(),
  schedule: text('schedule', { enum: ['semanal', 'quincenal', 'mensual'] }).notNull(),
  nextDue: text('next_due').notNull(),
  notificationIds: text('notification_ids').notNull().default('[]'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
});

export const shoppingLists = sqliteTable('shopping_lists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  date: text('date').notNull(),
  createdAt: text('created_at').notNull(),
});

export const shoppingItems = sqliteTable('shopping_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  listId: integer('list_id')
    .notNull()
    .references(() => shoppingLists.id),
  name: text('name').notNull(),
  nameNorm: text('name_norm').notNull(), // nombre normalizado para comparar precios entre compras
  qty: real('qty').notNull().default(1),
  price: real('price'),
  currency: text('currency', { enum: ['VES', 'USD'] }).notNull().default('VES'),
  priceUsd: real('price_usd'),
  bought: integer('bought').notNull().default(0),
});

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body'),
  kind: text('kind', { enum: ['nota', 'meta'] }).notNull().default('nota'),
  goalAmountUsd: real('goal_amount_usd'),
  goalSavedUsd: real('goal_saved_usd').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const gamification = sqliteTable('gamification', {
  id: integer('id').primaryKey(),
  streakDays: integer('streak_days').notNull().default(0),
  lastLogDate: text('last_log_date'),
  bestStreak: integer('best_streak').notNull().default(0),
  badges: text('badges').notNull().default('[]'),
  scoreHistory: text('score_history').notNull().default('[]'),
});

export const projectBoards = sqliteTable('project_boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon').notNull().default('view-dashboard'),
  color: text('color').notNull().default('#1565C0'),
  budgetAmount: real('budget_amount'),
  budgetCurrency: text('budget_currency', { enum: ['VES', 'USD'] }),
  sortOrder: integer('sort_order').notNull().default(0),
  isArchived: integer('is_archived').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const projectColumns = sqliteTable(
  'project_columns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    boardId: integer('board_id')
      .notNull()
      .references(() => projectBoards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#90A4AE'),
    sortOrder: integer('sort_order').notNull().default(0),
    isDone: integer('is_done').notNull().default(0),
  },
  (t) => [index('idx_pcol_board').on(t.boardId)],
);

export const projectCards = sqliteTable(
  'project_cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    boardId: integer('board_id')
      .notNull()
      .references(() => projectBoards.id, { onDelete: 'cascade' }),
    columnId: integer('column_id')
      .notNull()
      .references(() => projectColumns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note'),
    estimatedAmount: real('estimated_amount'),
    estimatedCurrency: text('estimated_currency', { enum: ['VES', 'USD'] }),
    dueDate: text('due_date'),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (t) => [index('idx_pcard_board').on(t.boardId), index('idx_pcard_column').on(t.columnId)],
);

export const projectSubtasks = sqliteTable(
  'project_subtasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => projectCards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    estimatedAmount: real('estimated_amount'),
    estimatedCurrency: text('estimated_currency', { enum: ['VES', 'USD'] }),
    done: integer('done').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('idx_psub_card').on(t.cardId)],
);

export const projectAllocations = sqliteTable(
  'project_allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => projectCards.id, { onDelete: 'cascade' }),
    subtaskId: integer('subtask_id').references(() => projectSubtasks.id, { onDelete: 'set null' }),
    amount: real('amount').notNull(),
    currency: text('currency', { enum: ['VES', 'USD'] }).notNull(),
    amountUsd: real('amount_usd').notNull(),
    amountVes: real('amount_ves').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_alloc_tx').on(t.transactionId),
    index('idx_alloc_card').on(t.cardId),
    index('idx_alloc_subtask').on(t.subtaskId),
  ],
);

export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type DebtPayment = typeof debtPayments.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type Recurring = typeof recurring.$inferSelect;
export type ShoppingList = typeof shoppingLists.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type ProjectBoard = typeof projectBoards.$inferSelect;
export type ProjectColumn = typeof projectColumns.$inferSelect;
export type ProjectCard = typeof projectCards.$inferSelect;
export type ProjectSubtask = typeof projectSubtasks.$inferSelect;
export type ProjectAllocation = typeof projectAllocations.$inferSelect;
