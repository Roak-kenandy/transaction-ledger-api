// Walks through every scenario from the assignment brief against a running server.
// Usage: npm run dev (in one terminal), then npm run demo
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const run = Date.now().toString(36);

async function call(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, json };
}

function show(title, { status, json }, pick = (j) => j) {
  console.log(`\n\x1b[1m${title}\x1b[0m  →  HTTP ${status}`);
  console.log(JSON.stringify(pick(json), null, 2));
}

const errorOnly = (j) => ({ code: j.error.code, message: j.error.message });

const alice = (await call('POST', '/accounts', { name: 'Alice' })).json;
const bob = (await call('POST', '/accounts', { name: 'Bob' })).json;
show('1. Create account (balance always starts at 0)', { status: 201, json: alice });
show(
  '   Client tries to set an opening balance',
  await call('POST', '/accounts', { name: 'Mallory', balance: 1_000_000 }),
  errorOnly,
);

const tx = (accountId, type, amount, ref) =>
  call('POST', `/accounts/${accountId}/transactions`, {
    type,
    amount,
    reference_id: `${run}-${ref}`,
    description: `${type} ${amount}`,
  });

show('2. Credit 100', await tx(alice.id, 'credit', 100, 'c1'), (j) => ({ amount: j.amount, balance_after: j.balance_after }));
show('   Credit 50', await tx(alice.id, 'credit', 50, 'c2'), (j) => ({ amount: j.amount, balance_after: j.balance_after }));
show('   Debit 30', await tx(alice.id, 'debit', 30, 'd1'), (j) => ({ amount: j.amount, balance_after: j.balance_after }));
show('   Debit 20', await tx(alice.id, 'debit', 20, 'd2'), (j) => ({ amount: j.amount, balance_after: j.balance_after }));
show('   Debit 500 (insufficient balance)', await tx(alice.id, 'debit', 500, 'd3'), errorOnly);
show('   Replay credit 100 with the same reference_id', await tx(alice.id, 'credit', 100, 'c1'), errorOnly);

show('3. Balance (expected 100)', await call('GET', `/accounts/${alice.id}/balance`));

show(
  '4. History: debits only, page 1, limit 1',
  await call('GET', `/accounts/${alice.id}/transactions?type=debit&page=1&limit=1`),
  (j) => ({ data: j.data.map((t) => `${t.type} ${t.amount} @ ${t.created_at}`), pagination: j.pagination }),
);
show('   Invalid pagination', await call('GET', `/accounts/${alice.id}/transactions?page=0`), errorOnly);

show(
  '5. Transactions are immutable',
  await call('DELETE', `/accounts/${alice.id}/transactions/00000000-0000-4000-8000-000000000000`),
  errorOnly,
);

await tx(bob.id, 'credit', 50, 'seed');
show(
  '9. Transfer 30 from Alice (100) to Bob (50)',
  await call('POST', '/transfers', {
    from_account_id: alice.id,
    to_account_id: bob.id,
    amount: 30,
    reference_id: `${run}-t1`,
  }),
  (j) => ({ alice_after: j.debit_transaction.balance_after, bob_after: j.credit_transaction.balance_after }),
);

console.log(`\nExplore the rest at ${BASE_URL}/docs`);
