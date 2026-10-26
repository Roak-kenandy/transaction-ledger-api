import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './migrations.js';

export type Db = Database.Database;

const IN_MEMORY = ':memory:';

export function openDatabase(path: string): Db {
  if (path !== IN_MEMORY) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (path !== IN_MEMORY) {
    db.pragma('journal_mode = WAL');
  }

  runMigrations(db);
  return db;
}

function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').pluck().all() as number[],
  );
  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name);
    }).immediate();
  }
}
