import type { Db } from '../../db/database.js';
import { errors } from '../../lib/errors.js';
import { toMinorUnits } from '../../lib/money.js';
import { buildPaginationMeta, toOffset } from '../../lib/pagination.js';
import type { AccountService } from '../accounts/account.service.js';
import type { Ledger } from './ledger.js';
import type { TransactionRepository } from './transaction.repository.js';
import {
  toTransactionResponse,
  type CreateTransactionBody,
  type ListTransactionsQuery,
  type TransactionListResponse,
  type TransactionResponse,
} from './transaction.schemas.js';

export class TransactionService {
  constructor(
    private readonly db: Db,
    private readonly ledger: Ledger,
    private readonly transactions: TransactionRepository,
    private readonly accountService: AccountService,
  ) {}

  create(accountId: string, body: CreateTransactionBody): TransactionResponse {
    // IMMEDIATE takes the write lock up front, so the balance check and the
    // write can never interleave with another writer.
    const row = this.db
      .transaction(() =>
        this.ledger.post({
          accountId,
          type: body.type,
          amount: toMinorUnits(body.amount),
          description: body.description,
          referenceId: body.reference_id,
        }),
      )
      .immediate();

    return toTransactionResponse(row);
  }

  get(accountId: string, transactionId: string): TransactionResponse {
    this.accountService.require(accountId);
    const row = this.transactions.findById(accountId, transactionId);
    if (!row) throw errors.transactionNotFound(transactionId);
    return toTransactionResponse(row);
  }

  list(accountId: string, query: ListTransactionsQuery): TransactionListResponse {
    const { page, limit, type } = query;

    // Read count and page from one snapshot so the metadata matches the data.
    return this.db
      .transaction(() => {
        this.accountService.require(accountId);
        const totalRecords = this.transactions.count(accountId, type);
        const rows = this.transactions.list({
          accountId,
          type,
          limit,
          offset: toOffset(page, limit),
        });

        return {
          data: rows.map(toTransactionResponse),
          pagination: buildPaginationMeta(page, limit, totalRecords),
        };
      })
      .deferred();
  }
}
