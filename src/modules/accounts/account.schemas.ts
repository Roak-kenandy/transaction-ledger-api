import { z } from 'zod';
import { fieldError } from '../../lib/http-schemas.js';
import { toMajorUnits } from '../../lib/money.js';
import type { AccountRow } from './account.repository.js';

export const createAccountBodySchema = z
  .strictObject(
    {
      name: z
        .string({ error: fieldError('name', 'a string') })
        .trim()
        .min(1, 'name must not be empty')
        .max(100, 'name must be at most 100 characters')
        .meta({ example: 'Alice Sharma' }),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `Unexpected field(s): ${issue.keys.join(', ')}. Only 'name' can be set; balance always starts at 0`
          : undefined,
    },
  )
  .describe('Only `name` is accepted. `id`, `balance` and `created_at` are system-generated.');

export const accountResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    balance: z.number(),
    created_at: z.iso.datetime(),
  })
  .describe('Account');

export const balanceResponseSchema = z
  .object({
    account_id: z.uuid(),
    balance: z.number(),
    as_of: z.iso.datetime(),
  })
  .describe('Current balance');

export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type BalanceResponse = z.infer<typeof balanceResponseSchema>;

export const toAccountResponse = (row: AccountRow): AccountResponse => ({
  id: row.id,
  name: row.name,
  balance: toMajorUnits(row.balance),
  created_at: row.created_at,
});
