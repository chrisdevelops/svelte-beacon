# Server-Side Tests

## Table of Contents

- Mock RequestEvent factory
- Testing the handle hook
- Testing the API router
- Testing individual API handlers
- Testing middleware (auth, config)
- Mock data factories

---

## Mock RequestEvent Factory

SvelteKit's `RequestEvent` is the object passed to every handle function.
In real SvelteKit, the framework creates this from an incoming HTTP
request. In tests, we build it manually.

```typescript
// test/mocks/request-event.ts

import type { RequestEvent } from '@sveltejs/kit';

interface MockEventOptions {
  method?: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  locals?: Record<string, unknown>;
  query?: Record<string, string>;
}

export function createMockEvent(options: MockEventOptions = {}): RequestEvent {
  const {
    method = 'GET',
    path = '/',
    body = null,
    headers = {},
    cookies = {},
    locals = {},
    query = {},
  } = options;

  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const requestHeaders = new Headers(headers);
  if (body && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  const request = new Request(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : null,
  });

  const cookieJar = new Map(Object.entries(cookies));

  return {
    url,
    request,
    params: {},
    route: { id: null },
    locals: { ...locals },
    platform: undefined,
    isDataRequest: false,
    isSubRequest: false,

    cookies: {
      get: (name: string) => cookieJar.get(name) ?? null,
      getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => { cookieJar.set(name, value); },
      delete: (name: string) => { cookieJar.delete(name); },
      serialize: (name: string, value: string) => `${name}=${value}`,
    },

    getClientAddress: () => '127.0.0.1',

    setHeaders: () => {},
    fetch: globalThis.fetch,
  } as unknown as RequestEvent;
}

// Convenience helpers for common patterns
export function createBeaconAPIEvent(
  method: string,
  apiPath: string,
  options: Omit<MockEventOptions, 'method' | 'path'> = {}
): RequestEvent {
  return createMockEvent({
    ...options,
    method,
    path: `/__beacon/api${apiPath}`,
  });
}

export function createBeaconDashboardEvent(
  dashboardPath: string = '/'
): RequestEvent {
  return createMockEvent({
    method: 'GET',
    path: `/__beacon${dashboardPath}`,
  });
}
```

### The resolve Mock

The `handle` function receives `{ event, resolve }`. The `resolve`
function passes the request to the next handler or the SvelteKit router.
In tests, it returns a simple 200 response:

```typescript
export function createMockResolve(): (event: RequestEvent) => Promise<Response> {
  return async () => new Response('OK', { status: 200 });
}
```

For tests that verify passthrough behavior, you can make resolve trackable:

```typescript
export function createTrackableResolve() {
  let called = false;
  let calledWith: RequestEvent | null = null;

  const resolve = async (event: RequestEvent) => {
    called = true;
    calledWith = event;
    return new Response('OK', { status: 200 });
  };

  return {
    resolve,
    get called() { return called; },
    get calledWith() { return calledWith; },
  };
}
```

---

## Testing the Handle Hook

The handle hook is the outermost layer. Tests verify routing decisions:
which requests go to Beacon, which pass through to the host app.

```typescript
// src/server/__tests__/hook.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { beacon } from '../index.js';
import { createMockEvent, createMockResolve, createTrackableResolve } from '../../../test/mocks/request-event.js';

describe('beacon() handle hook', () => {
  describe('kill switch', () => {
    it('passes through all requests when disabled', async () => {
      const handle = beacon({ enabled: false });
      const tracker = createTrackableResolve();

      const event = createMockEvent({ path: '/__beacon/api/tasks' });
      const response = await handle({ event, resolve: tracker.resolve });

      expect(tracker.called).toBe(true);
      expect(response.status).toBe(200);
    });
  });

  describe('routing', () => {
    it('passes through non-beacon requests', async () => {
      const handle = beacon({ enabled: true, mode: 'development' });
      const tracker = createTrackableResolve();

      const event = createMockEvent({ path: '/about' });
      await handle({ event, resolve: tracker.resolve });

      expect(tracker.called).toBe(true);
    });

    it('handles API requests without calling resolve', async () => {
      const handle = beacon({ enabled: true, mode: 'development' });
      const tracker = createTrackableResolve();

      const event = createMockEvent({
        method: 'POST',
        path: '/__beacon/api/feedback',
        body: {
          type: 'bug',
          priority: 'medium',
          description: 'Test bug',
        },
      });

      const response = await handle({ event, resolve: tracker.resolve });

      expect(tracker.called).toBe(false);
      expect(response.status).toBe(201);
    });

    it('serves dashboard for non-API beacon routes', async () => {
      const handle = beacon({ enabled: true, mode: 'development' });
      const tracker = createTrackableResolve();

      const event = createMockEvent({ path: '/__beacon/' });
      const response = await handle({ event, resolve: tracker.resolve });

      expect(tracker.called).toBe(false);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('error boundary', () => {
    it('never throws — returns error response instead', async () => {
      const handle = beacon({
        enabled: true,
        mode: 'development',
        // Force a broken config to trigger an error
        database: 'invalid://not-a-url',
      });
      const tracker = createTrackableResolve();

      const event = createMockEvent({ path: '/__beacon/api/tasks' });
      const response = await handle({ event, resolve: tracker.resolve });

      // Should return an error page, not throw
      expect(response.status).toBeGreaterThanOrEqual(500);
    });
  });
});
```

