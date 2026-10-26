import { describe, expect, it } from 'vitest';
import {
  MISSING_ID,
  createAccount,
  credit,
  getBalance,
  nextReference,
  postTransaction,
  useTestApp,
} from './helpers.js';

describe('Transactions', () => {
  const ctx = useTestApp();

  describe('credit', () => {
    it('increases the balance by the amount (100 + 50 = 150)', async () => {
      const account = await createAccount(ctx.app);
      await credit(ctx.app, account.id, 100);

      const response = await postTransaction(ctx.app, account.id, {
        type: 'credit',
        amount: 50,
        description: 'Top up',
        reference_id: 'top-up-1',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        id: expect.any(String),
        account_id: account.id,
        type: 'credit',
        amount: 50,
        balance_after: 150,
        description: 'Top up',
        reference_id: 'top-up-1',
        transfer_id: null,
        created_at: expect.any(String),
      });
      expect(await getBalance(ctx.app, account.id)).toBe(150);
    });

    it('handles decimal amounts without floating point drift', async () => {
      const account = await createAccount(ctx.app);
      for (let i = 0; i < 10; i++) await credit(ctx.app, account.id, 0.1);
      await credit(ctx.app, account.id, 0.2);

      expect(await getBalance(ctx.app, account.id)).toBe(1.2);
    });
  });

  describe('debit', () => {
    it('decreases the balance by the amount (100 - 30 = 70)', async () => {
      const account = await createAccount(ctx.app);
      await credit(ctx.app, account.id, 100);

      const response = await postTransaction(ctx.app, account.id, {
        type: 'debit',
        amount: 30,
        reference_id: nextReference(),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ type: 'debit', amount: 30, balance_after: 70 });
      expect(await getBalance(ctx.app, account.id)).toBe(70);
    });

    it('allows debiting the exact balance down to zero', async () => {
      const account = await createAccount(ctx.app);
      await credit(ctx.app, account.id, 100);

      const response = await postTransaction(ctx.app, account.id, {
        type: 'debit',
        amount: 100,
        reference_id: nextReference(),
      });

      expect(response.statusCode).toBe(201);
      expect(await getBalance(ctx.app, account.id)).toBe(0);
    });

    it('rejects a debit larger than the balance and leaves the balance unchanged', async () => {
      const account = await createAccount(ctx.app);
      await credit(ctx.app, account.id, 100);

      const response = await postTransaction(ctx.app, account.id, {
        type: 'debit',
        amount: 150,
        reference_id: 'too-much',
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: 'INSUFFICIENT_BALANCE',
        details: { account_id: account.id, balance: 100, requested_amount: 150 },
      });
      expect(await getBalance(ctx.app, account.id)).toBe(100);

      // A rejected transaction is not recorded, so its reference_id stays usable.
      const history = await ctx.app.inject({ url: `/accounts/${account.id}/transactions` });
      expect(history.json().pagination.total_records).toBe(1);
      const retry = await postTransaction(ctx.app, account.id, {
        type: 'debit',
        amount: 50,
        reference_id: 'too-much',
      });
      expect(retry.statusCode).toBe(201);
    });
  });

  describe('duplicate reference_id', () => {
    it('does not create a second transaction or change the balance', async () => {
      const account = await createAccount(ctx.app);
      const payload = { type: 'credit', amount: 100, reference_id: 'order-42' };

      const first = await postTransaction(ctx.app, account.id, payload);
      const replay = await postTransaction(ctx.app, account.id, payload);

      expect(first.statusCode).toBe(201);
      expect(replay.statusCode).toBe(409);
      expect(replay.json().error).toMatchObject({
        code: 'DUPLICATE_TRANSACTION',
        details: { existing_transaction: first.json() },
      });
      expect(await getBalance(ctx.app, account.id)).toBe(100);

      const history = await ctx.app.inject({ url: `/accounts/${account.id}/transactions` });
      expect(history.json().pagination.total_records).toBe(1);
    });

    it('is detected even if the replayed payload differs', async () => {
      const account = await createAccount(ctx.app);
      await postTransaction(ctx.app, account.id, { type: 'credit', amount: 100, reference_id: 'r' });

      const replay = await postTransaction(ctx.app, account.id, {
        type: 'debit',
        amount: 10,
        reference_id: 'r',
      });

      expect(replay.statusCode).toBe(409);
      expect(await getBalance(ctx.app, account.id)).toBe(100);
    });

    it('allows the same reference_id on different accounts', async () => {
      const alice = await createAccount(ctx.app, 'Alice');
      const bob = await createAccount(ctx.app, 'Bob');
      const payload = { type: 'credit', amount: 10, reference_id: 'shared-ref' };

      expect((await postTransaction(ctx.app, alice.id, payload)).statusCode).toBe(201);
      expect((await postTransaction(ctx.app, bob.id, payload)).statusCode).toBe(201);
    });
  });

  describe('validation', () => {
    it.each([
      ['type is missing', { amount: 10, reference_id: 'r' }, 'type'],
      ['type is invalid', { type: 'refund', amount: 10, reference_id: 'r' }, 'type'],
      ['amount is missing', { type: 'credit', reference_id: 'r' }, 'amount'],
      ['amount is zero', { type: 'credit', amount: 0, reference_id: 'r' }, 'amount'],
      ['amount is negative', { type: 'credit', amount: -5, reference_id: 'r' }, 'amount'],
      ['amount is a string', { type: 'credit', amount: '10', reference_id: 'r' }, 'amount'],
      ['amount has 3 decimals', { type: 'credit', amount: 1.005, reference_id: 'r' }, 'amount'],
      ['amount is too large', { type: 'credit', amount: 1e12, reference_id: 'r' }, 'amount'],
      ['reference_id is missing', { type: 'credit', amount: 10 }, 'reference_id'],
      ['reference_id is blank', { type: 'credit', amount: 10, reference_id: '  ' }, 'reference_id'],
      ['description is not a string', { type: 'credit', amount: 10, reference_id: 'r', description: 5 }, 'description'],
    ])('returns 400 when %s', async (_case, payload, field) => {
      const account = await createAccount(ctx.app);

      const response = await postTransaction(ctx.app, account.id, payload);

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatchObject({
        code: 'INVALID_REQUEST_BODY',
        details: expect.arrayContaining([expect.objectContaining({ field })]),
      });
      expect(await getBalance(ctx.app, account.id)).toBe(0);
    });

    it('rejects server-controlled fields in the body', async () => {
      const account = await createAccount(ctx.app);

      const response = await postTransaction(ctx.app, account.id, {
        type: 'credit',
        amount: 10,
        reference_id: 'r',
        balance_after: 1_000_000,
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when the account does not exist', async () => {
      const response = await postTransaction(ctx.app, MISSING_ID, {
        type: 'credit',
        amount: 10,
        reference_id: 'r',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('ACCOUNT_NOT_FOUND');
    });
  });

  describe('immutability', () => {
    it.each(['PUT', 'PATCH', 'DELETE'] as const)('%s on a transaction returns 405', async (method) => {
      const account = await createAccount(ctx.app);
      const transaction = await credit(ctx.app, account.id, 100);

      const response = await ctx.app.inject({
        method,
        url: `/accounts/${account.id}/transactions/${transaction.id}`,
        payload: { amount: 1 },
      });

      expect(response.statusCode).toBe(405);
      expect(response.headers.allow).toBe('GET');
      expect(response.json().error.code).toBe('TRANSACTION_IMMUTABLE');

      const unchanged = await ctx.app.inject({
        url: `/accounts/${account.id}/transactions/${transaction.id}`,
      });
      expect(unchanged.json()).toEqual(transaction);
    });
  });

  describe('GET /accounts/:id/transactions/:transactionId', () => {
    it('returns 404 for a transaction belonging to another account', async () => {
      const alice = await createAccount(ctx.app, 'Alice');
      const bob = await createAccount(ctx.app, 'Bob');
      const transaction = await credit(ctx.app, alice.id, 10);

      const response = await ctx.app.inject({
        url: `/accounts/${bob.id}/transactions/${transaction.id}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });
});
