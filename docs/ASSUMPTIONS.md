# Assumptions

Where the brief left room for interpretation, these are the choices I made and why.

## Accounts

1. **Supplying `balance`, `id` or `created_at` on account creation is an error (`400`), not silently ignored.** "The client should not be allowed to set the initial balance" reads most safely as an explicit rejection. Silently dropping the field could make a client believe it opened an account with funds.
2. **Names are trimmed and must be 1–100 characters.** Names need not be unique; two people can share a name.
3. **Single currency (INR).** No `currency` field. Amounts are in rupees with at most 2 decimal places (paise).
4. **No authentication or account ownership.** Out of scope for the brief. Anyone with an account id can operate on it.

## Transactions

5. **`reference_id` is required, client-supplied, case-sensitive and trimmed**, max 100 characters. It acts as the idempotency key.
6. **A duplicate `reference_id` returns `409 Conflict`** with the original transaction in `error.details.existing_transaction`. The brief asks for "an appropriate response indicating that the transaction already exists". `409` says that explicitly, and including the original lets a retrying client recover its result without another call.
7. **A duplicate is detected by `(account_id, reference_id)` alone**, even if the amount or type differ from the original. The first write wins and nothing changes.
8. **Rejected requests are not recorded.** Validation failures, insufficient balance and duplicates leave no row behind ("a failed or rejected transaction must not affect the account balance"). As a consequence, a `reference_id` from a *rejected* request can be reused once the problem is fixed.
9. **`description` is optional** (nullable, ≤ 255 chars). The brief lists it as a field but not under required validations.
10. **Amounts must be JSON numbers** (`100` or `100.5`), not strings, `> 0`, at most 2 decimal places, and at most 1,000,000,000 per transaction. Internally they are stored as integer paise to avoid floating-point errors.
11. **The account id comes from the URL** (`POST /accounts/:accountId/transactions`) rather than the body. Transactions are a sub-resource of an account. The response still includes `account_id`.
12. **Each transaction also stores `balance_after`.** It is not in the brief's field list but is standard for ledgers and makes history auditable. It is immutable like every other field.
13. **Correcting a mistake is done with a compensating transaction.** `PUT`/`PATCH`/`DELETE` return `405`, and the database also blocks edits and deletes with triggers.

## History

14. **Pagination defaults are `page=1`, `limit=20`; `limit` is capped at 100.** Values that aren't positive integers return `400 INVALID_QUERY_PARAMETERS`.
15. **A page beyond the last returns `200` with an empty `data` array** and correct totals, rather than an error. This is the conventional behaviour and is harmless for clients.
16. **"Latest first" means `created_at DESC`.** Timestamps have millisecond precision, so entries created in the same millisecond are ordered by insertion order (newest first) to keep sorting deterministic.
17. **Unknown query parameters are ignored**, so clients can add things like cache-busters without breaking.

## Error responses

18. **Malformed ids (not a UUID) return `400`; well-formed ids that don't exist return `404`.** Both cover the brief's "invalid account IDs should return an appropriate error", and the distinction tells the client whether it sent garbage or a stale reference.
19. **Insufficient balance is `422 Unprocessable Entity`.** The request is well-formed but violates a business rule.

## Transfers (bonus)

20. **A transfer's `reference_id` is unique per source account and shares that account's namespace with regular transactions.** The debit leg carries the client's `reference_id`. The credit leg on the destination uses the system-generated `transfer:<transfer_id>`, so it can never collide with the destination's own references.
21. **Transfers to the same account are rejected** (`400`); they would be a no-op that clutters the ledger.
22. **Both accounts must exist** (`404`, with the missing id in `details`), and the source must have enough funds (`422`). Any failure rolls back the transfer record and both legs.

## Concurrency and storage

23. **SQLite is a deliberate trade-off for a zero-setup submission**, not a production recommendation. Writes use `BEGIN IMMEDIATE`, which serialises writers and makes the balance check race-free; WAL mode lets reads proceed during writes. The README describes the Postgres design I would use in production (row-level locks, lock ordering for transfers).
