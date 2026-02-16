# Middleware Patterns

## Table of Contents

- Kill switch implementation
- Lazy initialization
- Config resolution
- Auth middleware (deployed mode)
- Session management
- Middleware composition
- Error boundaries

---

## Kill Switch Implementation

When `enabled: false`, the handle function must have zero overhead. Don't
create closures, don't import modules, don't check config — just pass through.

```typescript
export function beacon(config: BeaconConfig): Handle {
  // The kill switch returns a completely clean function
  if (!config.enabled) {
    return ({ event, resolve }) => resolve(event);
  }

  // ... rest of implementation only runs if enabled
}
```

The function returned when disabled is as cheap as it gets — no variable
captures, no prefix checks, no async overhead. It's identical to SvelteKit's
default handle behavior.

Why this matters: the host app might have Beacon installed but disabled in
production. The handle hook runs on every request. Even a `pathname.startsWith`
check adds up across millions of requests. The kill switch eliminates this
entirely.

---

## Lazy Initialization

Database connections, migrations, and config resolution happen on the first
Beacon request, not when the hook is created. This prevents the host app's
startup from being delayed by Beacon's setup.

```typescript
export function beacon(config: BeaconConfig): Handle {
  if (!config.enabled) {
    return ({ event, resolve }) => resolve(event);
  }

  // These are populated lazily
  let state: BeaconState | null = null;

  async function ensureInitialized(config: BeaconConfig): Promise<BeaconState> {
    if (state) return state;

    const resolvedConfig = resolveConfig(config);
    const db = await initDatabase(resolvedConfig);

    state = { db, config: resolvedConfig };
    return state;
  }

  return async ({ event, resolve }) => {
    const { pathname } = event.url;

    if (!pathname.startsWith(ROUTE_PREFIX)) {
      return resolve(event);
    }

    const { db, config: resolvedConfig } = await ensureInitialized(config);

    // ... dispatch to API/dashboard
  };
}
```

The `ensureInitialized` function runs once and caches the result. Subsequent
requests hit the `if (state) return state` fast path. This means:

- First Beacon request: ~50-200ms (database init + migration check)
- Subsequent requests: ~0ms (cached state)
- Non-Beacon requests: 0ms (never initialized)

### Initialization Failure

If database initialization fails (corrupted file, migration error), catch it
and return a helpful error page:

```typescript
async function ensureInitialized(config: BeaconConfig): Promise<BeaconState> {
  if (state) return state;
  if (initError) throw initError; // Don't retry on every request

  try {
    const resolvedConfig = resolveConfig(config);
    const db = await initDatabase(resolvedConfig);
    state = { db, config: resolvedConfig };
    return state;
  } catch (err) {
    initError = err;
    throw err;
  }
}
```

In the main handler, catch `ensureInitialized` failures and return an
error page rather than crashing the host app:

```typescript
try {
  const { db, config: resolvedConfig } = await ensureInitialized(config);
  // ...
} catch (err) {
  return new Response(
    `<html><body><h1>Beacon initialization failed</h1><pre>${err.message}</pre></body></html>`,
    { status: 500, headers: { 'Content-Type': 'text/html' } }
  );
}
```

---

## Config Resolution

The config system works in three layers: mode defaults → user config →
environment variables. Explicit values always win over defaults.

```typescript
interface BeaconConfig {
  enabled: boolean;
  mode: 'development' | 'deployed';
  adminEmails?: string[];
  database?: string;
  databaseAuthToken?: string;
  widget?: Partial<WidgetConfig>;
  ai?: Partial<AIConfig>;
}

interface WidgetConfig {
  screenshot: boolean;
  elementSelector: boolean;
  aiAssist: boolean;
  requireEmail: boolean;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

interface AIConfig {
  maxDurationMinutes: number;
  requireTestsForBugs: boolean;
}

// Fully resolved — no optional fields
interface ResolvedConfig {
  enabled: true; // always true if we're resolving (kill switch handled earlier)
  mode: 'development' | 'deployed';
  adminEmails: string[];
  database: string;
  databaseAuthToken: string | undefined;
  widget: WidgetConfig;
  ai: AIConfig;
  requireAuth: boolean;
}
```

