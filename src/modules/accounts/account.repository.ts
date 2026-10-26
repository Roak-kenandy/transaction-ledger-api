import type { Statement } from 'better-sqlite3';
import type { Db } from '../../db/database.js';

export interface AccountRow {
  id: string;
  name: string;
  /** Minor units (paise). */
  balance: number;
  created_at: string;
}

export class AccountRepository {
  private readonly insertStmt: Statement<[string, string], AccountRow>;
  private readonly findByIdStmt: Statement<[string], AccountRow>;
  private readonly applyDeltaStmt: Statement<[number, string], { balance: number }>;

  constructor(db: Db) {
    this.insertStmt = db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?) RETURNING *');
    this.findByIdStmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    this.applyDeltaStmt = db.prepare(
      'UPDATE accounts SET balance = balance + ? WHERE id = ? RETURNING balance',
    );
  }

  insert(id: string, name: string): AccountRow {
    return this.insertStmt.get(id, name)!;
  }

  findById(id: string): AccountRow | undefined {
    return this.findByIdStmt.get(id);
  }

  /** Returns the new balance. The `balance >= 0` CHECK constraint is the last line of defence. */
  applyBalanceDelta(id: string, delta: number): number {
    return this.applyDeltaStmt.get(delta, id)!.balance;
  }
}
