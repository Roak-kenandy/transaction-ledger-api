import { afterEach, beforeEach } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { openDatabase, type Db } from '../src/db/database.js';

export interface TestContext {
  app: App;
  db: Db;
}

/** Fresh in-memory database and app per test, so tests never share state. */
export function useTestApp(): TestContext {
  const context = {} as TestContext;

  beforeEach(async () => {
    context.db = openDatabase(':memory:');
    context.app = await buildApp({ db: context.db });
  });

  afterEach(async () => {
    await context.app.close();
    context.db.close();
  });

  return context;
}

export async function createAccount(app: App, name = 'Test Account') {
  const response = await app.inject({ method: 'POST', url: '/accounts', payload: { name } });
  return response.json<{ id: string; name: string; balance: number; created_at: string }>();
}

export interface TransactionInput {
  type?: unknown;
  amount?: unknown;
  reference_id?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

export function postTransaction(app: App, accountId: string, payload: TransactionInput) {
  return app.inject({
    method: 'POST',
    url: `/accounts/${accountId}/transactions`,
    payload,
  });
}

let referenceCounter = 0;
export const nextReference = () => `ref-${++referenceCounter}`;

export async function credit(app: App, accountId: string, amount: number) {
  const response = await postTransaction(app, accountId, {
    type: 'credit',
    amount,
    reference_id: nextReference(),
  });
  if (response.statusCode !== 201) throw new Error(`credit failed: ${response.body}`);
  return response.json();
}

export async function getBalance(app: App, accountId: string): Promise<number> {
  const response = await app.inject({ method: 'GET', url: `/accounts/${accountId}/balance` });
  return response.json<{ balance: number }>().balance;
}

export const MISSING_ID = '00000000-0000-4000-8000-000000000000';
