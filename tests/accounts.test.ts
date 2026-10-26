import { describe, expect, it } from 'vitest';
import { MISSING_ID, createAccount, credit, useTestApp } from './helpers.js';

describe('Accounts', () => {
  const ctx = useTestApp();

  it('creates an account with a zero balance and system-generated fields', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/accounts',
      payload: { name: '  Alice  ' },
    });

    expect(response.statusCode).toBe(201);
    const account = response.json();
    expect(account).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'Alice',
      balance: 0,
      created_at: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(account.created_at))).toBe(false);
  });

  it('generates a unique id for every account', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) ids.add((await createAccount(ctx.app)).id);
    expect(ids.size).toBe(25);
  });

  it.each([
    ['balance', { name: 'Mallory', balance: 1_000_000 }],
    ['id', { name: 'Mallory', id: MISSING_ID }],
    ['created_at', { name: 'Mallory', created_at: '2020-01-01T00:00:00Z' }],
  ])('rejects a client-supplied %s', async (_field, payload) => {
    const response = await ctx.app.inject({ method: 'POST', url: '/accounts', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST_BODY');
  });

  it.each([
    ['missing', {}],
    ['empty', { name: '' }],
    ['whitespace only', { name: '   ' }],
    ['not a string', { name: 42 }],
  ])('rejects a %s name', async (_case, payload) => {
    const response = await ctx.app.inject({ method: 'POST', url: '/accounts', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: 'INVALID_REQUEST_BODY',
      details: [expect.objectContaining({ field: 'name' })],
    });
  });

  it('rejects malformed JSON with a consistent error envelope', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST_BODY' },
      request_id: expect.any(String),
    });
  });

  describe('GET /accounts/:id/balance', () => {
    it('returns the current balance', async () => {
      const account = await createAccount(ctx.app);
      await credit(ctx.app, account.id, 250.75);

      const response = await ctx.app.inject({ method: 'GET', url: `/accounts/${account.id}/balance` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ account_id: account.id, balance: 250.75 });
    });

    it('returns 404 for an account that does not exist', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: `/accounts/${MISSING_ID}/balance` });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('returns 400 for a malformed account id', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: '/accounts/not-a-uuid/balance' });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PATH_PARAMETERS');
    });
  });

  it('returns the full account by id', async () => {
    const account = await createAccount(ctx.app, 'Bob');
    const response = await ctx.app.inject({ method: 'GET', url: `/accounts/${account.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(account);
  });
});
