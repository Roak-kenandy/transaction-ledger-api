import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { accountIdParamsSchema, errorResponseSchema } from '../../lib/http-schemas.js';
import type { AccountService } from './account.service.js';
import {
  accountResponseSchema,
  balanceResponseSchema,
  createAccountBodySchema,
} from './account.schemas.js';

export const accountRoutes: FastifyPluginAsyncZod<{ accountService: AccountService }> = async (
  app,
  { accountService },
) => {
  app.post(
    '/accounts',
    {
      schema: {
        tags: ['Accounts'],
        summary: 'Create an account',
        description: 'Creates an account with a zero balance. The client cannot set the balance.',
        body: createAccountBodySchema,
        response: { 201: accountResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => reply.code(201).send(accountService.create(request.body.name)),
  );

  app.get(
    '/accounts/:accountId',
    {
      schema: {
        tags: ['Accounts'],
        summary: 'Get an account',
        params: accountIdParamsSchema,
        response: { 200: accountResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => accountService.get(request.params.accountId),
  );

  app.get(
    '/accounts/:accountId/balance',
    {
      schema: {
        tags: ['Accounts'],
        summary: 'Get the current balance of an account',
        params: accountIdParamsSchema,
        response: { 200: balanceResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => accountService.getBalance(request.params.accountId),
  );
};