The resolution function:

```typescript
const MODE_DEFAULTS: Record<string, Partial<WidgetConfig> & { requireAuth: boolean }> = {
  development: {
    screenshot: true,
    elementSelector: true,
    aiAssist: true,
    requireEmail: false,
    requireAuth: false,
  },
  deployed: {
    screenshot: false,
    elementSelector: false,
    aiAssist: false,
    requireEmail: true,
    requireAuth: true,
  },
};

export function resolveConfig(config: BeaconConfig): ResolvedConfig {
  const modeDefaults = MODE_DEFAULTS[config.mode];

  return {
    enabled: true,
    mode: config.mode,
    adminEmails: config.adminEmails ?? envList('ADMIN_EMAILS'),
    database: config.database ?? env('BEACON_DATABASE_URL') ?? 'file:.beacon/beacon.db',
    databaseAuthToken: config.databaseAuthToken ?? env('BEACON_DATABASE_AUTH_TOKEN'),
    widget: {
      screenshot: config.widget?.screenshot ?? modeDefaults.screenshot ?? false,
      elementSelector: config.widget?.elementSelector ?? modeDefaults.elementSelector ?? false,
      aiAssist: config.widget?.aiAssist ?? modeDefaults.aiAssist ?? false,
      requireEmail: config.widget?.requireEmail ?? modeDefaults.requireEmail ?? false,
      position: config.widget?.position ?? 'bottom-right',
    },
    ai: {
      maxDurationMinutes: config.ai?.maxDurationMinutes ?? 30,
      requireTestsForBugs: config.ai?.requireTestsForBugs ?? true,
    },
    requireAuth: modeDefaults.requireAuth,
  };
}

// Helpers
function env(key: string): string | undefined {
  return process.env[key];
}

function envList(key: string): string[] {
  const val = process.env[key];
  return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
}
```

The key principle: mode sets defaults, explicit config overrides. A developer
can enable screenshots in deployed mode by passing `widget: { screenshot: true }`.

### Widget Config Endpoint

The widget reads its configuration from a lightweight API endpoint. This means
the developer configures once in `hooks.server.ts` and the widget reflects
those settings automatically:

```typescript
// GET /__beacon/api/config — public, no auth
route('GET', '/config', async (event, db, config) => {
  return jsonResponse({
    widget: config.widget,
    mode: config.mode,
  });
});
```

---

## Auth Middleware (Deployed Mode)

Auth is applied as a middleware layer between route matching and handler
execution. In development mode, it's skipped entirely.

```typescript
interface AuthContext {
  authenticated: boolean;
  email: string | null;
  isAdmin: boolean;
}

async function resolveAuth(
  event: RequestEvent,
  db: Database,
  config: ResolvedConfig
): Promise<AuthContext> {
  // No auth in development mode
  if (!config.requireAuth) {
    return { authenticated: true, email: null, isAdmin: true };
  }

  const sessionToken = event.cookies.get('beacon_session');
  if (!sessionToken) {
    return { authenticated: false, email: null, isAdmin: false };
  }

  const session = db.getSession(sessionToken);
  if (!session || new Date(session.expires_at) < new Date()) {
    // Expired session — clear the cookie
    event.cookies.delete('beacon_session', { path: ROUTE_PREFIX });
    return { authenticated: false, email: null, isAdmin: false };
  }

  return {
    authenticated: true,
    email: session.email,
    isAdmin: config.adminEmails.includes(session.email),
  };
}
```

### Applying Auth to Routes

Auth is checked in the main dispatch flow, not in individual handlers.
This prevents handlers from accidentally forgetting auth checks:

