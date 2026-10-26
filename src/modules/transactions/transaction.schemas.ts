import { z } from 'zod';
import {
  descriptionSchema,
  fieldError,
  referenceIdSchema,
  uuidSchema,
} from '../../lib/http-schemas.js';
import { amountSchema, toMajorUnits } from '../../lib/money.js';
import { paginationMetaSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { TRANSACTION_TYPES, type TransactionRow } from './transaction.repository.js';

const transactionTypeSchema = z.enum(TRANSACTION_TYPES, {
  error: fieldError('type', "either 'credit' or 'debit'"),
});

export const createTransactionBodySchema = z.strictObject({
  type: transactionTypeSchema.meta({ example: 'credit' }),
  amount: amountSchema,
  description: descriptionSchema,
  reference_id: referenceIdSchema,
});

export const transactionParamsSchema = z.object({
  accountId: uuidSchema('accountId'),
  transactionId: uuidSchema('transactionId'),
});

export const listTransactionsQuerySchema = paginationQuerySchema.extend({
  type: transactionTypeSchema.optional().describe('Filter by type. Omit to return both.'),
});

export const transactionResponseSchema = z
  .object({
    id: z.uuid(),
    account_id: z.uuid(),
    type: z.enum(TRANSACTION_TYPES),
    amount: z.number(),
    balance_after: z.number().describe('Account balance immediately after this entry'),
    description: z.string().nullable(),
    reference_id: z.string(),
    transfer_id: z.uuid().nullable().describe('Set when the entry is one leg of a transfer'),
    created_at: z.iso.datetime(),
  })
  .describe('Transaction');

export const transactionListResponseSchema = z
  .object({
    data: z.array(transactionResponseSchema),
    pagination: paginationMetaSchema,
  })
  .describe('Transactions, latest first, with pagination metadata');

export type CreateTransactionBody = z.infer<typeof createTransactionBodySchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;

export const toTransactionResponse = (row: TransactionRow): TransactionResponse => ({
  id: row.id,
  account_id: row.account_id,
  type: row.type,
  amount: toMajorUnits(row.amount),
  balance_after: toMajorUnits(row.balance_after),
  description: row.description,
  reference_id: row.reference_id,
  transfer_id: row.transfer_id,
  created_at: row.created_at,
});
