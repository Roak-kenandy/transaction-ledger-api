import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errors } from '../../lib/errors.js';
import { accountIdParamsSchema, errorResponseSchema } from '../../lib/http-schemas.js';
import type { TransactionService } from './transaction.service.js';
import {
  createTransactionBodySchema,
  listTransactionsQuerySchema,
  transactionListResponseSchema,
  transactionParamsSchema,
  transactionResponseSchema,
} from './transaction.schemas.js';

export const transactionRoutes: FastifyPluginAsyncZod<{
  transactionService: TransactionService;
}> = async (app, { transactionService }) => {
  app.post(
    '/accounts/:accountId/transactions',
    {
      schema: {
        tags: ['Transactions'],
        summary: 'Add a credit or debit transaction',
        description:
          'Atomically appends a ledger entry and updates the balance. `reference_id` makes the call ' +
          'idempotent per account: replaying it returns 409 and changes nothing.',
        params: accountIdParamsSchema,
        body: createTransactionBodySchema,
        response: {
          201: transactionResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.code(201).send(transactionService.create(request.params.accountId, request.body)),
  );

  app.get(
    '/accounts/:accountId/transactions',
    {
      schema: {
        tags: ['Transactions'],
        summary: 'List transaction history',
        description: 'Latest first (by `created_at`). Supports `type` filter and `page`/`limit` pagination.',
        params: accountIdParamsSchema,
        querystring: listTransactionsQuerySchema,
        response: {
          200: transactionListResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => transactionService.list(request.params.accountId, request.query),
  );

  app.get(
    '/accounts/:accountId/transactions/:transactionId',
    {
      schema: {
        tags: ['Transactions'],
        summary: 'Get a single transaction',
        params: transactionParamsSchema,
        response: { 200: transactionResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) =>
      transactionService.get(request.params.accountId, request.params.transactionId),
  );

  app.route({
    method: ['PUT', 'PATCH', 'DELETE'],
    url: '/accounts/:accountId/transactions/:transactionId',
    schema: {
      tags: ['Transactions'],
      summary: 'Not allowed: transactions are immutable',
      response: { 405: errorResponseSchema },
    },
    handler: async (_request, reply) => {
      reply.header('allow', 'GET');
      throw errors.transactionImmutable();
    },
  });
};
