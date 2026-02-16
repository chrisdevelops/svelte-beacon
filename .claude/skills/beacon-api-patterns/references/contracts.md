# API Contracts

## Table of Contents

- Response envelope
- Pagination format
- Error format
- Endpoint contracts (by resource)
  - Feedback
  - Tasks
  - Admin notes
  - Auth
  - AI
  - Attachments
  - Config
  - Export/Sync

---

## Response Envelope

Beacon API responses do not use a wrapper envelope. Successful responses
return the data directly. Errors return a standard error object. The HTTP
status code is the primary indicator of success or failure.

```
Success (single item):  { id, public_id, description, ... }
Success (list):         { items: [...], pagination: {...} }
Success (no content):   (empty body, 204)
Error:                  { error: "message", fields?: {...}, details?: "..." }
```

Why no envelope: the dashboard and widget are the only clients. They know
the endpoint they called and what shape to expect. Wrapping everything in
`{ success: true, data: ... }` adds noise without value.

---

## Pagination Format

List endpoints return items with pagination metadata:

```json
{
  "items": [
    { "id": "...", "public_id": 1, "description": "..." },
    { "id": "...", "public_id": 2, "description": "..." }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 127,
    "totalPages": 3
  }
}
```

Implementation:

```typescript
interface PaginationParams {
  page: number;
  limit: number;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function paginate<T>(
  allItems: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    items: allItems,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}
```

The database query layer handles LIMIT/OFFSET. The handler passes page and
limit, gets back the items and total count, then wraps them.

---

## Error Format

All errors follow this shape:

```typescript
interface APIError {
  error: string;            // Human-readable message
  fields?: Record<string, string>;  // Per-field validation errors
  details?: string;         // Stack trace (development only)
}
```

Status codes used by Beacon:

| Status | Meaning | When |
|--------|---------|------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful DELETE, logout |
| 400 | Bad Request | Validation failure, malformed input |
| 401 | Unauthorized | Missing or expired session (deployed mode) |
| 403 | Forbidden | Authenticated but not admin for admin-only action |
| 404 | Not Found | Resource doesn't exist, or route not matched |
| 409 | Conflict | Status transition not allowed (e.g., start AI on closed task) |
| 500 | Internal Error | Unhandled exception |

---

## Endpoint Contracts

### POST /feedback

Submit feedback from the widget. Public — no auth required.

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `description` | string | yes | Max 10000 chars |
| `type` | string | yes | bug, feature, content, accessibility, performance, other |
| `priority` | string | yes | low, medium, high, critical |
| `email` | string | conditional | Required if config.widget.requireEmail |
| `route` | string | no | URL path where feedback was submitted |
| `element_selector` | string | no | CSS selector path |
| `metadata` | string (JSON) | no | Browser, viewport, dark mode, etc. |
| `screenshot` | File | no | Image file (png, jpg, webp) |
| `attachments[]` | File[] | no | Additional files |

**Response:** `201 Created`

```json
{
  "id": "uuid-string",
  "public_id": 14
}
```

**Example handler flow:**
1. Parse FormData
2. Validate all text fields
3. Conditionally require email based on config
4. Process screenshot and attachment files (see file-handling.md)
5. Generate UUID and next public_id
6. Insert task row
7. Insert attachment rows
8. Log activity: "task_created"
9. Return id and public_id

---

### GET /config

Widget configuration endpoint. Public — called on widget mount.

**Request:** No body, no params.

**Response:** `200 OK`

```json
{
  "widget": {
    "screenshot": true,
    "elementSelector": true,
    "aiAssist": false,
    "requireEmail": false,
    "position": "bottom-right"
  },
  "mode": "development"
}
```

This returns the resolved widget config so the widget knows which features
to render. The handler is trivial — it just serializes the config object.

---

### GET /tasks

List tasks with filtering, sorting, and pagination.

**Request:** Query parameters (all optional)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | string | (all) | Filter by status |
| `type` | string | (all) | Filter by type |
| `priority` | string | (all) | Filter by priority |
| `sort` | string | `created_at` | Sort column |
| `order` | string | `desc` | asc or desc |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 100) |
| `search` | string | (none) | Search description text |

**Response:** `200 OK`

