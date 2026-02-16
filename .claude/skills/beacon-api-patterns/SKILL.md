---
name: beacon-api-patterns
description: >
  Patterns and conventions for writing API endpoint handlers in svelte-beacon.
  Use this skill whenever creating, modifying, or debugging any handler
  registered via the route() function, including feedback submission, task CRUD,
  auth endpoints, AI control, file serving, and the sync export API. Also use
  when working on input validation, file uploads, pagination, activity logging,
  or the data contracts between the API and the dashboard/widget clients. If you
  are touching any file inside src/server/api/, read this skill first.
---

# Beacon API Patterns

This skill covers how to write endpoint handlers inside svelte-beacon. It
complements the `sveltekit-handle-hook` skill, which covers the router
mechanics, middleware, and response helpers. This skill focuses on what goes
*inside* each handler: how to validate input, structure responses, handle
files, log activity, and maintain consistency across all endpoints.

## Relationship to Other Skills

- **sveltekit-handle-hook** owns the router, middleware, and response helpers.
  Read that skill for `route()`, `jsonResponse()`, `errorResponse()`, auth
  context, and SSE streaming.
- **This skill** owns handler internals: validation, data contracts, file
  handling, activity logging, pagination, and the endpoint catalog.
- **libsql-migrations** owns the database schema and query layer.
  Read that skill for migration authoring and query patterns.

## Handler Structure

Every handler follows the same shape. Understanding this shape means you
can write any endpoint without guessing at conventions.

```typescript
route('METHOD', '/path/:param', async (event, db, config, params, auth) => {
  // 1. Parse input (body, query params, path params)
  // 2. Validate input (return 400 if invalid)
  // 3. Check permissions (return 403 if unauthorized)
  // 4. Execute business logic (database calls, file operations)
  // 5. Log activity (for audit trail)
  // 6. Return response (consistent shape)
});
```

Each step has clear patterns. Resist the urge to combine them — a handler
that validates inside the database call or logs inside the permission check
becomes hard to reason about.

### Step 1-2: Input Parsing & Validation

Read `references/validation.md` for the validation utility, field rules for
each endpoint, and examples of good vs bad validation.

### Step 3: Permission Checks

The `auth` context is resolved by middleware before the handler runs (see
`sveltekit-handle-hook` middleware reference). Inside the handler, check
`auth.isAdmin` for admin-only operations:

```typescript
// Admin-only example
if (!auth.isAdmin) {
  return errorResponse(403, 'Admin access required');
}
```

Handlers should not re-implement auth logic. If the auth context says the
request is authenticated, trust it. If you need a new permission level,
add it to the middleware, not the handler.

### Step 4: Business Logic

Keep handlers thin. They parse input, call query functions, and return
responses. Complex logic belongs in service modules, not in the handler
itself:

```typescript
// Good — handler delegates to query function
const task = db.updateTask(params.id, { status, priority });

// Bad — handler contains raw SQL
const result = db.execute('UPDATE tasks SET status = ? WHERE id = ?', [status, params.id]);
```

### Step 5: Activity Logging

Read `references/activity.md` for the activity logging pattern, which
actions to log, and the audit trail data shape.

### Step 6: Response Shape

Read `references/contracts.md` for the response shapes of every endpoint,
including the standard envelope, pagination format, and error format.

## Endpoint Catalog

This is the complete list of API endpoints. Read `references/contracts.md`
for the full request/response contracts of each one.

### Public Endpoints (no auth required)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/feedback` | Submit feedback from widget |
| `GET` | `/config` | Widget configuration (feature flags) |
| `POST` | `/auth/magic-link` | Request a magic link email |
| `GET` | `/auth/verify` | Verify magic link token, set session |

### Protected Endpoints (auth required in deployed mode)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/tasks` | List tasks (filterable, sortable, paginated) |
| `GET` | `/tasks/:id` | Get single task with full detail |
| `PATCH` | `/tasks/:id` | Update task (status, priority, etc.) |
| `DELETE` | `/tasks/:id` | Delete task and attachments |
| `POST` | `/tasks/:id/notes` | Add admin/grooming note |
| `GET` | `/attachments/:id` | Serve screenshot or attachment file |
| `POST` | `/auth/logout` | Clear session cookie |

### Admin-Only Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/ai/start/:id` | Start Claude Code agent on task |
| `POST` | `/ai/stop/:id` | Stop running agent |
| `POST` | `/ai/unblock/:id` | Answer agent's blocked question |
| `GET` | `/ai/logs/:id` | Stream agent logs (SSE) |
| `POST` | `/ai/assist` | Widget AI description assist (proxy) |
| `GET` | `/tasks/:id/export` | Export single task for sync |
| `GET` | `/tasks/export` | Bulk export tasks for sync |

## File Handling

Read `references/file-handling.md` for file upload processing, storage paths,
size limits, allowed types, and serving patterns.

## Quick Reference

| I need to... | Read... |
|---|---|
| Write a new endpoint handler | This file (handler structure) + `references/contracts.md` |
| Validate request input | `references/validation.md` |
| Handle file uploads | `references/file-handling.md` |
| Add activity logging to an action | `references/activity.md` |
| Understand the response format | `references/contracts.md` |
| Check what endpoints exist | Endpoint catalog above |
