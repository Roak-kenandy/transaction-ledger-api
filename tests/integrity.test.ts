import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { AccountRepository } from '../src/modules/accounts/account.repository.js';
import { AccountService } from '../src/modules/accounts/account.service.js';
import { Ledger } from '../src/modules/transactions/ledger.js';
import { TransactionRepository } from '../src/modules/transactions/transaction.repository.js';
import { TransactionService } from '../src/modules/transactions/transaction.service.js';
import { createAccount, credit, getBalance, postTransaction, useTestApp } from './helpers.js';

describe('Data integrity', () => {
  const ctx = useTestApp();

  it('keeps the balance equal to the sum of valid transactions (brief example)', async () => {
    const account = await createAccount(ctx.app);
    const steps: Array<['credit' | 'debit', number]> = [
      ['credit', 100],
      ['credit', 50],
      ['debit', 30],
      ['debit', 20],
    ];
    for (const [i, [type, amount]] of steps.entries()) {
      await postTransaction(ctx.app, account.id, { type, amount, reference_id: `step-${i}` });
    }
    // Rejected: must not affect the balance.
    await postTransaction(ctx.app, account.id, { type: 'debit', amount: 500, reference_id: 'big' });

    expect(await getBalance(ctx.app, account.id)).toBe(100);
  });

  it('serialises concurrent debits so the balance can never go negative', async () => {
    const account = await createAccount(ctx.app);
    await credit(ctx.app, account.id, 100);

    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        postTransaction(ctx.app, account.id, { type: 'debit', amount: 10, reference_id: `c-${i}` }),
      ),
    );

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 201)).toHaveLength(10);
    expect(statuses.filter((s) => s === 422)).toHaveLength(15);
    expect(await getBalance(ctx.app, account.id)).toBe(0);
  });

  it('accepts exactly one of many concurrent requests sharing a reference_id', async () => {
    const account = await createAccount(ctx.app);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        postTransaction(ctx.app, account.id, { type: 'credit', amount: 10, reference_id: 'same' }),
      ),
    );

    expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.statusCode === 409)).toHaveLength(9);
    expect(await getBalance(ctx.app, account.id)).toBe(10);
  });

  it('holds the ledger invariant across a long random sequence of operations', async () => {
    const account = await createAccount(ctx.app);
    let seed = 42;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

    for (let i = 0; i < 300; i++) {
      await postTransaction(ctx.app, account.id, {
        type: random() < 0.55 ? 'credit' : 'debit',
        amount: Math.round(random() * 50_000) / 100 + 0.01,
        reference_id: `rand-${Math.floor(random() * 250)}`, // forces some duplicates
      });
    }

    const ledger = ctx.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE type WHEN 'credit' THEN amount ELSE -amount END), 0) AS net,
           (SELECT balance_after FROM transactions WHERE account_id = @id
              ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_balance_after,
           MIN(balance_after) AS min_balance_after
         FROM transactions WHERE account_id = @id`,
      )
      .get({ id: account.id }) as { net: number; last_balance_after: number; min_balance_after: number };
    const { balance } = ctx.db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id) as {
      balance: number;
    };

    expect(balance).toBe(ledger.net);
    expect(balance).toBe(ledger.last_balance_after);
    expect(ledger.min_balance_after).toBeGreaterThanOrEqual(0);
  });

  describe('database-level guarantees', () => {
    it('refuses to update or delete a transaction even with direct SQL', async () => {
      const account = await createAccount(ctx.app);
      const transaction = await credit(ctx.app, account.id, 100);

      expect(() =>
        ctx.db.prepare('UPDATE transactions SET amount = 1 WHERE id = ?').run(transaction.id),
      ).toThrow(/immutable/);
      expect(() =>
        ctx.db.prepare('DELETE FROM transactions WHERE id = ?').run(transaction.id),
      ).toThrow(/cannot be deleted/);
    });

    it('refuses a negative balance via a CHECK constraint', async () => {
      const account = await createAccount(ctx.app);

      expect(() =>
        ctx.db.prepare('UPDATE accounts SET balance = -1 WHERE id = ?').run(account.id),
      ).toThrow(/CHECK constraint failed/);
    });

    it('refuses a duplicate (account_id, reference_id) via a UNIQUE constraint', async () => {
      const account = await createAccount(ctx.app);
      const transaction = await credit(ctx.app, account.id, 100);

      expect(() =>
        ctx.db
          .prepare(
            `INSERT INTO transactions (id, account_id, type, amount, balance_after, reference_id)
             VALUES ('dup', ?, 'credit', 1, 101, ?)`,
          )
          .run(account.id, transaction.reference_id),
      ).toThrow(/UNIQUE constraint failed/);
    });
  });
});

describe('Atomicity', () => {
  it('rolls back the balance update if writing the ledger entry fails', () => {
    const db = openDatabase(':memory:');
    const accounts = new AccountRepository(db);
    const transactions = new TransactionRepository(db);

    class FailingTransactionRepository extends TransactionRepository {
      override insert(): never {
        throw new Error('simulated write failure');
      }
    }
    const ledger = new Ledger(accounts, new FailingTransactionRepository(db));
    const service = new TransactionService(db, ledger, transactions, new AccountService(accounts));
    const account = accounts.insert(crypto.randomUUID(), 'Alice');

    expect(() =>
      service.create(account.id, { type: 'credit', amount: 100, description: null, reference_id: 'r' }),
    ).toThrow('simulated write failure');

    expect(accounts.findById(account.id)!.balance).toBe(0);
    expect(transactions.count(account.id)).toBe(0);
    db.close();
  });
});