### What to Test at the Hook Level

- Kill switch produces clean passthrough
- Non-Beacon routes always pass through
- API routes are intercepted and return responses
- Dashboard routes are intercepted and return HTML
- Errors never propagate (error boundary catches everything)
- Initialization happens only once (call the hook twice, verify no double init)

### What NOT to Test at the Hook Level

- Specific API behavior (test at the handler level)
- Database queries (test at the query level)
- Response body content (test at the handler level)

---

## Testing the API Router

The router dispatches requests to the correct handler based on method
and path. Tests verify routing correctness.

```typescript
// src/server/api/router.test.ts

import { describe, it, expect } from 'vitest';
import { createRouter, route } from './router.js';

describe('API router', () => {
  it('matches exact paths', async () => {
    let called = false;
    route('GET', '/tasks', async () => {
      called = true;
      return new Response('OK');
    });

    const event = createBeaconAPIEvent('GET', '/tasks');
    await createRouter()(event, db, config);

    expect(called).toBe(true);
  });

  it('extracts path parameters', async () => {
    let capturedParams: Record<string, string> = {};
    route('GET', '/tasks/:id', async (_event, _db, _config, params) => {
      capturedParams = params;
      return new Response('OK');
    });

    const event = createBeaconAPIEvent('GET', '/tasks/abc-123');
    await createRouter()(event, db, config);

    expect(capturedParams.id).toBe('abc-123');
  });

  it('returns 404 for unmatched routes', async () => {
    const event = createBeaconAPIEvent('GET', '/nonexistent');
    const response = await createRouter()(event, db, config);

    expect(response.status).toBe(404);
  });

  it('returns 405 for wrong method on existing route', async () => {
    route('POST', '/feedback', async () => new Response('OK'));

    const event = createBeaconAPIEvent('GET', '/feedback');
    const response = await createRouter()(event, db, config);

    expect(response.status).toBe(405);
  });
});
```

---

## Testing Individual API Handlers

Handlers are the most important unit to test. Each handler is a function
that receives a `RequestEvent`, database client, config, params, and
optional auth — and returns a `Response`.

```typescript
// src/server/api/tasks.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { runMigrations } from '../db/migrations.js';
import { handleListTasks, handleGetTask, handleUpdateTask } from './tasks.js';
import { handleCreateFeedback } from './feedback.js';
import { createBeaconAPIEvent } from '../../../test/mocks/request-event.js';

describe('task handlers', () => {
  let db: Client;

  beforeEach(async () => {
    // Fresh in-memory database for every test
    db = createClient({ url: 'file::memory:' });
    await runMigrations(db);
  });

  async function createTestTask(overrides = {}) {
    const event = createBeaconAPIEvent('POST', '/feedback', {
      body: {
        type: 'bug',
        priority: 'high',
        description: 'Button is broken',
        ...overrides,
      },
    });
    const response = await handleCreateFeedback(event, db, defaultConfig);
    return response.json();
  }

  describe('GET /tasks', () => {
    it('returns empty list when no tasks', async () => {
      const event = createBeaconAPIEvent('GET', '/tasks');
      const response = await handleListTasks(event, db, defaultConfig);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.items).toEqual([]);
      expect(data.pagination.total).toBe(0);
    });

    it('filters by status', async () => {
      await createTestTask();

      const event = createBeaconAPIEvent('GET', '/tasks', {
        query: { status: 'new' },
      });
      const response = await handleListTasks(event, db, defaultConfig);
      const data = await response.json();

      expect(data.items).toHaveLength(1);
      expect(data.items[0].status).toBe('new');
    });

    it('paginates results', async () => {
      for (let i = 0; i < 5; i++) {
        await createTestTask({ description: `Task ${i}` });
      }

      const event = createBeaconAPIEvent('GET', '/tasks', {
        query: { page: '1', limit: '2' },
      });
      const response = await handleListTasks(event, db, defaultConfig);
      const data = await response.json();

      expect(data.items).toHaveLength(2);
      expect(data.pagination.total).toBe(5);
      expect(data.pagination.totalPages).toBe(3);
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('updates status with valid transition', async () => {
      const task = await createTestTask();

      const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
        body: { status: 'backlog' },
      });
      const response = await handleUpdateTask(
        event, db, defaultConfig,
        { id: task.id },
        { email: 'dev@test.com', isAdmin: false }
      );
      const updated = await response.json();

      expect(response.status).toBe(200);
      expect(updated.status).toBe('backlog');
    });

    it('rejects invalid status transition', async () => {
      const task = await createTestTask();

      const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
        body: { status: 'done' },  // Can't go from 'new' to 'done'
      });
      const response = await handleUpdateTask(
        event, db, defaultConfig,
        { id: task.id },
        { email: 'dev@test.com', isAdmin: false }
      );

      expect(response.status).toBe(409);
    });

    it('returns 404 for nonexistent task', async () => {
      const event = createBeaconAPIEvent('PATCH', '/tasks/nonexistent', {
        body: { status: 'backlog' },
      });
      const response = await handleUpdateTask(
        event, db, defaultConfig,
        { id: 'nonexistent' },
        { email: 'dev@test.com', isAdmin: false }
      );

      expect(response.status).toBe(404);
    });
  });
});
```

