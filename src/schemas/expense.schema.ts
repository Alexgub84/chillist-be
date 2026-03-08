export const expenseSchema = {
  $id: 'Expense',
  type: 'object',
  properties: {
    expenseId: { type: 'string', format: 'uuid' },
    participantId: {
      type: 'string',
      format: 'uuid',
      description: 'The participant who made this expense',
    },
    planId: { type: 'string', format: 'uuid' },
    amount: {
      type: 'string',
      description:
        'Expense amount as a decimal string (e.g. "29.99"). Stored as numeric(10,2) in the database.',
    },
    description: {
      type: 'string',
      nullable: true,
      description: 'Optional description of what the expense was for',
    },
    itemIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      description:
        'List of item IDs associated with this expense. Empty array if no items linked.',
    },
    createdByUserId: { type: 'string', format: 'uuid', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'expenseId',
    'participantId',
    'planId',
    'amount',
    'itemIds',
    'createdAt',
    'updatedAt',
  ],
} as const

export const expenseListSchema = {
  $id: 'ExpenseList',
  type: 'array',
  items: { $ref: 'Expense#' },
} as const

export const expenseSummarySchema = {
  $id: 'ExpenseSummary',
  type: 'object',
  properties: {
    participantId: { type: 'string', format: 'uuid' },
    totalAmount: {
      type: 'number',
      description: 'Sum of all expenses for this participant',
    },
  },
  required: ['participantId', 'totalAmount'],
} as const

export const expenseSummaryListSchema = {
  $id: 'ExpenseSummaryList',
  type: 'array',
  items: { $ref: 'ExpenseSummary#' },
} as const

export const expensesResponseSchema = {
  $id: 'ExpensesResponse',
  type: 'object',
  description:
    'All expenses for a plan plus per-participant totals. Currency is defined on the plan itself.',
  properties: {
    expenses: { $ref: 'ExpenseList#' },
    summary: { $ref: 'ExpenseSummaryList#' },
  },
  required: ['expenses', 'summary'],
} as const

export const createExpenseBodySchema = {
  $id: 'CreateExpenseBody',
  type: 'object',
  properties: {
    participantId: {
      type: 'string',
      format: 'uuid',
      description: 'The participant this expense belongs to',
    },
    amount: {
      type: 'number',
      exclusiveMinimum: 0,
      description: 'Expense amount (must be greater than 0)',
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Optional description of what the expense was for',
    },
    itemIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      description:
        'Optional list of item IDs this expense is for. All items must belong to the same plan.',
    },
  },
  required: ['participantId', 'amount'],
} as const

export const updateExpenseBodySchema = {
  $id: 'UpdateExpenseBody',
  type: 'object',
  properties: {
    amount: {
      type: 'number',
      exclusiveMinimum: 0,
      description: 'Updated expense amount (must be greater than 0)',
    },
    description: {
      type: 'string',
      maxLength: 500,
      nullable: true,
      description: 'Updated description (send null to clear)',
    },
    itemIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      description:
        'Updated list of item IDs. Replaces the existing list entirely. All items must belong to the same plan.',
    },
  },
} as const

export const expenseIdParamSchema = {
  $id: 'ExpenseIdParam',
  type: 'object',
  properties: {
    expenseId: { type: 'string', format: 'uuid' },
  },
  required: ['expenseId'],
} as const

export const deleteExpenseResponseSchema = {
  $id: 'DeleteExpenseResponse',
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
  },
  required: ['ok'],
} as const
