# Route Matching & API Handling

## Table of Contents

- Route prefix and constants
- The route matching pattern
- API router implementation
- Registering new endpoints
- Request parsing (JSON, FormData, URL params)
- Response construction (JSON, errors, redirects)
- Path parameter extraction
- Query parameter handling

---

## Route Prefix and Constants

All Beacon routes live under a single prefix. This constant is shared between
the server hook and the client widget so there's zero configuration needed.

```typescript
// src/constants.ts — shared between server and widget
export const ROUTE_PREFIX = '/__beacon';
export const API_PREFIX = '/__beacon/api';
export const DASHBOARD_PREFIX = '/__beacon';
```

The prefix uses a double underscore to signal "internal/system route" and
minimize collision risk with the host app's routes. This prefix is hardcoded,
not configurable — one less thing that can be misconfigured.

---

## The Route Matching Pattern

The top-level handle function checks the prefix first, then dispatches to
sub-routers. The key principle: check the prefix as cheaply as possible
and pass through immediately if it doesn't match.

```typescript
import { ROUTE_PREFIX, API_PREFIX } from './constants.js';
import type { Handle } from '@sveltejs/kit';

export function beacon(config: BeaconConfig): Handle {
  // Kill switch — return a no-op handle function
  if (!config.enabled) {
    return ({ event, resolve }) => resolve(event);
  }

  // State initialized lazily on first Beacon request
  let initialized = false;
  let db: Database;
  let resolvedConfig: ResolvedConfig;

  return async ({ event, resolve }) => {
    const { pathname } = event.url;

    // Fast exit for non-Beacon routes — this is the hot path
    if (!pathname.startsWith(ROUTE_PREFIX)) {
      return resolve(event);
    }

    // Lazy initialization on first Beacon request
    if (!initialized) {
      resolvedConfig = resolveConfig(config);
      db = await initDatabase(resolvedConfig);
      initialized = true;
    }

    // Dispatch to API or dashboard
    if (pathname.startsWith(API_PREFIX)) {
      return handleAPI(event, db, resolvedConfig);
    }

    return handleDashboard(event, db, resolvedConfig);
  };
}
```

The `!pathname.startsWith(ROUTE_PREFIX)` check is intentionally simple string
comparison — no regex, no URL parsing beyond what SvelteKit already did. This
runs on every single request the host app receives, so it must be fast.

---

## API Router Implementation

The API router maps method + path combinations to handler functions. Keep it
simple — a flat list of route definitions with basic pattern matching for
path parameters.

```typescript
// src/server/api/router.ts

type RouteHandler = (
  event: RequestEvent,
  db: Database,
  config: ResolvedConfig,
  params: Record<string, string>
) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

// Helper to register routes
function route(
  method: string,
  path: string,
  handler: RouteHandler
): void {
  // Convert path like '/tasks/:id/export' to regex
  const paramNames: string[] = [];
  const pattern = new RegExp(
    '^' +
    API_PREFIX +
    path
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      }) +
    '$'
  );
  routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
}

// Main dispatcher
export async function handleAPI(
  event: RequestEvent,
  db: Database,
  config: ResolvedConfig
): Promise<Response> {
  const { pathname } = event.url;
  const method = event.request.method;

  for (const r of routes) {
    if (r.method !== method) continue;
    const match = pathname.match(r.pattern);
    if (!match) continue;

    // Extract path params
    const params: Record<string, string> = {};
    r.paramNames.forEach((name, i) => {
      params[name] = match[i + 1];
    });

    try {
      return await r.handler(event, db, config, params);
    } catch (err) {
      return errorResponse(500, 'Internal server error', err);
    }
  }

  return errorResponse(404, `No route matches ${method} ${pathname}`);
}
```

### Registering New Endpoints

Each endpoint module registers its routes when imported. This keeps route
definitions close to their handler code:

