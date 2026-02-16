---
name: sveltekit-handle-hook
description: >
  Patterns for building npm packages that integrate with SvelteKit applications
  through the handle hook. Use this skill whenever working on svelte-beacon's
  handle hook, route interception, API endpoint handling, dashboard serving,
  middleware (auth, config resolution), SSE streaming, or static asset serving
  from within node_modules. Also use when writing or modifying any code that
  runs inside the beacon() function exported from svelte-beacon/server, or
  when debugging request routing issues. This skill is foundational — read it
  before touching any server-side Beacon code.
---

# SvelteKit Handle Hook Patterns for svelte-beacon

This skill defines how svelte-beacon uses SvelteKit's `handle` hook to serve
its entire backend — API endpoints, dashboard pages, static assets, and SSE
streams — from within an npm package, without placing any files in the host
application's `src/` directory.

## Why This Matters

The handle hook is the only integration point between svelte-beacon's server
code and the host SvelteKit application. Every request to `/__beacon/*` flows
through it. Getting the patterns right here means the rest of the system works
cleanly. Getting them wrong means subtle routing bugs, broken auth, leaked
responses, or performance overhead on every request the host app serves.

## Core Concepts

### The Handle Hook

SvelteKit's `handle` function runs on every server request. It receives an
`event` (representing the request) and a `resolve` function (which renders the
matched SvelteKit route). By returning a `Response` directly instead of calling
`resolve`, you bypass SvelteKit's routing entirely and serve your own content.

```typescript
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/__beacon')) {
    // Beacon handles this request — SvelteKit never sees it
    return new Response('Hello from Beacon');
  }
  // Not a Beacon route — pass through to the host app
  return resolve(event);
};
```

This is how svelte-beacon serves its dashboard, API, and assets without any
files in the host's `src/routes/` directory.

### The sequence Helper

SvelteKit provides `sequence` from `@sveltejs/kit/hooks` to chain multiple
handle functions. The host app uses this to compose Beacon's hook with their
own hooks:

```typescript
import { sequence } from '@sveltejs/kit/hooks';
import { beacon } from 'svelte-beacon/server';

export const handle = sequence(
  beacon({ enabled: true, mode: 'development' }),
  // host app's other hooks run after
);
```

Beacon's hook should be first in the sequence so it can intercept its routes
before other hooks process them. If Beacon's hook calls `resolve(event)`, the
request continues through subsequent hooks in the sequence as normal.

### The RequestEvent Object

The `event` object available in the handle hook contains:

- `event.url` — full URL object (use `.pathname`, `.searchParams`)
- `event.request` — the standard `Request` object (use `.method`, `.headers`, `.json()`, `.formData()`)
- `event.cookies` — cookie read/write API (`.get()`, `.set()`, `.delete()`)
- `event.locals` — mutable object for passing data between hooks (Beacon should not modify this unless explicitly documented)
- `event.getClientAddress()` — client's IP address
- `event.fetch` — enhanced fetch for making sub-requests
- `event.isDataRequest` — true during SvelteKit client-side data fetches

## Implementation Patterns

Read `references/routing.md` for detailed route matching, API handling,
and response construction patterns.

Read `references/middleware.md` for auth, config resolution, initialization,
and the kill switch implementation.

Read `references/streaming.md` for SSE (Server-Sent Events) patterns used
for AI log streaming.

Read `references/static-serving.md` for serving the pre-built dashboard
and attachment files from within the package.

## Architecture Rules

These rules apply to all code that runs inside or is called from the Beacon
handle hook:

1. **Fast passthrough for non-Beacon routes.** The pathname prefix check must
   be the very first operation. If the path doesn't start with `/__beacon`,
   call `resolve(event)` immediately. No database initialization, no config
   parsing, no async work. The host app's performance must not be affected.

2. **Lazy initialization.** The database connection, config resolution, and
   any other setup should happen on the first Beacon request, not when the
   handle function is created. This means the host app starts up instantly
   even if Beacon's database needs migration.

3. **Never modify event.locals unexpectedly.** The host app owns `event.locals`.
   If Beacon needs to pass data between its own middleware layers, use a
   module-scoped store or closure variables, not `event.locals`.

4. **Always return a Response.** Every Beacon route must return a `Response`
   object. Never call `resolve(event)` for a `/__beacon/*` path — that would
   try to match a SvelteKit route that doesn't exist and return a 404 from the
   host app's error page.

5. **Handle errors gracefully.** If a Beacon API handler throws, catch it and
   return a JSON error response. Never let exceptions propagate to SvelteKit's
   `handleError` hook — the host app shouldn't need to handle Beacon's errors.

6. **Respect the kill switch.** When `enabled: false`, the handle function
   must be a pure passthrough with zero overhead — no closures capturing
   database references, no conditional checks beyond the initial one.

## Quick Reference

| I need to... | Read... |
|---|---|
| Add a new API endpoint | `references/routing.md` — API route registration |
| Serve the dashboard HTML | `references/static-serving.md` — Dashboard serving |
| Add auth to a route | `references/middleware.md` — Auth middleware |
| Stream AI logs to the dashboard | `references/streaming.md` — SSE patterns |
| Serve a screenshot/attachment | `references/static-serving.md` — File serving |
| Change how config is resolved | `references/middleware.md` — Config resolution |
| Debug why a route isn't matching | `references/routing.md` — Route matching |
| Understand the initialization flow | `references/middleware.md` — Lazy init |
