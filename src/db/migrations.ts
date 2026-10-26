export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const NOW_ISO = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/**
 * Append-only list of schema migrations. Never edit a migration that has
 * shipped; add a new one instead.
 *
 * Money columns hold integer minor units (paise) to avoid floating point drift.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_ledger_schema',
    sql: `
      CREATE TABLE accounts (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
        balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
        created_at  TEXT    NOT NULL DEFAULT ${NOW_ISO}
      );

      CREATE TABLE transfers (
        id               TEXT    PRIMARY KEY,
        from_account_id  TEXT    NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
        to_account_id    TEXT    NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
        amount           INTEGER NOT NULL CHECK (amount > 0),
        reference_id     TEXT    NOT NULL CHECK (length(trim(reference_id)) > 0),
        description      TEXT,
        created_at       TEXT    NOT NULL DEFAULT ${NOW_ISO},
        CHECK (from_account_id <> to_account_id),
        UNIQUE (from_account_id, reference_id)
      );

      CREATE TABLE transactions (
        id             TEXT    PRIMARY KEY,
        account_id     TEXT    NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
        type           TEXT    NOT NULL CHECK (type IN ('credit', 'debit')),
        amount         INTEGER NOT NULL CHECK (amount > 0),
        balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),
        description    TEXT,
        reference_id   TEXT    NOT NULL CHECK (length(trim(reference_id)) > 0),
        transfer_id    TEXT    REFERENCES transfers (id) ON DELETE RESTRICT,
        created_at     TEXT    NOT NULL DEFAULT ${NOW_ISO},
        UNIQUE (account_id, reference_id)
      );

      CREATE INDEX idx_transactions_account_created
        ON transactions (account_id, created_at DESC);
      CREATE INDEX idx_transactions_account_type_created
        ON transactions (account_id, type, created_at DESC);

      -- Ledger entries are append-only: the database itself refuses edits and deletes.
      CREATE TRIGGER transactions_are_immutable
        BEFORE UPDATE ON transactions
        BEGIN SELECT RAISE(ABORT, 'transactions are immutable'); END;
      CREATE TRIGGER transactions_cannot_be_deleted
        BEFORE DELETE ON transactions
        BEGIN SELECT RAISE(ABORT, 'transactions cannot be deleted'); END;
      CREATE TRIGGER transfers_are_immutable
        BEFORE UPDATE ON transfers
        BEGIN SELECT RAISE(ABORT, 'transfers are immutable'); END;
      CREATE TRIGGER transfers_cannot_be_deleted
        BEFORE DELETE ON transfers
        BEGIN SELECT RAISE(ABORT, 'transfers cannot be deleted'); END;
    `,
  },
];