```typescript
// src/server/api/feedback.ts

import { route } from './router.js';

// POST /__beacon/api/feedback — public, no auth required
route('POST', '/feedback', async (event, db, config, params) => {
  const formData = await event.request.formData();
  const description = formData.get('description') as string;
  const type = formData.get('type') as string;
  const priority = formData.get('priority') as string;

  // ... validate, save to db, store attachments

  return jsonResponse({ id: task.id, publicId: task.public_id }, 201);
});

// GET /__beacon/api/tasks — list tasks, filterable
route('GET', '/tasks', async (event, db, config, params) => {
  const status = event.url.searchParams.get('status');
  const type = event.url.searchParams.get('type');
  const sort = event.url.searchParams.get('sort') || 'created_at';
  const order = event.url.searchParams.get('order') || 'desc';

  const tasks = db.listTasks({ status, type, sort, order });

  return jsonResponse(tasks);
});

// GET /__beacon/api/tasks/:id — single task detail
route('GET', '/tasks/:id', async (event, db, config, params) => {
  const task = db.getTask(params.id);
  if (!task) return errorResponse(404, 'Task not found');
  return jsonResponse(task);
});

// PATCH /__beacon/api/tasks/:id — update task
route('PATCH', '/tasks/:id', async (event, db, config, params) => {
  const body = await event.request.json();
  const task = db.updateTask(params.id, body);
  if (!task) return errorResponse(404, 'Task not found');
  return jsonResponse(task);
});
```

To add a new endpoint: create a handler file, import `route`, register your
method + path + handler, and import the file in the router's index. That's it.

---

## Request Parsing

### JSON Body

```typescript
async function parseJSON(event: RequestEvent): Promise<unknown> {
  try {
    return await event.request.json();
  } catch {
    return null;
  }
}

// Usage in a handler:
const body = await parseJSON(event);
if (!body || typeof body !== 'object') {
  return errorResponse(400, 'Invalid JSON body');
}
```

### FormData (for file uploads)

```typescript
async function parseFormData(event: RequestEvent): Promise<FormData | null> {
  try {
    return await event.request.formData();
  } catch {
    return null;
  }
}

// Usage — extracting files:
const formData = await parseFormData(event);
if (!formData) return errorResponse(400, 'Invalid form data');

const description = formData.get('description') as string;
const screenshot = formData.get('screenshot') as File | null;

if (screenshot) {
  const buffer = Buffer.from(await screenshot.arrayBuffer());
  const path = `screenshots/${crypto.randomUUID()}-${screenshot.name}`;
  await writeFile(join(STORAGE_DIR, path), buffer);
  // Save path reference to database
}
```

### Path Parameters

Extracted automatically by the router from `:param` segments. Available as
`params.id`, `params.taskId`, etc. in the handler.

### Query Parameters

Access via `event.url.searchParams`:

```typescript
const page = parseInt(event.url.searchParams.get('page') || '1');
const limit = parseInt(event.url.searchParams.get('limit') || '50');
const status = event.url.searchParams.get('status'); // null if not present
```

---

## Response Construction

### JSON Responses

```typescript
export function jsonResponse(
  data: unknown,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
```

### Error Responses

Use a consistent error shape across all endpoints:

```typescript
export function errorResponse(
  status: number,
  message: string,
  error?: unknown
): Response {
  const body: { error: string; details?: string } = { error: message };

  // Include details in development only
  if (error instanceof Error && process.env.NODE_ENV !== 'production') {
    body.details = error.message;
  }

  return jsonResponse(body, status);
}
```

Every Beacon API error looks like:
```json
{ "error": "Task not found" }
```

Or in development:
```json
{ "error": "Internal server error", "details": "SQLITE_CONSTRAINT: ..." }
```

### Redirect Responses

For auth flows (magic link verification → dashboard):

```typescript
export function redirectResponse(location: string, status: number = 303): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}
```

### Empty Success Responses

For DELETE operations or actions with no return data:

```typescript
return new Response(null, { status: 204 });
```

---

## Common Patterns

### Public vs Protected Routes

Some routes (feedback submission, config endpoint) are public. Others
(dashboard, task management, AI control) require auth in deployed mode.
The auth check is applied in the middleware layer — see `references/middleware.md`.
The router itself doesn't handle auth; it just dispatches to handlers.

If a handler needs to know whether the request is from an admin, the
middleware attaches that information before the handler runs.

### CORS Headers

Beacon routes are same-origin (the widget and dashboard both live on the
same host as the API), so CORS is generally not needed. If you ever need
to support cross-origin requests (e.g., for a future API client), add
headers at the router level:

```typescript
// Only if needed — not in the default implementation
const corsHeaders = {
  'Access-Control-Allow-Origin': event.url.origin,
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle preflight
if (method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: corsHeaders });
}
```

### Rate Limiting

Not needed for v1 (single developer, local tool). If added later, implement
as middleware in the chain, not in individual handlers.
