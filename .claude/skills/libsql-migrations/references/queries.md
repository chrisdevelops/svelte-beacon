# Query Layer

## Table of Contents

- Query module structure
- The execute helper
- CRUD patterns by table
- Pagination
- Filtering and sorting
- Result mapping
- Export/import serialization

---

## Query Module Structure

All database queries are centralized in a typed query layer. Handlers
never write raw SQL — they call query functions that return typed results:

```typescript
// src/server/db/queries.ts — re-exports all query modules

export { createTask, getTask, listTasks, updateTask, deleteTask } from './queries/tasks.js';
export { createAttachment, getAttachment, getAttachments } from './queries/attachments.js';
export { createNote, getNotes } from './queries/notes.js';
export { createAILog, getAILogs } from './queries/ai-logs.js';
export { createActivity, getTaskActivity } from './queries/activity.js';
export { createSession, getSession, deleteSession } from './queries/sessions.js';
export { createMagicLink, consumeMagicLink } from './queries/magic-links.js';
```

Each query function receives the `Client` as its first argument. This keeps
the query layer decoupled from the singleton client — useful for testing
with different database instances:

```typescript
import type { Client } from '@libsql/client';

export async function getTask(client: Client, id: string): Promise<Task | null> {
  const result = await client.execute({
    sql: 'SELECT * FROM tasks WHERE id = ?',
    args: [id],
  });
  return result.rows.length > 0 ? mapTask(result.rows[0]) : null;
}
```

---

## The Execute Helper

A thin wrapper that provides better error messages and consistent typing:

```typescript
// src/server/db/helpers.ts

import type { Client, InStatement, ResultSet, Row } from '@libsql/client';

export async function query(
  client: Client,
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<Row[]> {
  const result = await client.execute({ sql, args });
  return result.rows as Row[];
}

export async function queryOne(
  client: Client,
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<Row | null> {
  const rows = await query(client, sql, args);
  return rows[0] ?? null;
}

export async function execute(
  client: Client,
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<{ rowsAffected: number }> {
  const result = await client.execute({ sql, args });
  return { rowsAffected: result.rowsAffected };
}
```

Usage:

```typescript
const row = await queryOne(client, 'SELECT * FROM tasks WHERE id = ?', [id]);
const rows = await query(client, 'SELECT * FROM tasks WHERE status = ?', ['backlog']);
await execute(client, 'DELETE FROM tasks WHERE id = ?', [id]);
```

---

## CRUD Patterns by Table

### Tasks

```typescript
// src/server/db/queries/tasks.ts

import type { Client, Row } from '@libsql/client';
import crypto from 'crypto';

// --- Types ---

export interface Task {
  id: string;
  public_id: number;
  origin: string;
  remote_id: string | null;
  type: string;
  priority: string;
  status: string;
  description: string;
  route: string | null;
  element_selector: string | null;
  metadata: Record<string, unknown> | null;
  ai_branch: string | null;
  ai_pr_url: string | null;
  ai_blocked_reason: string | null;
  user_email: string | null;
  created_at: string;
  updated_at: string;
}

// --- Mapping ---

function mapTask(row: Row): Task {
  return {
    id: row.id as string,
    public_id: row.public_id as number,
    origin: row.origin as string,
    remote_id: row.remote_id as string | null,
    type: row.type as string,
    priority: row.priority as string,
    status: row.status as string,
    description: row.description as string,
    route: row.route as string | null,
    element_selector: row.element_selector as string | null,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    ai_branch: row.ai_branch as string | null,
    ai_pr_url: row.ai_pr_url as string | null,
    ai_blocked_reason: row.ai_blocked_reason as string | null,
    user_email: row.user_email as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// --- Queries ---

export async function createTask(
  client: Client,
  data: {
    type: string;
    priority: string;
    description: string;
    route?: string | null;
    element_selector?: string | null;
    metadata?: string | null;   // Pre-serialized JSON string
    user_email?: string | null;
    origin?: string;
    remote_id?: string | null;
  }
): Promise<Task> {
  const id = crypto.randomUUID();
  await client.execute({
    sql: `INSERT INTO tasks (id, type, priority, description, route, element_selector,
          metadata, user_email, origin, remote_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.type,
      data.priority,
      data.description,
      data.route ?? null,
      data.element_selector ?? null,
      data.metadata ?? null,
      data.user_email ?? null,
      data.origin ?? 'local',
      data.remote_id ?? null,
    ],
  });

  // Fetch the created task (trigger will have set public_id)
  const task = await getTask(client, id);
  if (!task) throw new Error('Task creation failed');
  return task;
}