### Handler Test Pattern

Every handler test follows the same structure:

1. **Arrange:** Create a fresh in-memory DB, seed any prerequisite data
2. **Act:** Call the handler function with a mock event
3. **Assert:** Check the response status and body

The handler function is called directly — not through the router or
the hook. This isolates the handler logic from routing concerns.

---

## Testing Middleware

### Auth Middleware

```typescript
// src/server/auth/middleware.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { runMigrations } from '../db/migrations.js';
import { authenticateRequest } from './middleware.js';
import { createMockEvent } from '../../../test/mocks/request-event.js';
import { createSession } from '../db/queries/sessions.js';

describe('auth middleware', () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: 'file::memory:' });
    await runMigrations(db);
  });

  it('returns null for missing session cookie', async () => {
    const event = createMockEvent({ path: '/__beacon/api/tasks' });
    const auth = await authenticateRequest(event, db);

    expect(auth).toBeNull();
  });

  it('returns auth info for valid session', async () => {
    const session = await createSession(db, {
      email: 'admin@test.com',
      isAdmin: true,
      expiresInHours: 24,
    });

    const event = createMockEvent({
      path: '/__beacon/api/tasks',
      cookies: { 'beacon-session': session.id },
    });

    const auth = await authenticateRequest(event, db);

    expect(auth).not.toBeNull();
    expect(auth!.email).toBe('admin@test.com');
    expect(auth!.isAdmin).toBe(true);
  });

  it('returns null for expired session', async () => {
    const session = await createSession(db, {
      email: 'admin@test.com',
      isAdmin: true,
      expiresInHours: -1, // Already expired
    });

    const event = createMockEvent({
      path: '/__beacon/api/tasks',
      cookies: { 'beacon-session': session.id },
    });

    const auth = await authenticateRequest(event, db);
    expect(auth).toBeNull();
  });
});
```

### Config Resolution

```typescript
// src/server/config.test.ts

import { describe, it, expect } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('applies development mode defaults', () => {
    const config = resolveConfig({ enabled: true, mode: 'development' });

    expect(config.requireAuth).toBe(false);
    expect(config.widget.screenshot).toBe(true);
    expect(config.widget.aiAssist).toBe(true);
  });

  it('applies deployed mode defaults', () => {
    const config = resolveConfig({ enabled: true, mode: 'deployed' });

    expect(config.requireAuth).toBe(true);
    expect(config.widget.screenshot).toBe(false);
  });

  it('explicit overrides beat mode defaults', () => {
    const config = resolveConfig({
      enabled: true,
      mode: 'deployed',
      widget: { screenshot: true },
    });

    expect(config.widget.screenshot).toBe(true);
    expect(config.requireAuth).toBe(true); // Mode default still applies
  });
});
```

---

## Mock Data Factories

Centralize test data creation so tests are readable and maintainable:

```typescript
// test/factories.ts

let idCounter = 0;

export function createTaskData(overrides: Record<string, unknown> = {}) {
  idCounter++;
  return {
    type: 'bug',
    priority: 'medium',
    description: `Test task ${idCounter}`,
    route: '/test-page',
    ...overrides,
  };
}

export function createSessionData(overrides: Record<string, unknown> = {}) {
  return {
    email: 'test@example.com',
    isAdmin: false,
    expiresInHours: 24,
    ...overrides,
  };
}

export const defaultConfig = {
  enabled: true,
  mode: 'development' as const,
  database: 'file::memory:',
  requireAuth: false,
  adminEmails: ['admin@test.com'],
  widget: {
    screenshot: true,
    elementSelector: true,
    aiAssist: true,
    requireEmail: false,
    position: 'bottom-right',
  },
  ai: {
    maxDurationMinutes: 30,
    requireTestsForBugs: true,
  },
};
```
