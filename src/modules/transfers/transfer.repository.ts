import type { Statement } from 'better-sqlite3';
import type { Db } from '../../db/database.js';

export interface TransferRow {
  id: string;
  from_account_id: string;
  to_account_id: string;
  /** Minor units (paise). */
  amount: number;
  reference_id: string;
  description: string | null;
  created_at: string;
}

export type NewTransfer = Omit<TransferRow, 'created_at'>;

export class TransferRepository {
  private readonly insertStmt: Statement<[NewTransfer], TransferRow>;
  private readonly findByIdStmt: Statement<[string], TransferRow>;
  private readonly findByReferenceStmt: Statement<[string, string], TransferRow>;

  constructor(db: Db) {
    this.insertStmt = db.prepare(`
      INSERT INTO transfers (id, from_account_id, to_account_id, amount, reference_id, description)
      VALUES (@id, @from_account_id, @to_account_id, @amount, @reference_id, @description)
      RETURNING *
    `);
    this.findByIdStmt = db.prepare('SELECT * FROM transfers WHERE id = ?');
    this.findByReferenceStmt = db.prepare(
      'SELECT * FROM transfers WHERE from_account_id = ? AND reference_id = ?',
    );
  }

  insert(transfer: NewTransfer): TransferRow {
    return this.insertStmt.get(transfer)!;
  }

  findById(id: string): TransferRow | undefined {
    return this.findByIdStmt.get(id);
  }

  findByReference(fromAccountId: string, referenceId: string): TransferRow | undefined {
    return this.findByReferenceStmt.get(fromAccountId, referenceId);
  }
}