```json
{
  "items": [
    {
      "id": "uuid",
      "public_id": 14,
      "type": "bug",
      "priority": "high",
      "status": "backlog",
      "description": "Login button unresponsive on mobile Safari...",
      "route": "/login",
      "user_email": "user@example.com",
      "ai_branch": null,
      "ai_pr_url": null,
      "created_at": "2025-02-15T10:30:00Z",
      "updated_at": "2025-02-15T10:30:00Z",
      "attachment_count": 2
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 3,
    "totalPages": 1
  }
}
```

Note: the list view returns a summary. Full detail (metadata, element_selector,
attachments, notes) comes from the single-task endpoint. The `attachment_count`
field lets the list UI show an icon without loading all attachments.

---

### GET /tasks/:id

Full task detail with all related data.

**Response:** `200 OK`

```json
{
  "id": "uuid",
  "public_id": 14,
  "type": "bug",
  "priority": "high",
  "status": "backlog",
  "description": "Login button unresponsive on mobile Safari...",
  "route": "/login",
  "element_selector": "form.login > button[type=submit]",
  "metadata": {
    "browser": "Safari 17",
    "os": "iOS 17.2",
    "viewport": { "width": 375, "height": 812 },
    "darkMode": false
  },
  "user_email": "user@example.com",
  "origin": "local",
  "remote_id": null,
  "ai_branch": null,
  "ai_pr_url": null,
  "ai_blocked_reason": null,
  "created_at": "2025-02-15T10:30:00Z",
  "updated_at": "2025-02-15T10:30:00Z",
  "attachments": [
    {
      "id": "att-uuid",
      "type": "screenshot",
      "filename": "screenshot-login.png",
      "mime_type": "image/png",
      "size_bytes": 145200,
      "url": "/__beacon/api/attachments/att-uuid",
      "created_at": "2025-02-15T10:30:00Z"
    }
  ],
  "admin_notes": [
    {
      "id": "note-uuid",
      "content": "Confirmed reproducible on iOS 17.2",
      "author_email": "dev@example.com",
      "created_at": "2025-02-15T11:00:00Z"
    }
  ],
  "activity": [
    {
      "id": "act-uuid",
      "actor": "system",
      "action": "task_created",
      "old_value": null,
      "new_value": null,
      "created_at": "2025-02-15T10:30:00Z"
    }
  ]
}
```

The `metadata` field is stored as JSON in the database and parsed for the
response. Attachment URLs are constructed from the attachment ID — the client
fetches the file via the attachments endpoint.

---

### PATCH /tasks/:id

Update task fields. Only provided fields are updated. At least one field
is required.

**Request:** `application/json`

```json
{
  "status": "backlog",
  "priority": "critical"
}
```

**Response:** `200 OK` — returns the full updated task (same shape as GET /tasks/:id but without attachments, notes, or activity).

**Status transition rules:**

Not all status transitions make sense. The handler should enforce valid
transitions:

```
new        → backlog, closed
backlog    → ai_working, done, closed
ai_working → blocked, needs_review, backlog (cancelled)
blocked    → ai_working (resumed), backlog (cancelled)
needs_review → done, backlog (rejected)
done       → closed, backlog (reopened)
closed     → backlog (reopened)
```

If a transition is invalid, return 409:

```json
{ "error": "Cannot transition from 'done' to 'ai_working'" }
```

---

### DELETE /tasks/:id

Delete a task and all associated data (attachments, notes, logs, activity).
Admin only.

**Response:** `204 No Content`

The handler should also delete attachment files from `.beacon/storage/`.
Database CASCADE handles the related rows.

---

### POST /tasks/:id/notes

Add an admin/grooming note to a task.

**Request:** `application/json`

```json
{
  "content": "Confirmed reproducible. The issue is in the form submission handler, not the button itself."
}
```

**Response:** `201 Created`

```json
{
  "id": "note-uuid",
  "task_id": "task-uuid",
  "content": "Confirmed reproducible...",
  "author_email": "dev@example.com",
  "created_at": "2025-02-15T11:00:00Z"
}
```

The `author_email` comes from the auth context, not the request body.

---

### POST /auth/magic-link

Request a magic link email.

**Request:** `application/json`

```json
{ "email": "dev@example.com" }
```

**Response:** `200 OK`

```json
{ "message": "Magic link sent" }
```

