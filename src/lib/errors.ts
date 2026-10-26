export type ErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSFER_NOT_FOUND'
  | 'DUPLICATE_TRANSACTION'
  | 'DUPLICATE_TRANSFER'
  | 'INSUFFICIENT_BALANCE'
  | 'BALANCE_LIMIT_EXCEEDED'
  | 'TRANSACTION_IMMUTABLE';

/** An expected, client-facing failure. Anything else is treated as a 500. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  accountNotFound: (accountId: string) =>
    new AppError(404, 'ACCOUNT_NOT_FOUND', `Account '${accountId}' does not exist`, {
      account_id: accountId,
    }),

  transactionNotFound: (transactionId: string) =>
    new AppError(404, 'TRANSACTION_NOT_FOUND', `Transaction '${transactionId}' does not exist`, {
      transaction_id: transactionId,
    }),

  transferNotFound: (transferId: string) =>
    new AppError(404, 'TRANSFER_NOT_FOUND', `Transfer '${transferId}' does not exist`, {
      transfer_id: transferId,
    }),

  duplicateTransaction: (referenceId: string, existing: unknown) =>
    new AppError(
      409,
      'DUPLICATE_TRANSACTION',
      `A transaction with reference_id '${referenceId}' already exists for this account`,
      { existing_transaction: existing },
    ),

  duplicateTransfer: (referenceId: string, existing: unknown) =>
    new AppError(
      409,
      'DUPLICATE_TRANSFER',
      `A transfer with reference_id '${referenceId}' already exists for the source account`,
      { existing_transfer: existing },
    ),

  insufficientBalance: (accountId: string, balance: number, requested: number) =>
    new AppError(422, 'INSUFFICIENT_BALANCE', 'Insufficient balance to complete the debit', {
      account_id: accountId,
      balance,
      requested_amount: requested,
    }),

  balanceLimitExceeded: (accountId: string) =>
    new AppError(
      422,
      'BALANCE_LIMIT_EXCEEDED',
      'This credit would push the account balance beyond the supported maximum',
      { account_id: accountId },
    ),

  transactionImmutable: () =>
    new AppError(
      405,
      'TRANSACTION_IMMUTABLE',
      'Transactions are immutable and cannot be edited or deleted. Post a compensating transaction instead.',
    ),
};
