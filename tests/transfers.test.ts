import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { AccountRepository } from '../src/modules/accounts/account.repository.js';
import { AccountService } from '../src/modules/accounts/account.service.js';
import { Ledger, type LedgerEntry } from '../src/modules/transactions/ledger.js';
import { TransactionRepository } from '../src/modules/transactions/transaction.repository.js';
import { TransferRepository } from '../src/modules/transfers/transfer.repository.js';
import { TransferService } from '../src/modules/transfers/transfer.service.js';
import { MISSING_ID, createAccount, credit, getBalance, useTestApp } from './helpers.js';

describe('Transfers', () => {
  const ctx = useTestApp();

  async function fundedPair(aBalance = 100, bBalance = 50) {
    const a = await createAccount(ctx.app, 'A');
    const b = await createAccount(ctx.app, 'B');
    if (aBalance) await credit(ctx.app, a.id, aBalance);
    if (bBalance) await credit(ctx.app, b.id, bBalance);
    return { a, b };
  }

  const transfer = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: '/transfers', payload });

  it('moves money between accounts (A 100 → 70, B 50 → 80)', async () => {
    const { a, b } = await fundedPair();

    const response = await transfer({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 30,
      reference_id: 'rent',
      description: 'Rent split',
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 30,
      reference_id: 'rent',
      debit_transaction: { account_id: a.id, type: 'debit', amount: 30, balance_after: 70, transfer_id: body.id },
      credit_transaction: { account_id: b.id, type: 'credit', amount: 30, balance_after: 80, transfer_id: body.id },
    });
    expect(await getBalance(ctx.app, a.id)).toBe(70);
    expect(await getBalance(ctx.app, b.id)).toBe(80);

    const fetched = await ctx.app.inject({ url: `/transfers/${body.id}` });
    expect(fetched.json()).toEqual(body);
  });

  it('shows up in both accounts\u2019 history', async () => {
    const { a, b } = await fundedPair();
    await transfer({ from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: 't1' });

    const aDebits = (await ctx.app.inject({ url: `/accounts/${a.id}/transactions?type=debit` })).json();
    const bCredits = (await ctx.app.inject({ url: `/accounts/${b.id}/transactions?type=credit` })).json();

    expect(aDebits.data[0]).toMatchObject({ amount: 30, transfer_id: expect.any(String) });
    expect(bCredits.data[0]).toMatchObject({ amount: 30, transfer_id: aDebits.data[0].transfer_id });
  });

  it('rejects with insufficient balance and changes nothing', async () => {
    const { a, b } = await fundedPair(20, 0);

    const response = await transfer({
      from_account_id: a.id,
      to_account_id: b.id,
      amount: 30,
      reference_id: 't1',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await getBalance(ctx.app, a.id)).toBe(20);
    expect(await getBalance(ctx.app, b.id)).toBe(0);
    expect(ctx.db.prepare('SELECT COUNT(*) FROM transfers').pluck().get()).toBe(0);
  });

  it.each([
    ['source', 'from_account_id'],
    ['destination', 'to_account_id'],
  ])('returns 404 when the %s account does not exist', async (_label, field) => {
    const { a } = await fundedPair();
    const payload = {
      from_account_id: a.id,
      to_account_id: a.id,
      amount: 10,
      reference_id: 't1',
      [field]: MISSING_ID,
    };

    const response = await transfer(payload);

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
      details: { account_id: MISSING_ID },
    });
    expect(await getBalance(ctx.app, a.id)).toBe(100);
  });

  it('rejects a transfer to the same account', async () => {
    const { a } = await fundedPair();

    const response = await transfer({
      from_account_id: a.id,
      to_account_id: a.id,
      amount: 10,
      reference_id: 't1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details[0].field).toBe('to_account_id');
  });

  it('is idempotent on reference_id per source account', async () => {
    const { a, b } = await fundedPair();
    const payload = { from_account_id: a.id, to_account_id: b.id, amount: 30, reference_id: 't1' };

    const first = await transfer(payload);
    const replay = await transfer(payload);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error).toMatchObject({
      code: 'DUPLICATE_TRANSFER',
      details: { existing_transfer: first.json() },
    });
    expect(await getBalance(ctx.app, a.id)).toBe(70);
    expect(await getBalance(ctx.app, b.id)).toBe(80);
  });

  it('returns 404 for an unknown transfer id', async () => {
    const response = await ctx.app.inject({ url: `/transfers/${MISSING_ID}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('TRANSFER_NOT_FOUND');
  });
});

describe('Transfer atomicity', () => {
  it('rolls back the debit if the credit leg fails', () => {
    const db = openDatabase(':memory:');
    const accounts = new AccountRepository(db);
    const transactions = new TransactionRepository(db);

    class CreditLegFails extends Ledger {
      override post(entry: LedgerEntry) {
        if (entry.type === 'credit' && entry.transferId) throw new Error('simulated crash');
        return super.post(entry);
      }
    }
    const ledger = new CreditLegFails(accounts, transactions);
    const service = new TransferService(
      db,
      ledger,
      new TransferRepository(db),
      transactions,
      new AccountService(accounts),
    );

    const a = accounts.insert(crypto.randomUUID(), 'A');
    const b = accounts.insert(crypto.randomUUID(), 'B');
    ledger.post({ accountId: a.id, type: 'credit', amount: 10_000, description: null, referenceId: 'seed' });

    expect(() =>
      service.create({
        from_account_id: a.id,
        to_account_id: b.id,
        amount: 30,
        description: null,
        reference_id: 't1',
      }),
    ).toThrow('simulated crash');

    expect(accounts.findById(a.id)!.balance).toBe(10_000);
    expect(accounts.findById(b.id)!.balance).toBe(0);
    expect(transactions.count(a.id)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) FROM transfers').pluck().get()).toBe(0);
    db.close();
  });
});
