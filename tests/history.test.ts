import { describe, expect, it } from 'vitest';
import { MISSING_ID, createAccount, postTransaction, useTestApp } from './helpers.js';

describe('Transaction history', () => {
  const ctx = useTestApp();

  async function seed(entries: Array<['credit' | 'debit', number]>) {
    const account = await createAccount(ctx.app);
    for (const [index, [type, amount]] of entries.entries()) {
      const response = await postTransaction(ctx.app, account.id, {
        type,
        amount,
        reference_id: `seed-${index}`,
      });
      expect(response.statusCode).toBe(201);
    }
    return account;
  }

  const list = (accountId: string, query = '') =>
    ctx.app.inject({ url: `/accounts/${accountId}/transactions${query}` });

  it('returns transactions latest first', async () => {
    const account = await seed([
      ['credit', 100],
      ['credit', 50],
      ['debit', 30],
      ['debit', 20],
    ]);

    const body = (await list(account.id)).json();

    expect(body.data.map((t: { reference_id: string }) => t.reference_id)).toEqual([
      'seed-3',
      'seed-2',
      'seed-1',
      'seed-0',
    ]);
    const timestamps = body.data.map((t: { created_at: string }) => t.created_at);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
  });

  it('returns both types when no filter is given, and filters by type', async () => {
    const account = await seed([
      ['credit', 100],
      ['debit', 10],
      ['credit', 5],
    ]);

    const all = (await list(account.id)).json();
    const credits = (await list(account.id, '?type=credit')).json();
    const debits = (await list(account.id, '?type=debit')).json();

    expect(all.pagination.total_records).toBe(3);
    expect(credits.data).toHaveLength(2);
    expect(credits.data.every((t: { type: string }) => t.type === 'credit')).toBe(true);
    expect(credits.pagination.total_records).toBe(2);
    expect(debits.data).toHaveLength(1);
    expect(debits.data[0].type).toBe('debit');
  });

  it('paginates with accurate metadata', async () => {
    const account = await seed(Array.from({ length: 7 }, () => ['credit', 1] as ['credit', number]));

    const page1 = (await list(account.id, '?page=1&limit=3')).json();
    const page3 = (await list(account.id, '?page=3&limit=3')).json();

    expect(page1.pagination).toEqual({
      page: 1,
      limit: 3,
      total_records: 7,
      total_pages: 3,
      has_next_page: true,
      has_previous_page: false,
    });
    expect(page1.data.map((t: { reference_id: string }) => t.reference_id)).toEqual([
      'seed-6',
      'seed-5',
      'seed-4',
    ]);
    expect(page3.data).toHaveLength(1);
    expect(page3.data[0].reference_id).toBe('seed-0');
    expect(page3.pagination).toMatchObject({ has_next_page: false, has_previous_page: true });
  });

  it('returns an empty page past the end instead of an error', async () => {
    const account = await seed([['credit', 1]]);

    const body = (await list(account.id, '?page=5&limit=10')).json();

    expect(body.data).toEqual([]);
    expect(body.pagination).toMatchObject({ page: 5, total_records: 1, total_pages: 1 });
  });

  it('uses sensible defaults (page 1, limit 20)', async () => {
    const account = await seed([['credit', 1]]);

    const body = (await list(account.id)).json();

    expect(body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('returns an empty history for a new account', async () => {
    const account = await createAccount(ctx.app);

    const body = (await list(account.id)).json();

    expect(body.data).toEqual([]);
    expect(body.pagination).toMatchObject({ total_records: 0, total_pages: 0 });
  });

  it.each([
    ['page=0', 'page'],
    ['page=-1', 'page'],
    ['page=1.5', 'page'],
    ['page=abc', 'page'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=ten', 'limit'],
    ['type=refund', 'type'],
  ])('rejects invalid query "%s"', async (query, field) => {
    const account = await createAccount(ctx.app);

    const response = await list(account.id, `?${query}`);

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: 'INVALID_QUERY_PARAMETERS',
      details: [expect.objectContaining({ field })],
    });
  });

  it('returns 404 for an unknown account', async () => {
    const response = await list(MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
