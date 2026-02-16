# Client Initialization

## Table of Contents

- Connection string formats
- The createDatabase function
- Lazy initialization in the handle hook
- Database-doesn't-exist handling
- Closing the client

---

## Connection String Formats

`@libsql/client` determines the connection mode from the URL scheme:

| URL Format | Mode | When to Use |
|-----------|------|-------------|
| `file:path/to/db.db` | Local SQLite file | Development (default) |
| `file::memory:` | In-memory SQLite | Testing |
| `libsql://name.turso.io` | Remote Turso (HTTPS) | Production (Turso) |
| `http://localhost:8080` | Local sqld server | Advanced local dev |

For Beacon, the default is `file:.beacon/beacon.db` (development) and
a Turso URL for production.

The connection string comes from config resolution (see the
`sveltekit-handle-hook` middleware reference):

```
1. Explicit config:     beacon({ database: 'file:.beacon/beacon.db' })
2. Environment variable: BEACON_DATABASE_URL
3. Default:              'file:.beacon/beacon.db'
```

---

## The createDatabase Function

```typescript
// src/server/db/client.ts

import { createClient, type Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';

export async function createDatabase(config: ResolvedConfig): Promise<Client> {
  const client = createClient({
    url: config.database,
    authToken: config.databaseAuthToken,
  });

  // Run migrations on connect
  await runMigrations(client);

  return client;
}
```

The function is simple because `createClient` handles the connection mode
automatically based on the URL scheme. No conditional logic needed — the
same code works for local files and Turso.

### Auth Token

Only needed for Turso connections. For local file URLs, `authToken` is
ignored. The config resolution layer handles this — the handler just passes
whatever it receives:

```typescript
// Local: authToken will be undefined — that's fine
createClient({ url: 'file:.beacon/beacon.db', authToken: undefined });

// Turso: authToken is required
createClient({ url: 'libsql://mydb.turso.io', authToken: 'eyJ...' });
```

---

## Lazy Initialization in the Handle Hook

The database client is created on the first Beacon request, not at server
startup. This is handled by the `ensureInitialized` pattern in the handle
hook (see `sveltekit-handle-hook` middleware reference).

The important detail: the client is created once and reused for all
subsequent requests. `@libsql/client` manages its own connection pooling
internally.

```typescript
// Inside the beacon() handle factory
let db: Client | null = null;

async function ensureInitialized(config: BeaconConfig): Promise<BeaconState> {
  if (db) return { db, config: resolvedConfig };

  const resolvedConfig = resolveConfig(config);
  db = await createDatabase(resolvedConfig);

  return { db, config: resolvedConfig };
}
```

Do not create a new client per request. That would be extremely wasteful
for local file mode (reopening the file every time) and for Turso mode
(re-establishing the HTTP/WebSocket connection).

---

## Database-Doesn't-Exist Handling

For local file mode (`file:.beacon/beacon.db`), the client automatically
creates the database file if it doesn't exist. The directory must exist,
however.

The `npx beacon init` command creates the `.beacon/` directory, but the
database file is created lazily on first use. The initialization code
should ensure the directory exists before creating the client:

```typescript
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export async function createDatabase(config: ResolvedConfig): Promise<Client> {
  // For local file URLs, ensure the directory exists
  if (config.database.startsWith('file:')) {
    const dbPath = config.database.slice(5); // strip 'file:' prefix
    await mkdir(dirname(dbPath), { recursive: true });
  }

  const client = createClient({
    url: config.database,
    authToken: config.databaseAuthToken,
  });

  await runMigrations(client);

  return client;
}
```

For Turso URLs, the database must already exist on the Turso platform.
If it doesn't, `createClient` will succeed but the first query will fail
with a connection error. The handle hook's error boundary catches this
and shows a helpful error page.

---

## Closing the Client

In normal operation, the Beacon client lives for the lifetime of the
server process — it's never explicitly closed. SvelteKit's dev server
restarting or production process exiting handles cleanup.

If needed (e.g., for testing), call `client.close()`:

```typescript
client.close(); // Releases connections, aborts in-flight operations
```

After closing, `client.closed` will be `true` and any calls to `execute()`
will throw. Don't try to reuse a closed client.
