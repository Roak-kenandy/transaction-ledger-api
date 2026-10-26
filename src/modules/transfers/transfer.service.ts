import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/database.js';
import { errors } from '../../lib/errors.js';
import { toMinorUnits } from '../../lib/money.js';
import type { AccountService } from '../accounts/account.service.js';
import type { Ledger } from '../transactions/ledger.js';
import type { TransactionRepository } from '../transactions/transaction.repository.js';
import type { TransferRepository, TransferRow } from './transfer.repository.js';
import {
  toTransferResponse,
  type CreateTransferBody,
  type TransferResponse,
} from './transfer.schemas.js';

export class TransferService {
  constructor(
    private readonly db: Db,
    private readonly ledger: Ledger,
    private readonly transfers: TransferRepository,
    private readonly transactions: TransactionRepository,
    private readonly accountService: AccountService,
  ) {}

  /**
   * Debit source and credit destination in one IMMEDIATE transaction. Any
   * failure (missing account, duplicate, insufficient funds) throws and rolls
   * back everything, so a partial transfer can never be persisted.
   */
  create(body: CreateTransferBody): TransferResponse {
    return this.db
      .transaction(() => {
        this.accountService.require(body.from_account_id);
        this.accountService.require(body.to_account_id);

        const existing = this.transfers.findByReference(body.from_account_id, body.reference_id);
        if (existing) {
          throw errors.duplicateTransfer(body.reference_id, this.toResponse(existing));
        }

        const amount = toMinorUnits(body.amount);
        const transfer = this.transfers.insert({
          id: randomUUID(),
          from_account_id: body.from_account_id,
          to_account_id: body.to_account_id,
          amount,
          reference_id: body.reference_id,
          description: body.description,
        });

        const debit = this.ledger.post({
          accountId: transfer.from_account_id,
          type: 'debit',
          amount,
          description: transfer.description,
          referenceId: transfer.reference_id,
          transferId: transfer.id,
        });
        const credit = this.ledger.post({
          accountId: transfer.to_account_id,
          type: 'credit',
          amount,
          description: transfer.description,
          referenceId: `transfer:${transfer.id}`,
          transferId: transfer.id,
        });

        return toTransferResponse(transfer, debit, credit);
      })
      .immediate();
  }

  get(transferId: string): TransferResponse {
    const transfer = this.transfers.findById(transferId);
    if (!transfer) throw errors.transferNotFound(transferId);
    return this.toResponse(transfer);
  }

  private toResponse(transfer: TransferRow): TransferResponse {
    const legs = this.transactions.findByTransfer(transfer.id);
    const debit = legs.find((leg) => leg.type === 'debit');
    const credit = legs.find((leg) => leg.type === 'credit');
    if (!debit || !credit) {
      throw new Error(`Transfer ${transfer.id} is missing a ledger leg`);
    }
    return toTransferResponse(transfer, debit, credit);
  }
}
