import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from './db/database.js';
import { AccountRepository } from './modules/accounts/account.repository.js';
import { accountRoutes } from './modules/accounts/account.routes.js';
import { AccountService } from './modules/accounts/account.service.js';
import { Ledger } from './modules/transactions/ledger.js';
import { TransactionRepository } from './modules/transactions/transaction.repository.js';
import { transactionRoutes } from './modules/transactions/transaction.routes.js';
import { TransactionService } from './modules/transactions/transaction.service.js';
import { TransferRepository } from './modules/transfers/transfer.repository.js';
import { transferRoutes } from './modules/transfers/transfer.routes.js';
import { TransferService } from './modules/transfers/transfer.service.js';
import { registerDocs } from './plugins/docs.js';
import { registerErrorHandling } from './plugins/error-handler.js';

export interface BuildAppOptions {
  db: Db;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ db, logger = false }: BuildAppOptions) {
  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandling(app);
  await registerDocs(app);

  const accountRepository = new AccountRepository(db);
  const transactionRepository = new TransactionRepository(db);
  const transferRepository = new TransferRepository(db);

  const ledger = new Ledger(accountRepository, transactionRepository);
  const accountService = new AccountService(accountRepository);
  const transactionService = new TransactionService(db, ledger, transactionRepository, accountService);
  const transferService = new TransferService(
    db,
    ledger,
    transferRepository,
    transactionRepository,
    accountService,
  );

  await app.register(accountRoutes, { accountService });
  await app.register(transactionRoutes, { transactionService });
  await app.register(transferRoutes, { transferService });

  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness and database connectivity check',
        response: { 200: z.object({ status: z.literal('ok') }).describe('Service is healthy') },
      },
    },
    async () => {
      db.prepare('SELECT 1').get();
      return { status: 'ok' as const };
    },
  );

  app.get('/', { schema: { hide: true } }, async (_request, reply) => reply.redirect('/docs'));

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
