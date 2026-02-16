---
name: libsql-migrations
description: >
  Database patterns for svelte-beacon using @libsql/client and SQLite. Use this
  skill whenever creating or modifying database tables, writing or editing
  migrations, authoring query functions, initializing the database client,
  switching between local file and Turso connections, or working on the typed
  query layer. Also use when debugging database errors, adding indexes, changing
  column types, or working on the export/import serialization for
  production-to-local sync. If you are touching any file in src/server/db/ or
  adding a new table or column, this skill must be read first.
---

# libSQL Migrations & Database Patterns

This skill covers everything database-related in svelte-beacon: the
`@libsql/client` driver, client initialization, the migration system,
schema design, and the typed query layer.

## The Driver: @libsql/client

Beacon uses `@libsql/client` because it works with both local SQLite files
and remote Turso databases using the same API. No native binaries — it's
pure JavaScript/TypeScript, which means zero install friction on any
platform.

### Core API

The client exposes these methods (the ones Beacon uses):

```typescript
import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:.beacon/beacon.db' });

// Single statement
const result = await client.execute({
  sql: 'SELECT * FROM tasks WHERE status = ?',
  args: ['backlog'],
});
// result.rows → array of row objects
// result.columns → array of column names
// result.rowsAffected → number of rows changed

// Batch (implicit transaction — all succeed or all roll back)
const results = await client.batch([
  'CREATE TABLE test (id INTEGER PRIMARY KEY)',
  { sql: 'INSERT INTO test VALUES (?)', args: [1] },
], 'write');

// Migrate (like batch, but with foreign_keys=off around it)
// Perfect for DDL migrations that need to modify tables with FK constraints
await client.migrate([
  'CREATE TABLE new_tasks (...)',
  'INSERT INTO new_tasks SELECT ... FROM tasks',
  'DROP TABLE tasks',
  'ALTER TABLE new_tasks RENAME TO tasks',
]);

// Multi-statement script (no implicit transaction, no result sets)
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS _beacon_meta (key TEXT PRIMARY KEY, value TEXT);
`);

// Interactive transaction (for read-then-write patterns)
const tx = await client.transaction('write');
try {
  const row = await tx.execute({ sql: 'SELECT ...', args: [] });
  await tx.execute({ sql: 'UPDATE ...', args: [] });
  await tx.commit();
} finally {
  tx.close();
}
```

### Key Differences from better-sqlite3

If you're used to `better-sqlite3`, some things work differently:

- Everything is **async** — all calls return Promises
- No `.prepare()` / `.run()` / `.get()` / `.all()` — use `execute()` instead
- Results come as `{ rows, columns, rowsAffected }`, not arrays directly
- Rows are plain objects with column-name keys, not positional arrays
- Named params use `:name`, `@name`, or `$name` prefixes
- `batch()` provides implicit transactions — no manual BEGIN/COMMIT needed

## Client Initialization

Read `references/client-init.md` for the initialization pattern including
connection string handling, local vs Turso modes, the lazy init pattern
used by the handle hook, and database-doesn't-exist handling.

## Migration System

Read `references/migrations.md` for the complete migration system: the
meta table, the runner, how to write new migrations, what to avoid, and
the full initial schema (migration v1).

## Query Layer

Read `references/queries.md` for the typed query function patterns: how
to structure query modules, parameter handling, result mapping, pagination,
and the export/import serialization format.

## Quick Reference

| I need to... | Read... |
|---|---|
| Add a new column or table | `references/migrations.md` — Writing a new migration |
| Write a new query function | `references/queries.md` — Query function patterns |
| Change how the DB connects | `references/client-init.md` — Connection strings |
| Understand the schema | `references/migrations.md` — Migration v1 (initial) |
| Debug a migration failure | `references/migrations.md` — Error handling |
| Add an index | `references/migrations.md` — Common migration patterns |
| Work on export/import | `references/queries.md` — Export serialization |