export async function getTask(client: Client, id: string): Promise<Task | null> {
  const result = await client.execute({
    sql: 'SELECT * FROM tasks WHERE id = ?',
    args: [id],
  });
  return result.rows.length > 0 ? mapTask(result.rows[0]) : null;
}

export async function updateTask(
  client: Client,
  id: string,
  data: Partial<Pick<Task, 'status' | 'priority' | 'type' | 'description' |
    'ai_branch' | 'ai_pr_url' | 'ai_blocked_reason'>>
): Promise<Task | null> {
  // Build SET clause dynamically from provided fields
  const sets: string[] = [];
  const args: (string | null)[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      args.push(value ?? null);
    }
  }

  if (sets.length === 0) return getTask(client, id);

  sets.push("updated_at = datetime('now')");
  args.push(id);

  await client.execute({
    sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`,
    args,
  });

  return getTask(client, id);
}

export async function deleteTask(client: Client, id: string): Promise<boolean> {
  const result = await client.execute({
    sql: 'DELETE FROM tasks WHERE id = ?',
    args: [id],
  });
  return result.rowsAffected > 0;
}
```

### Listing with Pagination, Filtering, and Sorting

```typescript
export interface ListTasksParams {
  status?: string | null;
  type?: string | null;
  priority?: string | null;
  search?: string | null;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TaskListItem extends Omit<Task, 'metadata' | 'element_selector'> {
  attachment_count: number;
}

export interface PaginatedTasks {
  items: TaskListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listTasks(
  client: Client,
  params: ListTasksParams = {}
): Promise<PaginatedTasks> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const offset = (page - 1) * limit;

  // Allowed sort columns (whitelist to prevent SQL injection)
  const ALLOWED_SORTS = ['created_at', 'updated_at', 'priority', 'public_id'];
  const sort = ALLOWED_SORTS.includes(params.sort ?? '') ? params.sort! : 'created_at';
  const order = params.order === 'asc' ? 'ASC' : 'DESC';

  // Build WHERE clause
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.status) {
    conditions.push('t.status = ?');
    args.push(params.status);
  }
  if (params.type) {
    conditions.push('t.type = ?');
    args.push(params.type);
  }
  if (params.priority) {
    conditions.push('t.priority = ?');
    args.push(params.priority);
  }
  if (params.search) {
    conditions.push('t.description LIKE ?');
    args.push(`%${params.search}%`);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  // Count total
  const countResult = await client.execute({
    sql: `SELECT COUNT(*) as count FROM tasks t ${whereClause}`,
    args,
  });
  const total = countResult.rows[0].count as number;

  // Fetch page
  const result = await client.execute({
    sql: `SELECT t.*,
            (SELECT COUNT(*) FROM attachments WHERE task_id = t.id) as attachment_count
          FROM tasks t
          ${whereClause}
          ORDER BY t.${sort} ${order}
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  return {
    items: result.rows.map(row => ({
      ...mapTask(row),
      attachment_count: row.attachment_count as number,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

**Important:** The sort column is whitelisted, not interpolated from user
input. This prevents SQL injection. Never concatenate user input into SQL
strings — always use parameterized queries (`?` placeholders) for values.
Column and table names cannot be parameterized in SQLite, so whitelist them.

---

## Result Mapping

Every table has a `mapXxx` function that converts a raw `Row` (plain
object with `unknown` values) into a typed interface. This is where JSON
parsing happens:

```typescript
// Raw row from SQLite: { metadata: '{"browser":"Safari"}' }
// Mapped result:       { metadata: { browser: 'Safari' } }
```

Parse JSON defensively — the value might be null or malformed:

```typescript
function parseJSON(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
```

---

## Export/Import Serialization

For the production-to-local sync (`npx beacon pull`), tasks are exported
as a JSON envelope with all related data included:

### Export (production side)

```typescript
export async function exportTasks(
  client: Client,
  params: { status?: string; since?: string }
): Promise<ExportEnvelope> {
  const conditions: string[] = [];
  const args: (string)[] = [];

  if (params.status) {
    conditions.push('status = ?');
    args.push(params.status);
  }
  if (params.since) {
    conditions.push('updated_at > ?');
    args.push(params.since);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  const tasks = await client.execute({
    sql: `SELECT * FROM tasks ${whereClause} ORDER BY created_at ASC`,
    args,
  });

  const exportedTasks = [];

  for (const row of tasks.rows) {
    const task = mapTask(row);
    const notes = await query(client,
      'SELECT content, author_email FROM admin_notes WHERE task_id = ? ORDER BY created_at',
      [task.id]
    );
    // Attachments with file data are added by the API handler (not the query layer)

    exportedTasks.push({
      ...task,
      admin_notes: notes.map(n => ({
        content: n.content as string,
        author_email: n.author_email as string | null,
      })),
      // attachments added at API layer with base64 data
    });
  }

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    tasks: exportedTasks,
  };
}
```

### Import (local side)

```typescript
export async function importTask(
  client: Client,
  task: ExportedTask,
  origin: string
): Promise<Task> {
  // Check for existing task with same origin + remote_id (deduplication)
  const existing = await queryOne(client,
    'SELECT id FROM tasks WHERE origin = ? AND remote_id = ?',
    [origin, task.id]
  );

  if (existing) {
    // Update existing task
    await client.execute({
      sql: `UPDATE tasks SET
              type = ?, priority = ?, status = ?, description = ?,
              route = ?, element_selector = ?, metadata = ?,
              updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        task.type, task.priority, task.status, task.description,
        task.route, task.element_selector,
        task.metadata ? JSON.stringify(task.metadata) : null,
        existing.id as string,
      ],
    });
    return (await getTask(client, existing.id as string))!;
  }

  // Create new task with origin tracking
  return createTask(client, {
    type: task.type,
    priority: task.priority,
    description: task.description,
    route: task.route,
    element_selector: task.element_selector,
    metadata: task.metadata ? JSON.stringify(task.metadata) : null,
    user_email: task.user_email,
    origin,
    remote_id: task.id,
  });
}
```

The deduplication key is `origin` + `remote_id`. Pulling the same task
from production a second time updates the existing local copy rather than
creating a duplicate. The `origin` field stores the production URL
(e.g., `https://staging.myapp.com`) and `remote_id` stores the task's
ID on the production instance.

---

## Common Query Patterns

### Count by status (for dashboard stats)

```typescript
export async function getTaskCounts(client: Client): Promise<Record<string, number>> {
  const result = await query(client,
    'SELECT status, COUNT(*) as count FROM tasks GROUP BY status'
  );
  const counts: Record<string, number> = {};
  for (const row of result) {
    counts[row.status as string] = row.count as number;
  }
  return counts;
}
```

### Upsert pattern (INSERT OR REPLACE)

For the meta table and session management:

```typescript
await client.execute({
  sql: `INSERT OR REPLACE INTO _beacon_meta (key, value) VALUES (?, ?)`,
  args: ['schema_version', '3'],
});
```

### Check-then-act with transactions

When you need to read a value and then write based on it (e.g., status
transitions), use an interactive transaction to prevent races:

```typescript
const tx = await client.transaction('write');
try {
  const result = await tx.execute({
    sql: 'SELECT status FROM tasks WHERE id = ?',
    args: [taskId],
  });
  const currentStatus = result.rows[0]?.status as string;

  if (!canTransition(currentStatus, newStatus)) {
    tx.close();
    return errorResponse(409, `Cannot transition from '${currentStatus}' to '${newStatus}'`);
  }

  await tx.execute({
    sql: "UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?",
    args: [newStatus, taskId],
  });

  await tx.commit();
} finally {
  tx.close();
}
```

For Beacon's single-developer use case, races are unlikely, so most
handlers can use simple execute calls without transactions. Reserve
interactive transactions for operations where correctness matters
(status transitions, session creation).
