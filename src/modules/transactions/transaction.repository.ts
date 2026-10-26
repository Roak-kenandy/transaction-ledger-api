import type { Statement } from 'better-sqlite3';
import type { Db } from '../../db/database.js';

export const TRANSACTION_TYPES = ['credit', 'debit'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface TransactionRow {
  id: string;
  account_id: string;
  type: TransactionType;
  /** Minor units (paise). */
  amount: number;
  /** Account balance immediately after this entry, in minor units. */
  balance_after: number;
  description: string | null;
  reference_id: string;
  transfer_id: string | null;
  created_at: string;
}

export type NewTransaction = Omit<TransactionRow, 'created_at'>;

export interface ListTransactionsFilter {
  accountId: string;
  type?: TransactionType;
  limit: number;
  offset: number;
}

// rowid breaks ties between entries created within the same millisecond.
const LATEST_FIRST = 'ORDER BY created_at DESC, rowid DESC';

export class TransactionRepository {
  private readonly insertStmt: Statement<[NewTransaction], TransactionRow>;
  private readonly findByIdStmt: Statement<[string, string], TransactionRow>;
  private readonly findByReferenceStmt: Statement<[string, string], TransactionRow>;
  private readonly findByTransferStmt: Statement<[string], TransactionRow>;
  private readonly listAllStmt: Statement<[string, number, number], TransactionRow>;
  private readonly listByTypeStmt: Statement<[string, TransactionType, number, number], TransactionRow>;
  private readonly countAllStmt: Statement<[string], number>;
  private readonly countByTypeStmt: Statement<[string, TransactionType], number>;

  constructor(db: Db) {
    this.insertStmt = db.prepare(`
      INSERT INTO transactions
        (id, account_id, type, amount, balance_after, description, reference_id, transfer_id)
      VALUES
        (@id, @account_id, @type, @amount, @balance_after, @description, @reference_id, @transfer_id)
      RETURNING *
    `);
    this.findByIdStmt = db.prepare('SELECT * FROM transactions WHERE account_id = ? AND id = ?');
    this.findByReferenceStmt = db.prepare(
      'SELECT * FROM transactions WHERE account_id = ? AND reference_id = ?',
    );
    this.findByTransferStmt = db.prepare(
      'SELECT * FROM transactions WHERE transfer_id = ? ORDER BY rowid',
    );
    this.listAllStmt = db.prepare(
      `SELECT * FROM transactions WHERE account_id = ? ${LATEST_FIRST} LIMIT ? OFFSET ?`,
    );
    this.listByTypeStmt = db.prepare(
      `SELECT * FROM transactions WHERE account_id = ? AND type = ? ${LATEST_FIRST} LIMIT ? OFFSET ?`,
    );
    this.countAllStmt = db
      .prepare('SELECT COUNT(*) FROM transactions WHERE account_id = ?')
      .pluck() as Statement<[string], number>;
    this.countByTypeStmt = db
      .prepare('SELECT COUNT(*) FROM transactions WHERE account_id = ? AND type = ?')
      .pluck() as Statement<[string, TransactionType], number>;
  }

  insert(transaction: NewTransaction): TransactionRow {
    return this.insertStmt.get(transaction)!;
  }

  findById(accountId: string, transactionId: string): TransactionRow | undefined {
    return this.findByIdStmt.get(accountId, transactionId);
  }

  findByReference(accountId: string, referenceId: string): TransactionRow | undefined {
    return this.findByReferenceStmt.get(accountId, referenceId);
  }

  findByTransfer(transferId: string): TransactionRow[] {
    return this.findByTransferStmt.all(transferId);
  }

  list({ accountId, type, limit, offset }: ListTransactionsFilter): TransactionRow[] {
    return type
      ? this.listByTypeStmt.all(accountId, type, limit, offset)
      : this.listAllStmt.all(accountId, limit, offset);
  }

  count(accountId: string, type?: TransactionType): number {
    return type ? this.countByTypeStmt.get(accountId, type)! : this.countAllStmt.get(accountId)!;
  }
}
