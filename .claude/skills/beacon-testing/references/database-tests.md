# Database Tests

## Table of Contents

- In-memory database per test
- Testing migrations
- Testing query functions
- Testing edge cases
- Performance considerations

---

## In-Memory Database Per Test

Every database test creates its own in-memory `@libsql/client` instance.
This guarantees complete isolation — no test can affect another, and
tests can run in parallel.

```typescript
// Common pattern for all database tests

import { createClient, type Client } from '@libsql/client';
import { runMigrations } from '../db/migrations.js';
import { beforeEach, afterEach } from 'vitest';

let db: Client;

beforeEach(async () => {
  db = createClient({ url: 'file::memory:' });
  await runMigrations(db);
});

afterEach(() => {
  db.close();
});
```

### Why Not a Shared Database?

A shared database means tests depend on execution order and can't run in
parallel. An in-memory database per test adds ~5-10ms overhead (creating
the client + running migrations) which is negligible for the isolation
it provides.

### Helper: createTestDB

Centralize the setup to avoid repeating it everywhere:

```typescript
// test/helpers.ts

import { createClient, type Client } from '@libsql/client';
import { runMigrations } from '../src/server/db/migrations.js';

export async function createTestDB(): Promise<Client> {
  const db = createClient({ url: 'file::memory:' });
  await runMigrations(db);
  return db;
}
```

---

## Testing Migrations

### All Migrations Run Successfully on Empty Database

```typescript
// src/server/db/migrations.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations, migrations } from './migrations.js';

describe('migrations', () => {
  it('runs all migrations on a fresh database', async () => {
    const db = createClient({ url: 'file::memory:' });
    await runMigrations(db);

    // Verify schema version matches latest migration
    const result = await db.execute(
      "SELECT value FROM _beacon_meta WHERE key = 'schema_version'"
    );
    const version = parseInt(result.rows[0].value as string, 10);
    const latestVersion = migrations[migrations.length - 1].version;

    expect(version).toBe(latestVersion);
    db.close();
  });

  it('creates all expected tables', async () => {
    const db = createClient({ url: 'file::memory:' });
    await runMigrations(db);

    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tables = result.rows.map(r => r.name as string);

    expect(tables).toContain('tasks');
    expect(tables).toContain('attachments');
    expect(tables).toContain('admin_notes');
    expect(tables).toContain('ai_logs');
    expect(tables).toContain('activity');
    expect(tables).toContain('sessions');
    expect(tables).toContain('magic_links');
    expect(tables).toContain('_beacon_meta');

    db.close();
  });

  it('is idempotent — running twice has no effect', async () => {
    const db = createClient({ url: 'file::memory:' });
    await runMigrations(db);
    await runMigrations(db); // Second run should be a no-op

    const result = await db.execute(
      "SELECT value FROM _beacon_meta WHERE key = 'schema_version'"
    );
    expect(result.rows).toHaveLength(1);

    db.close();
  });
});
```

### Individual Migration Testing

Test a specific migration by applying all prior migrations first, then
running the one under test:

```typescript
describe('migration v2', () => {
  it('adds the tags column to tasks', async () => {
    const db = createClient({ url: 'file::memory:' });

    // Apply only v1
    const v1 = migrations.find(m => m.version === 1)!;
    await db.execute(
      "CREATE TABLE IF NOT EXISTS _beacon_meta (key TEXT PRIMARY KEY, value TEXT)"
    );
    await db.migrate([
      ...v1.statements,
      {
        sql: `INSERT OR REPLACE INTO _beacon_meta (key, value) VALUES ('schema_version', '1')`,
        args: [],
      },
    ]);

    // Now run the full runner — it should only apply v2+
    await runMigrations(db);

    // Verify the new column exists
    const result = await db.execute(
      "SELECT sql FROM sqlite_master WHERE name = 'tasks'"
    );
    const createSQL = result.rows[0].sql as string;
    expect(createSQL).toContain('tags');

    db.close();
  });
});
```

### Migration Failure Handling

```typescript
it('leaves database at previous version on failure', async () => {
  const db = createClient({ url: 'file::memory:' });

  // Apply v1 manually
  // ... (setup code)

  // Create a deliberately broken migration v2
  // (This tests the error handling, not a real migration)
  // Verify that schema_version stays at 1
});
```

---

## Testing Query Functions

Query functions are the workhorse of the test suite. They validate the
typed interface between the application and the database.

### CRUD Tests

