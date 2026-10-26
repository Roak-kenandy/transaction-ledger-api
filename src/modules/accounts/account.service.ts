import { randomUUID } from 'node:crypto';
import { errors } from '../../lib/errors.js';
import { toMajorUnits } from '../../lib/money.js';
import type { AccountRepository, AccountRow } from './account.repository.js';
import {
  toAccountResponse,
  type AccountResponse,
  type BalanceResponse,
} from './account.schemas.js';

export class AccountService {
  constructor(private readonly accounts: AccountRepository) {}

  create(name: string): AccountResponse {
    return toAccountResponse(this.accounts.insert(randomUUID(), name));
  }

  get(accountId: string): AccountResponse {
    return toAccountResponse(this.require(accountId));
  }

  getBalance(accountId: string): BalanceResponse {
    const account = this.require(accountId);
    return {
      account_id: account.id,
      balance: toMajorUnits(account.balance),
      as_of: new Date().toISOString(),
    };
  }

  require(accountId: string): AccountRow {
    const account = this.accounts.findById(accountId);
    if (!account) throw errors.accountNotFound(accountId);
    return account;
  }
}
