import { z } from 'zod';
import { descriptionSchema, referenceIdSchema, uuidSchema } from '../../lib/http-schemas.js';
import { amountSchema, toMajorUnits } from '../../lib/money.js';
import type { TransactionRow } from '../transactions/transaction.repository.js';
import {
  toTransactionResponse,
  transactionResponseSchema,
} from '../transactions/transaction.schemas.js';
import type { TransferRow } from './transfer.repository.js';

export const createTransferBodySchema = z
  .strictObject({
    from_account_id: uuidSchema('from_account_id'),
    to_account_id: uuidSchema('to_account_id'),
    amount: amountSchema,
    description: descriptionSchema,
    reference_id: referenceIdSchema.meta({
      description: 'Idempotency key, unique per source account (shared with its transactions)',
      example: 'rent-split-2026-10',
    }),
  })
  .refine((body) => body.from_account_id !== body.to_account_id, {
    message: 'from_account_id and to_account_id must be different accounts',
    path: ['to_account_id'],
  });

export const transferParamsSchema = z.object({
  transferId: uuidSchema('transferId'),
});

export const transferResponseSchema = z.object({
  id: z.uuid(),
  from_account_id: z.uuid(),
  to_account_id: z.uuid(),
  amount: z.number(),
  description: z.string().nullable(),
  reference_id: z.string(),
  created_at: z.iso.datetime(),
  debit_transaction: transactionResponseSchema.describe('Ledger entry on the source account'),
  credit_transaction: transactionResponseSchema.describe('Ledger entry on the destination account'),
}).describe('Transfer with both ledger legs');

export type CreateTransferBody = z.infer<typeof createTransferBodySchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;

export function toTransferResponse(
  transfer: TransferRow,
  debit: TransactionRow,
  credit: TransactionRow,
): TransferResponse {
  return {
    id: transfer.id,
    from_account_id: transfer.from_account_id,
    to_account_id: transfer.to_account_id,
    amount: toMajorUnits(transfer.amount),
    description: transfer.description,
    reference_id: transfer.reference_id,
    created_at: transfer.created_at,
    debit_transaction: toTransactionResponse(debit),
    credit_transaction: toTransactionResponse(credit),
  };
}
