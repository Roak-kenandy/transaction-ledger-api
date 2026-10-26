import { randomUUID } from 'node:crypto';
import { errors } from '../../lib/errors.js';
import { toMajorUnits } from '../../lib/money.js';
import type { AccountRepository } from '../accounts/account.repository.js';
import type {
  TransactionRepository,
  TransactionRow,
  TransactionType,
} from './transaction.repository.js';
import { toTransactionResponse } from './transaction.schemas.js';

export interface LedgerEntry {
  accountId: string;
  type: TransactionType;
  /** Minor units (paise). Always positive; `type` decides the direction. */
  amount: number;
  description: string | null;
  referenceId: string;
  transferId?: string | null;
}

/**
 * The single place where money moves. Every balance change goes through
 * `post`, which writes the ledger entry and the new balance together.
 *
 * `post` does not open a database transaction itself: callers wrap it in one
 * so that multi-leg operations (transfers) commit or roll back as a unit.
 */
export class Ledger {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  post(entry: LedgerEntry): TransactionRow {
    const account = this.accounts.findById(entry.accountId);
    if (!account) throw errors.accountNotFound(entry.accountId);

    const existing = this.transactions.findByReference(entry.accountId, entry.referenceId);
    if (existing) {
      throw errors.duplicateTransaction(entry.referenceId, toTransactionResponse(existing));
    }

    const delta = entry.type === 'credit' ? entry.amount : -entry.amount;
    const projectedBalance = account.balance + delta;
    if (projectedBalance < 0) {
      throw errors.insufficientBalance(
        account.id,
        toMajorUnits(account.balance),
        toMajorUnits(entry.amount),
      );
    }
    if (!Number.isSafeInteger(projectedBalance)) {
      throw errors.balanceLimitExceeded(account.id);
    }

    const balanceAfter = this.accounts.applyBalanceDelta(account.id, delta);

    return this.transactions.insert({
      id: randomUUID(),
      account_id: account.id,
      type: entry.type,
      amount: entry.amount,
      balance_after: balanceAfter,
      description: entry.description,
      reference_id: entry.referenceId,
      transfer_id: entry.transferId ?? null,
    });
  }
}
