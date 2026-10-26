import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import scalar from '@scalar/fastify-api-reference';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const TITLE = 'Transaction Ledger API';

/** OpenAPI spec is generated from the same Zod schemas that validate requests, so it cannot drift. */
export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: TITLE,
        version: '1.0.0',
        description: [
          'Accounts, idempotent credit/debit transactions, paginated history and atomic transfers.',
          '',
          '**Try it:** create an account, copy its `id`, then post transactions and read the balance and history.',
          '',
          'All amounts are in major currency units (₹) with at most 2 decimal places. Every error uses the same envelope: `{ error: { code, message, details }, request_id }`.',
        ].join('\n'),
      },
      tags: [
        { name: 'Accounts', description: 'Create accounts and read balances' },
        { name: 'Transactions', description: 'Post credits/debits and read history' },
        { name: 'Transfers', description: 'Move money atomically between accounts' },
        { name: 'System', description: 'Operational endpoints' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(scalar, {
    routePrefix: '/docs',
    logLevel: 'warn',
    configuration: {
      title: TITLE,
      theme: 'default',
      layout: 'modern',
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      hideClientButton: false,
    },
  });

  // Classic Swagger UI, kept for reviewers who prefer it.
  await app.register(swaggerUi, { routePrefix: '/swagger', logLevel: 'warn' });
}