```typescript
return async ({ event, resolve }) => {
  const { pathname } = event.url;

  if (!pathname.startsWith(ROUTE_PREFIX)) {
    return resolve(event);
  }

  const { db, config: resolvedConfig } = await ensureInitialized(config);

  // Resolve auth context for all Beacon requests
  const auth = await resolveAuth(event, db, resolvedConfig);

  // API routes
  if (pathname.startsWith(API_PREFIX)) {
    // Public API routes that skip auth
    if (isPublicAPIRoute(pathname, event.request.method)) {
      return handleAPI(event, db, resolvedConfig, auth);
    }

    // Protected API routes
    if (!auth.authenticated) {
      return errorResponse(401, 'Authentication required');
    }

    return handleAPI(event, db, resolvedConfig, auth);
  }

  // Dashboard routes — always require auth in deployed mode
  if (resolvedConfig.requireAuth && !auth.authenticated) {
    // Exception: the login page itself
    if (pathname === `${ROUTE_PREFIX}/login` || pathname.startsWith(`${ROUTE_PREFIX}/auth/`)) {
      return handleDashboard(event, db, resolvedConfig);
    }
    return redirectResponse(`${ROUTE_PREFIX}/login`);
  }

  return handleDashboard(event, db, resolvedConfig);
};
```

### Public API Routes

Some endpoints must work without auth (feedback submission from the widget,
config endpoint for widget initialization):

```typescript
function isPublicAPIRoute(pathname: string, method: string): boolean {
  const publicRoutes = [
    { method: 'POST', path: `${API_PREFIX}/feedback` },
    { method: 'GET', path: `${API_PREFIX}/config` },
    { method: 'POST', path: `${API_PREFIX}/auth/magic-link` },
    { method: 'GET', path: `${API_PREFIX}/auth/verify` },
  ];

  return publicRoutes.some(
    r => r.method === method && pathname === r.path
  );
}
```

---

## Session Management

### Setting Session Cookies

After magic link verification:

```typescript
// In the auth/verify handler
const sessionToken = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

db.createSession({
  id: sessionToken,
  email: verifiedEmail,
  is_admin: config.adminEmails.includes(verifiedEmail) ? 1 : 0,
  expires_at: expiresAt.toISOString(),
});

event.cookies.set('beacon_session', sessionToken, {
  path: ROUTE_PREFIX,       // Only sent for Beacon routes
  httpOnly: true,           // Not accessible from JavaScript
  sameSite: 'strict',       // No cross-site requests
  secure: !dev,             // HTTPS only in production
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
});

return redirectResponse(ROUTE_PREFIX);
```

Important: the cookie `path` is set to `ROUTE_PREFIX` so it's only sent with
Beacon requests. This prevents the cookie from being included in the host
app's requests, which would be a subtle leak.

### Clearing Sessions

```typescript
event.cookies.delete('beacon_session', { path: ROUTE_PREFIX });
```

---

## Middleware Composition

The full middleware flow for a Beacon request:

```
Request arrives
  ↓
1. Prefix check — exit early if not /__beacon
  ↓
2. Lazy initialization — database, config (first request only)
  ↓
3. Auth resolution — read session cookie, validate
  ↓
4. Route dispatch — API router or dashboard server
  ↓
5. Handler execution — business logic
  ↓
6. Response returned — JSON, HTML, SSE stream, or file
```

Each layer has a clear responsibility and clean boundaries. Auth doesn't
know about routing. Routing doesn't know about initialization. Handlers
don't know about auth checks (they receive an `AuthContext` that's already
resolved).

---

## Error Boundaries

The handle function is the last line of defense. If anything inside Beacon
throws an unhandled error, it must not crash the host app.

```typescript
return async ({ event, resolve }) => {
  const { pathname } = event.url;

  if (!pathname.startsWith(ROUTE_PREFIX)) {
    return resolve(event);
  }

  try {
    // ... all Beacon logic wrapped in try/catch
  } catch (err) {
    console.error('[Beacon] Unhandled error:', err);

    // Return a safe error response
    if (pathname.startsWith(API_PREFIX)) {
      return errorResponse(500, 'Internal server error');
    }

    // For dashboard routes, return an HTML error page
    return new Response(
      `<!DOCTYPE html><html><body>
        <h1>Beacon Error</h1>
        <p>An unexpected error occurred. Check the server console for details.</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
};
```

The outer try/catch ensures that even if the database crashes, a migration
fails, or a handler has a bug, the host application continues functioning
normally. Beacon's errors are Beacon's problem.
