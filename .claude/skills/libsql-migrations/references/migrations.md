# Migration System

## Table of Contents

- Design principles
- The meta table
- Migration definition format
- The migration runner
- Migration v1: initial schema
- Writing a new migration
- Common migration patterns
- What NOT to do
- Error handling
- Testing migrations

---

## Design Principles

Beacon's migration system is append-only, code-defined, and automatic:

- **Append-only:** Never edit a published migration. If you need to change
  something, add a new migration that alters the schema.
- **Code-defined:** Migrations live in a TypeScript array, not in SQL files
  on disk. This keeps them versioned with the code and avoids file-system
  dependencies at runtime.
- **Automatic:** Migrations run on startup (first Beacon request). The
  developer does nothing — no CLI commands, no manual steps.
- **Atomic:** Each migration runs inside a transaction. If it fails, the
  entire migration rolls back and the version number is not updated.

---

## The Meta Table

The `_beacon_meta` table tracks migration state. It's created before any
migrations run (using `IF NOT EXISTS`, so it's safe to run repeatedly):

```sql
CREATE TABLE IF NOT EXISTS _beacon_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

The migration runner reads the `schema_version` key to determine which
migrations have already been applied:

```typescript
const result = await client.execute({
  sql: "SELECT value FROM _beacon_meta WHERE key = 'schema_version'",
  args: [],
});
const currentVersion = result.rows.length > 0
  ? parseInt(result.rows[0].value as string, 10)
  : 0;
```

If the table exists but has no `schema_version` row, the database is at
version 0 (no migrations applied). If the table doesn't exist, it's
created and the version defaults to 0.

---

## Migration Definition Format

Each migration is an object with a version number, description, and an
array of SQL statements:

```typescript
// src/server/db/migrations.ts

export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    statements: [
      // ... SQL statements (see Migration v1 below)
    ],
  },
  {
    version: 2,
    description: 'Add search index on tasks description',
    statements: [
      "CREATE INDEX idx_tasks_description ON tasks(description)",
    ],
  },
];
```

Why an array of SQL strings instead of a function? Because `client.migrate()`
accepts statement arrays and handles the transaction wrapping (including
`PRAGMA foreign_keys=off/on`). This also makes migrations easier to review
— they're just SQL.

---

## The Migration Runner

```typescript
// src/server/db/migrations.ts

import type { Client } from '@libsql/client';