Always returns 200 whether the email is in the admin list or not. This
prevents email enumeration. In development mode, the magic link URL is
logged to the console instead of sent via email.

---

### GET /auth/verify

Verify a magic link token and create a session.

**Request:** Query parameter `token`

**Response:** `303 Redirect` to `/__beacon/` with session cookie set.

If the token is invalid or expired, redirect to `/__beacon/login?error=invalid`.

---

### POST /auth/logout

Clear the session.

**Response:** `204 No Content` with session cookie deleted.

---

### POST /ai/start/:id

Start the Claude Code agent on a task. Admin only.

**Request:** No body needed. The task ID in the path identifies the task.

**Response:** `200 OK`

```json
{
  "status": "started",
  "taskId": "uuid"
}
```

Returns 409 if:
- Another task is already running (`{ "error": "Another task is currently being processed" }`)
- The task status doesn't allow AI execution (not in `backlog` or `blocked`)

---

### POST /ai/stop/:id

Stop a running agent. Admin only.

**Response:** `200 OK`

```json
{ "status": "stopped" }
```

Returns 409 if no agent is running for this task.

---

### POST /ai/unblock/:id

Provide an answer to the agent's blocked question. Admin only.

**Request:** `application/json`

```json
{ "answer": "Fix the primary submit button, not the secondary." }
```

**Response:** `200 OK`

```json
{ "status": "resumed" }
```

Returns 409 if the task is not in `blocked` status.

---

### GET /ai/logs/:id

Stream agent logs via SSE. Admin only. See `sveltekit-handle-hook`
streaming reference for the SSE implementation.

**Response:** `text/event-stream`

---

### POST /ai/assist

Proxy for Anthropic API. Used by the widget's AI description assist feature.
Requires ANTHROPIC_API_KEY to be configured.

**Request:** `application/json`

```json
{
  "description": "the button doesnt work on my phone",
  "screenshot": "base64-encoded-image-data",
  "metadata": { "route": "/login", "browser": "Safari 17" }
}
```

**Response:** `200 OK`

```json
{
  "description": "The primary submit button on the login page is unresponsive when tapped on mobile Safari. The button appears visually clickable but does not trigger form submission.",
  "suggested_type": "bug",
  "suggested_priority": "high"
}
```

Returns 503 if ANTHROPIC_API_KEY is not configured.

---

### GET /attachments/:id

Serve a screenshot or attachment file. Returns the raw file with appropriate
content-type header. See `sveltekit-handle-hook` static serving reference for
the file serving implementation.

**Response:** File content with `Content-Type` matching the stored mime_type.

Returns 404 if attachment record or file doesn't exist.

---

### GET /tasks/:id/export

Export a single task with all detail and base64-encoded attachments.
Admin only. Used by `npx beacon pull`.

**Response:** `200 OK`

```json
{
  "version": 1,
  "exported_at": "2025-02-15T10:30:00Z",
  "source": "https://staging.myapp.com",
  "tasks": [
    {
      "id": "uuid",
      "public_id": 14,
      "description": "...",
      "type": "bug",
      "priority": "high",
      "status": "backlog",
      "route": "/login",
      "element_selector": "form.login > button[type=submit]",
      "metadata": { "browser": "Safari 17" },
      "admin_notes": [
        { "content": "Confirmed reproducible", "author_email": "dev@example.com" }
      ],
      "attachments": [
        {
          "filename": "screenshot-login.png",
          "type": "screenshot",
          "mime_type": "image/png",
          "data": "base64..."
        }
      ]
    }
  ]
}
```

### GET /tasks/export

Bulk export. Same response format, multiple tasks in the array. Supports
query parameters:

| Param | Type | Notes |
|-------|------|-------|
| `status` | string | Filter by status |
| `since` | string | ISO datetime — only tasks updated after this time |

---

## Status Transition Implementation

```typescript
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  new:          ['backlog', 'closed'],
  backlog:      ['ai_working', 'done', 'closed'],
  ai_working:   ['blocked', 'needs_review', 'backlog'],
  blocked:      ['ai_working', 'backlog'],
  needs_review: ['done', 'backlog'],
  done:         ['closed', 'backlog'],
  closed:       ['backlog'],
};

function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

Use this in the PATCH /tasks/:id handler before updating the status. If
the transition is invalid, return 409 with a clear message explaining
what transitions are allowed from the current status.