```typescript
// src/server/db/queries/tasks.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDB } from '../../../../test/helpers.js';
import { createTask, getTask, updateTask, deleteTask, listTasks } from './tasks.js';
import type { Client } from '@libsql/client';

describe('task queries', () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDB();
  });

  afterEach(() => {
    db.close();
  });

  describe('createTask', () => {
    it('creates a task with an auto-assigned public_id', async () => {
      const task = await createTask(db, {
        type: 'bug',
        priority: 'high',
        description: 'Button is broken',
      });

      expect(task.id).toBeDefined();
      expect(task.public_id).toBe(1);
      expect(task.type).toBe('bug');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('new');
      expect(task.created_at).toBeDefined();
    });

    it('assigns sequential public_ids', async () => {
      const task1 = await createTask(db, {
        type: 'bug', priority: 'low', description: 'Task 1',
      });
      const task2 = await createTask(db, {
        type: 'feature', priority: 'medium', description: 'Task 2',
      });

      expect(task1.public_id).toBe(1);
      expect(task2.public_id).toBe(2);
    });

    it('stores metadata as JSON', async () => {
      const task = await createTask(db, {
        type: 'bug',
        priority: 'medium',
        description: 'Test',
        metadata: JSON.stringify({ browser: 'Safari', viewport: { w: 1024 } }),
      });

      expect(task.metadata).toEqual({ browser: 'Safari', viewport: { w: 1024 } });
    });
  });

  describe('getTask', () => {
    it('returns null for nonexistent id', async () => {
      const result = await getTask(db, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns the task with parsed metadata', async () => {
      const created = await createTask(db, {
        type: 'bug', priority: 'high', description: 'Test',
        metadata: JSON.stringify({ key: 'value' }),
      });

      const fetched = await getTask(db, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.metadata).toEqual({ key: 'value' });
    });
  });

  describe('updateTask', () => {
    it('updates only specified fields', async () => {
      const task = await createTask(db, {
        type: 'bug', priority: 'low', description: 'Original',
      });

      const updated = await updateTask(db, task.id, { priority: 'critical' });

      expect(updated!.priority).toBe('critical');
      expect(updated!.description).toBe('Original'); // Unchanged
      expect(updated!.type).toBe('bug'); // Unchanged
    });

    it('updates the updated_at timestamp', async () => {
      const task = await createTask(db, {
        type: 'bug', priority: 'low', description: 'Test',
      });

      // Small delay to ensure timestamp difference
      await new Promise(r => setTimeout(r, 50));

      const updated = await updateTask(db, task.id, { priority: 'high' });

      expect(updated!.updated_at).not.toBe(task.updated_at);
    });
  });

  describe('deleteTask', () => {
    it('returns true when task exists', async () => {
      const task = await createTask(db, {
        type: 'bug', priority: 'low', description: 'Delete me',
      });

      const result = await deleteTask(db, task.id);
      expect(result).toBe(true);
    });

    it('returns false for nonexistent task', async () => {
      const result = await deleteTask(db, 'nonexistent');
      expect(result).toBe(false);
    });

    it('cascades to attachments and notes', async () => {
      const task = await createTask(db, {
        type: 'bug', priority: 'low', description: 'With attachments',
      });

      // Insert a related attachment directly
      await db.execute({
        sql: `INSERT INTO attachments (id, task_id, type, filename, path, mime_type, size_bytes)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ['att-1', task.id, 'screenshot', 'test.png', 'screenshots/test.png', 'image/png', 1024],
      });

      await deleteTask(db, task.id);

      const attachments = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM attachments WHERE task_id = ?',
        args: [task.id],
      });
      expect(attachments.rows[0].count).toBe(0);
    });
  });

  describe('listTasks', () => {
    it('filters by multiple criteria', async () => {
      await createTask(db, { type: 'bug', priority: 'high', description: 'High bug' });
      await createTask(db, { type: 'bug', priority: 'low', description: 'Low bug' });
      await createTask(db, { type: 'feature', priority: 'high', description: 'Feature' });

      const result = await listTasks(db, { type: 'bug', priority: 'high' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].description).toBe('High bug');
    });

    it('searches by description text', async () => {
      await createTask(db, { type: 'bug', priority: 'low', description: 'Login button broken' });
      await createTask(db, { type: 'bug', priority: 'low', description: 'Header misaligned' });

      const result = await listTasks(db, { search: 'button' });
      expect(result.items).toHaveLength(1);
    });

    it('respects sort and order', async () => {
      await createTask(db, { type: 'bug', priority: 'low', description: 'First' });
      await new Promise(r => setTimeout(r, 50));
      await createTask(db, { type: 'bug', priority: 'low', description: 'Second' });

      const asc = await listTasks(db, { sort: 'created_at', order: 'asc' });
      expect(asc.items[0].description).toBe('First');

      const desc = await listTasks(db, { sort: 'created_at', order: 'desc' });
      expect(desc.items[0].description).toBe('Second');
    });
  });
});
```

---

## Testing Edge Cases

### Concurrent Operations

SQLite allows only one writer at a time. Verify that the application
handles this gracefully:

```typescript
it('handles concurrent inserts without data loss', async () => {
  const promises = Array.from({ length: 10 }, (_, i) =>
    createTask(db, {
      type: 'bug', priority: 'low', description: `Concurrent ${i}`,
    })
  );

  const tasks = await Promise.all(promises);
  const result = await listTasks(db);

  expect(result.pagination.total).toBe(10);
  // Verify all public_ids are unique
  const ids = new Set(tasks.map(t => t.public_id));
  expect(ids.size).toBe(10);
});
```

### SQL Injection Prevention

```typescript
it('safely handles malicious input', async () => {
  const task = await createTask(db, {
    type: 'bug',
    priority: 'low',
    description: "'; DROP TABLE tasks; --",
  });

  // Table should still exist
  const result = await listTasks(db);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].description).toBe("'; DROP TABLE tasks; --");
});
```

### Unicode and Special Characters

```typescript
it('handles unicode in descriptions', async () => {
  const task = await createTask(db, {
    type: 'bug',
    priority: 'low',
    description: '🐛 Emoji bug with 中文 and العربية',
  });

  const fetched = await getTask(db, task.id);
  expect(fetched!.description).toBe('🐛 Emoji bug with 中文 and العربية');
});
```

---

## Performance Considerations

### Keep Tests Fast

- In-memory databases are fast but still have overhead. Avoid creating
  hundreds of rows unless testing pagination edge cases.
- Run migrations once per test, not per assertion.
- Use `afterEach(() => db.close())` to release resources immediately.

### Avoid Timing-Dependent Tests

Timestamp comparisons can be flaky. Instead of checking exact timestamps,
verify ordering or that a value changed:

```typescript
// Fragile:
expect(updated.updated_at).toBe('2025-01-15T12:00:00');

// Robust:
expect(updated.updated_at).not.toBe(original.updated_at);
```
