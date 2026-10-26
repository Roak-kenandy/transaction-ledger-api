import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponseSchema } from '../../lib/http-schemas.js';
import type { TransferService } from './transfer.service.js';
import {
  createTransferBodySchema,
  transferParamsSchema,
  transferResponseSchema,
} from './transfer.schemas.js';

export const transferRoutes: FastifyPluginAsyncZod<{ transferService: TransferService }> = async (
  app,
  { transferService },
) => {
  app.post(
    '/transfers',
    {
      schema: {
        tags: ['Transfers'],
        summary: 'Transfer money between two accounts',
        description:
          'Debits the source and credits the destination atomically. Either both legs are ' +
          'recorded or neither is.',
        body: createTransferBodySchema,
        response: {
          201: transferResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.code(201).send(transferService.create(request.body)),
  );

  app.get(
    '/transfers/:transferId',
    {
      schema: {
        tags: ['Transfers'],
        summary: 'Get a transfer with both ledger legs',
        params: transferParamsSchema,
        response: { 200: transferResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => transferService.get(request.params.transferId),
  );
};