export async function runMigrations(client: Client): Promise<void> {
  // Ensure the meta table exists (idempotent)
  await client.execute(
    "CREATE TABLE IF NOT EXISTS _beacon_meta (key TEXT PRIMARY KEY, value TEXT)"
  );

  // Get current version
  const result = await client.execute({
    sql: "SELECT value FROM _beacon_meta WHERE key = 'schema_version'",
    args: [],
  });
  const currentVersion = result.rows.length > 0
    ? parseInt(result.rows[0].value as string, 10)
    : 0;

  // Find pending migrations
  const pending = migrations.filter(m => m.version > currentVersion);

  if (pending.length === 0) return;

  console.log(`[Beacon] Running ${pending.length} migration(s)...`);

  // Run each migration sequentially
  for (const migration of pending) {
    console.log(`[Beacon] Migration v${migration.version}: ${migration.description}`);

    try {
      // client.migrate() wraps in a transaction with foreign_keys=off
      await client.migrate([
        ...migration.statements,
        // Update the version number as part of the same transaction
        {
          sql: `INSERT OR REPLACE INTO _beacon_meta (key, value) VALUES ('schema_version', ?)`,
          args: [String(migration.version)],
        },
      ]);
    } catch (err) {
      console.error(
        `[Beacon] Migration v${migration.version} failed:`,
        err instanceof Error ? err.message : err
      );
      throw new Error(
        `Beacon migration v${migration.version} (${migration.description}) failed. ` +
        `Database is at version ${migration.version - 1}. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(`[Beacon] Migrations complete. Schema at v${pending[pending.length - 1].version}`);
}
```

Key details:

- **`client.migrate()`** is used instead of `client.batch()` because
  `migrate()` automatically wraps statements with `PRAGMA foreign_keys=off`
  before and `PRAGMA foreign_keys=on` after. This is needed for DDL
  statements that reference foreign keys (like `DROP TABLE` with referencing
  tables, or `ALTER TABLE` on referenced columns).

- **Version update inside the migration transaction.** The
  `INSERT OR REPLACE INTO _beacon_meta` happens as part of the same
  `migrate()` call. If the migration statements fail, the version number
  is not updated (the whole transaction rolls back).

- **Sequential execution.** Migrations run one at a time, in order. Each
  must succeed before the next starts. This is intentional — if migration
  v3 fails, the database stays at v2 with a clear error message.

---

## Migration v1: Initial Schema

This is the complete initial schema, written as the first migration:

```typescript
export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    statements: [
      // Tasks — the core entity
      `CREATE TABLE tasks (
        id              TEXT PRIMARY KEY,
        public_id       INTEGER UNIQUE,
        origin          TEXT NOT NULL DEFAULT 'local',
        remote_id       TEXT,
        type            TEXT NOT NULL,
        priority        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'new',
        description     TEXT NOT NULL,
        route           TEXT,
        element_selector TEXT,
        metadata        TEXT,
        ai_branch       TEXT,
        ai_pr_url       TEXT,
        ai_blocked_reason TEXT,
        user_email      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // Auto-incrementing public_id
      // SQLite doesn't have sequences, so we use a trigger
      `CREATE TRIGGER tasks_public_id
       AFTER INSERT ON tasks
       WHEN NEW.public_id IS NULL
       BEGIN
         UPDATE tasks
         SET public_id = (SELECT COALESCE(MAX(public_id), 0) + 1 FROM tasks)
         WHERE id = NEW.id;
       END`,

      // Attachments (screenshots, files)
      `CREATE TABLE attachments (
        id              TEXT PRIMARY KEY,
        task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type            TEXT NOT NULL,
        filename        TEXT NOT NULL,
        path            TEXT NOT NULL,
        mime_type       TEXT NOT NULL,
        size_bytes      INTEGER NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // Admin/grooming notes
      `CREATE TABLE admin_notes (
        id              TEXT PRIMARY KEY,
        task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        content         TEXT NOT NULL,
        author_email    TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // AI agent logs (for SSE streaming and history)
      `CREATE TABLE ai_logs (
        id              TEXT PRIMARY KEY,
        task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        level           TEXT NOT NULL,
        message         TEXT NOT NULL,
        metadata        TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // Activity audit trail
      `CREATE TABLE activity (
        id              TEXT PRIMARY KEY,
        task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        actor           TEXT NOT NULL,
        action          TEXT NOT NULL,
        old_value       TEXT,
        new_value       TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // Sessions (for deployed mode auth)
      `CREATE TABLE sessions (
        id              TEXT PRIMARY KEY,
        email           TEXT NOT NULL,
        is_admin        INTEGER NOT NULL DEFAULT 0,
        expires_at      TEXT NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // Magic links (for deployed mode auth)
      `CREATE TABLE magic_links (
        id              TEXT PRIMARY KEY,
        email           TEXT NOT NULL,
        token           TEXT UNIQUE NOT NULL,
        used            INTEGER NOT NULL DEFAULT 0,
        expires_at      TEXT NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      // Indexes for common queries
      `CREATE INDEX idx_tasks_status ON tasks(status)`,
      `CREATE INDEX idx_tasks_type ON tasks(type)`,
      `CREATE INDEX idx_tasks_priority ON tasks(priority)`,
      `CREATE INDEX idx_tasks_created ON tasks(created_at)`,
      `CREATE INDEX idx_tasks_origin ON tasks(origin, remote_id)`,
      `CREATE INDEX idx_attachments_task ON attachments(task_id)`,
      `CREATE INDEX idx_admin_notes_task ON admin_notes(task_id)`,
      `CREATE INDEX idx_ai_logs_task ON ai_logs(task_id)`,
      `CREATE INDEX idx_activity_task ON activity(task_id)`,
      `CREATE INDEX idx_sessions_email ON sessions(email)`,
      `CREATE INDEX idx_sessions_expires ON sessions(expires_at)`,
      `CREATE INDEX idx_magic_links_token ON magic_links(token)`,

      // Enable foreign keys (important — SQLite has this off by default)
      `PRAGMA foreign_keys = ON`,
    ],
  },
];
```

### Schema Notes

**Text-based timestamps.** SQLite doesn't have a native datetime type.
Beacon stores timestamps as ISO 8601 strings using `datetime('now')` as
the default. This sorts correctly as text and is human-readable.

**Text-based UUIDs.** Primary keys are UUID strings generated with
`crypto.randomUUID()`. This avoids integer overflow concerns and makes
IDs opaque (not guessable).

**public_id trigger.** The `public_id` is a human-friendly auto-incrementing
integer (#1, #2, #14) assigned by a trigger. This keeps the insertion logic
simple — handlers just leave `public_id` as NULL and the trigger fills it in.

**JSON in TEXT columns.** The `metadata` column stores a JSON blob as text.
SQLite has JSON functions (`json_extract`, `json_type`, etc.) for querying
JSON columns, but Beacon parses JSON in application code for simplicity.

**Foreign key cascades.** All child tables use `ON DELETE CASCADE` so
deleting a task automatically removes its attachments, notes, logs, and
activity records.

---

## Writing a New Migration

To add a migration:

1. Add a new entry to the `migrations` array with the next version number
2. Write the SQL statements
3. Test by deleting `.beacon/beacon.db` and restarting

```typescript
// Example: adding a tags column to tasks
{
  version: 2,
  description: 'Add tags column to tasks',
  statements: [
    `ALTER TABLE tasks ADD COLUMN tags TEXT`,
    // TEXT column, stores comma-separated tags or JSON array
    // ALTER TABLE ADD COLUMN is safe — it doesn't require table rebuild
  ],
},
```

### Migration Checklist

Before finalizing a migration:

- [ ] Does it use `ALTER TABLE ADD COLUMN` for new columns? (Preferred
      over table rebuild)
- [ ] If it modifies existing data, is the update idempotent?
- [ ] Does it add indexes for new columns that will be queried frequently?
- [ ] Have you tested it against a database at the previous version?
- [ ] Does the query layer have updated functions for the new schema?

---

## Common Migration Patterns

### Add a column

```typescript
{
  version: N,
  description: 'Add priority_score to tasks',
  statements: [
    `ALTER TABLE tasks ADD COLUMN priority_score INTEGER DEFAULT 0`,
  ],
}
```

SQLite's `ALTER TABLE ADD COLUMN` is lightweight — it modifies the schema
without rewriting the table.

### Add an index

```typescript
{
  version: N,
  description: 'Add index on tasks.updated_at for sync queries',
  statements: [
    `CREATE INDEX idx_tasks_updated ON tasks(updated_at)`,
  ],
}
```

### Rename a column (SQLite 3.25+)

```typescript
{
  version: N,
  description: 'Rename user_email to submitter_email',
  statements: [
    `ALTER TABLE tasks RENAME COLUMN user_email TO submitter_email`,
  ],
}
```

### Change a column type or constraint (table rebuild)

SQLite doesn't support `ALTER TABLE ALTER COLUMN`. To change a column's
type or constraints, you must rebuild the table. `client.migrate()` handles
`PRAGMA foreign_keys=off` automatically:

```typescript
{
  version: N,
  description: 'Make description NOT NULL with default',
  statements: [
    `CREATE TABLE tasks_new (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      -- ... all other columns
    )`,
    `INSERT INTO tasks_new SELECT * FROM tasks`,
    `DROP TABLE tasks`,
    `ALTER TABLE tasks_new RENAME TO tasks`,
    // Recreate indexes
    `CREATE INDEX idx_tasks_status ON tasks(status)`,
    // Recreate triggers
    `CREATE TRIGGER tasks_public_id ...`,
  ],
}
```

Table rebuilds are the most dangerous migration pattern. Triple-check
that the column list in `tasks_new` matches exactly, that all indexes
are recreated, and that the trigger is recreated.

### Backfill data

```typescript
{
  version: N,
  description: 'Backfill priority_score from priority text',
  statements: [
    `ALTER TABLE tasks ADD COLUMN priority_score INTEGER DEFAULT 0`,
    `UPDATE tasks SET priority_score = CASE priority
       WHEN 'critical' THEN 4
       WHEN 'high' THEN 3
       WHEN 'medium' THEN 2
       WHEN 'low' THEN 1
       ELSE 0
     END`,
  ],
}
```

### Create a new table with foreign key to tasks

```typescript
{
  version: N,
  description: 'Add task_tags join table',
  statements: [
    `CREATE TABLE task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag     TEXT NOT NULL,
      PRIMARY KEY (task_id, tag)
    )`,
    `CREATE INDEX idx_task_tags_tag ON task_tags(tag)`,
  ],
}
```

---

## What NOT to Do

**Never edit a published migration.** If migration v1 has been released
and users have databases at v1, changing v1's SQL will not affect their
databases (the runner skips already-applied versions). You'll silently
end up with databases that don't match the schema you think they have.

**Never delete a migration.** Same reason — existing databases depend on
the full migration chain to reach the current version.

**Never reuse a version number.** Each version must be unique and
sequential. If you skip numbers (v1, v3), the runner still works, but
the gap makes the history confusing.

**Never put application logic in migrations.** Migrations should be pure
DDL (schema changes) or simple DML (data backfills). Don't call APIs,
read config, or spawn processes from inside a migration.

**Never use `executeMultiple()` for migrations.** It doesn't wrap
statements in a transaction — if the third statement fails, the first
two are already committed. Use `client.migrate()` instead.

**Never rely on `IF NOT EXISTS` as a substitute for versioning.** While
`CREATE TABLE IF NOT EXISTS` is safe to repeat, it doesn't handle column
additions, type changes, or data migrations. The version number is the
source of truth.

---

## Error Handling

### Migration failure on startup

If a migration fails, the runner throws with a clear message:

```
Beacon migration v3 (Add tags support) failed.
Database is at version 2.
Error: SQLITE_ERROR: duplicate column name: tags
```

The handle hook catches this in its error boundary and shows an error page
to the developer. The database remains at the last successful version —
no partial changes.

### Database locked

SQLite allows only one writer at a time. If the migration runner tries to
write while another process has a write lock, it will retry (libsql-client
handles this internally with the busy timeout). For Beacon's use case
(single developer, single dev server), this is unlikely.

### Corrupt database

If `.beacon/beacon.db` becomes corrupted (power loss during write, manual
editing), the easiest fix is to delete it and restart. Beacon will recreate
the database and run all migrations from scratch. The developer loses
existing task data, but for a development tool this is acceptable.

---

## Testing Migrations

### In-memory database

Use `file::memory:` for testing migrations without touching disk:

```typescript
import { createClient } from '@libsql/client';
import { runMigrations } from './migrations.js';

async function testMigrations() {
  const client = createClient({ url: 'file::memory:' });
  await runMigrations(client);

  // Verify schema
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log('Tables:', result.rows.map(r => r.name));

  // Verify version
  const version = await client.execute(
    "SELECT value FROM _beacon_meta WHERE key = 'schema_version'"
  );
  console.log('Version:', version.rows[0].value);

  client.close();
}
```

### Testing a specific migration

To test that migration v3 works against a v2 database, run migrations
up to v2, then run v3 separately:

```typescript
const client = createClient({ url: 'file::memory:' });

// Apply v1 and v2
const upToV2 = migrations.filter(m => m.version <= 2);
for (const m of upToV2) {
  await client.migrate([
    ...m.statements,
    { sql: `INSERT OR REPLACE INTO _beacon_meta (key, value) VALUES ('schema_version', ?)`,
      args: [String(m.version)] },
  ]);
}

// Now test v3
const v3 = migrations.find(m => m.version === 3)!;
await client.migrate([
  ...v3.statements,
  { sql: `INSERT OR REPLACE INTO _beacon_meta (key, value) VALUES ('schema_version', '3')`,
    args: [] },
]);

// Verify the changes v3 made
// ...
```
